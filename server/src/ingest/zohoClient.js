import axios from 'axios';
import { config } from '../config.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildTokenUrl = () => `https://${config.zoho.accountsDomain}/oauth/v2/token`;

let tokenCache = null;
let tokenPromise = null;

export const getZohoAccessToken = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && tokenCache && tokenCache.expiresAt && tokenCache.expiresAt > now + 60_000) {
    return {
      accessToken: tokenCache.accessToken,
      apiDomain: tokenCache.apiDomain || null
    };
  }
  if (!force && tokenPromise) {
    return tokenPromise;
  }
  tokenPromise = (async () => {
    logInfo('zoho', 'Pedindo token ao Zoho OAuth');
    const params = {
      grant_type: 'refresh_token',
      client_id: config.zoho.clientId,
      client_secret: config.zoho.clientSecret,
      refresh_token: config.zoho.refreshToken
    };
    try {
      const response = await axios.post(buildTokenUrl(), null, { params });
      const expiresIn = Number(response.data?.expires_in || 0);
      const expiresAt = expiresIn > 0 ? now + expiresIn * 1000 : now + 55 * 60 * 1000;
      tokenCache = {
        accessToken: response.data.access_token,
        apiDomain: response.data.api_domain || null,
        expiresAt
      };
      logSuccess('zoho', 'Token recebido com sucesso');
      return {
        accessToken: tokenCache.accessToken,
        apiDomain: tokenCache.apiDomain
      };
    } catch (error) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.error_description || error?.message;
      logError('zoho', 'Falha ao obter token', { status, detail });
      throw error;
    } finally {
      tokenPromise = null;
    }
  })();
  return tokenPromise;
};

const requestZohoPage = async ({ accessToken, baseUrl, offset, limit, criteria }) => {
  try {
    return await axios.get(baseUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        Accept: 'application/json'
      },
      params: {
        from: offset,
        limit,
        ...(criteria ? { criteria } : {})
      },
      timeout: config.zoho.requestTimeoutMs
    });
  } catch (error) {
    const status = error?.response?.status;
    const detail =
      error?.response?.data?.message ||
      error?.response?.data?.description ||
      error?.message;
    const noRecords =
      status === 400 &&
      typeof detail === 'string' &&
      detail.toLowerCase().includes('no records found');
    if (noRecords) {
      logInfo('zoho', 'Nenhum registro para criteria', { offset, criteria });
      return {
        data: {
          code: 3000,
          data: []
        }
      };
    }
    if (status === 401) {
      const authError = new Error('Zoho report unauthorized');
      authError.code = 'ZOHO_AUTH_401';
      authError.status = status;
      authError.detail = detail;
      throw authError;
    }
    logWarn('zoho', 'Resposta inesperada do Zoho Creator', { status, detail, offset });
    throw error;
  }
};

export const fetchZohoReport = async ({ limit, maxPages = Infinity, criteria = null } = {}) => {
  let tokenResult = await getZohoAccessToken();
  let accessToken = tokenResult.accessToken;
  let baseDomain = tokenResult.apiDomain || config.zoho.apiDomain;
  let base = `${baseDomain}/creator/v2.1/data`;
  let path = '';

  if (config.zoho.creatorOwner) {
    path = `${config.zoho.creatorOwner}/${config.zoho.creatorApp}/report/${config.zoho.creatorReport}`;
  } else if (config.zoho.creatorApp.includes('/')) {
    path = `${config.zoho.creatorApp}/${config.zoho.creatorReport}`;
  } else {
    path = `${config.zoho.creatorApp}/report/${config.zoho.creatorReport}`;
  }

  let baseUrl = `${base}/${path}`;
  const maxLimit = 500;
  const pageLimit = Math.min(
    Number(limit || config.zoho.pageLimit || maxLimit),
    maxLimit
  );
  if (pageLimit < 1) {
    throw new Error('ZOHO_PAGE_LIMIT inválido');
  }
  if (pageLimit !== Number(limit || config.zoho.pageLimit || maxLimit)) {
    logWarn('zoho', 'Limit acima do maximo permitido, ajustado para 500', { limit: pageLimit });
  }
  logInfo('zoho', 'Buscando dados no Zoho Creator', {
    endpoint: baseUrl,
    limit: pageLimit,
    api_domain: baseDomain,
    criteria: criteria || null
  });
  const records = [];
  let offset = 0;
  let keepGoing = true;
  let refreshed = false;
  let pageCount = 0;

  while (keepGoing) {
    let response;
    try {
      response = await requestZohoPage({ accessToken, baseUrl, offset, limit: pageLimit, criteria });
    } catch (error) {
      if (error?.code === 'ZOHO_AUTH_401') {
        if (!refreshed) {
          refreshed = true;
          logWarn('zoho', '401 no report. Reautenticando e tentando novamente', { offset });
          tokenResult = await getZohoAccessToken({ force: true });
          accessToken = tokenResult.accessToken;
          baseDomain = tokenResult.apiDomain || config.zoho.apiDomain;
          base = `${baseDomain}/creator/v2.1/data`;
          baseUrl = `${base}/${path}`;
          response = await requestZohoPage({ accessToken, baseUrl, offset, limit: pageLimit, criteria });
        } else {
          logError('zoho', '401 persistente apos refresh', { offset });
          const authError = new Error('Zoho report unauthorized after refresh');
          authError.code = 'ZOHO_AUTH_401';
          authError.status = 401;
          throw authError;
        }
      } else {
        throw error;
      }
    }

    const responseCode = response.data?.code;
    if (responseCode && responseCode !== 3000) {
      const description = response.data?.description || response.data?.message || 'Erro Zoho';
      logWarn('zoho', 'Zoho retornou erro de negocio', {
        code: responseCode,
        description
      });
      throw new Error(`Zoho error ${responseCode}: ${description}`);
    }

    const data = response.data?.data || response.data?.records || [];
    if (Array.isArray(data)) {
      records.push(...data);
    }
    logInfo('zoho', 'Página recebida', {
      offset,
      count: Array.isArray(data) ? data.length : 0
    });
    pageCount += 1;
    if (pageCount >= maxPages) {
      keepGoing = false;
      break;
    }
    if (!Array.isArray(data) || data.length < pageLimit) {
      keepGoing = false;
    } else {
      offset += pageLimit;
    }
  }

  logSuccess('zoho', 'Coleta finalizada', { total: records.length });
  return records;
};

export const probeZohoReport = async () => {
  const data = await fetchZohoReport({ limit: 1, maxPages: 1 });
  const sample = Array.isArray(data) && data.length > 0 ? data[0] : null;
  return {
    count: Array.isArray(data) ? data.length : 0,
    sample_id: sample?.ID || sample?.id || null
  };
};

export const withRetry = async (fn, attempts = 3, shouldRetry = () => true) => {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!shouldRetry(error) || i === attempts - 1) {
        throw error;
      }
      const delay = 2 ** i * 1000;
      await sleep(delay);
    }
  }
  throw lastError;
};
