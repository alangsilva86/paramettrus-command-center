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

const resolveZohoReportPath = () => {
  if (config.zoho.creatorOwner) {
    return `${config.zoho.creatorOwner}/${config.zoho.creatorApp}/report/${config.zoho.creatorReport}`;
  }
  if (config.zoho.creatorApp.includes('/')) {
    return `${config.zoho.creatorApp}/${config.zoho.creatorReport}`;
  }
  return `${config.zoho.creatorApp}/report/${config.zoho.creatorReport}`;
};

const buildZohoReportUrl = (baseDomain, path) => {
  return `${baseDomain}/creator/v2.1/data/${path}`;
};

const resolveZohoPageLimit = (limit) => {
  const maxLimit = 500;
  const requestedLimit = Number(limit || config.zoho.pageLimit || maxLimit);
  const pageLimit = Math.min(requestedLimit, maxLimit);
  if (pageLimit < 1) {
    throw new Error('ZOHO_PAGE_LIMIT inválido');
  }
  if (pageLimit !== requestedLimit) {
    logWarn('zoho', 'Limit acima do maximo permitido, ajustado para 500', { limit: pageLimit });
  }
  return pageLimit;
};

export const streamZohoReport = async function* ({
  limit,
  maxPages = Infinity,
  criteria = null,
  retryOptions = {}
} = {}) {
  let tokenResult = await getZohoAccessToken();
  let accessToken = tokenResult.accessToken;
  let baseDomain = tokenResult.apiDomain || config.zoho.apiDomain;
  const path = resolveZohoReportPath();
  let baseUrl = buildZohoReportUrl(baseDomain, path);

  const pageLimit = resolveZohoPageLimit(limit);
  logInfo('zoho', 'Buscando dados no Zoho Creator', {
    endpoint: baseUrl,
    limit: pageLimit,
    api_domain: baseDomain,
    criteria: criteria || null
  });

  const retryAttempts = Math.max(1, Number(retryOptions.attempts || 3));
  const retryShould =
    retryOptions.shouldRetry || ((error) => error?.code !== 'ZOHO_AUTH_401');
  const timeoutMs =
    Number(retryOptions.timeoutMs) ||
    (config.zoho.requestTimeoutMs ? config.zoho.requestTimeoutMs + 5000 : null);
  const retryConfig = { ...retryOptions, timeoutMs };

  let offset = 0;
  let keepGoing = true;
  let refreshed = false;
  let pageCount = 0;
  let totalCount = 0;

  while (keepGoing) {
    let response;
    try {
      response = await withRetry(
        () => requestZohoPage({ accessToken, baseUrl, offset, limit: pageLimit, criteria }),
        retryAttempts,
        retryShould,
        retryConfig
      );
    } catch (error) {
      if (error?.code === 'ZOHO_AUTH_401') {
        if (!refreshed) {
          refreshed = true;
          logWarn('zoho', '401 no report. Reautenticando e tentando novamente', { offset });
          tokenResult = await getZohoAccessToken({ force: true });
          accessToken = tokenResult.accessToken;
          baseDomain = tokenResult.apiDomain || config.zoho.apiDomain;
          baseUrl = buildZohoReportUrl(baseDomain, path);
          response = await withRetry(
            () => requestZohoPage({ accessToken, baseUrl, offset, limit: pageLimit, criteria }),
            retryAttempts,
            retryShould,
            retryConfig
          );
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
    const pageCountValue = Array.isArray(data) ? data.length : 0;
    if (Array.isArray(data) && data.length) {
      totalCount += data.length;
      yield data;
    }
    logInfo('zoho', 'Página recebida', {
      offset,
      count: pageCountValue
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

  logSuccess('zoho', 'Coleta finalizada', { total: totalCount });
};

export const fetchZohoReport = async ({ limit, maxPages = Infinity, criteria = null, retryOptions } = {}) => {
  const records = [];
  for await (const page of streamZohoReport({ limit, maxPages, criteria, retryOptions })) {
    records.push(...page);
  }
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

const runWithTimeout = async (fn, timeoutMs) => {
  const safeTimeout = Number(timeoutMs);
  if (!safeTimeout || safeTimeout <= 0) return fn();
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Timeout apos ${safeTimeout}ms`);
      error.code = 'RETRY_TIMEOUT';
      error.status = 408;
      reject(error);
    }, safeTimeout);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
};

export const createCircuitBreaker = ({
  failureThreshold = 3,
  successThreshold = 1,
  cooldownMs = 30000
} = {}) => {
  let state = 'CLOSED';
  let failureCount = 0;
  let successCount = 0;
  let nextAttemptAt = 0;

  const open = () => {
    state = 'OPEN';
    failureCount = 0;
    successCount = 0;
    nextAttemptAt = Date.now() + cooldownMs;
  };

  const close = () => {
    state = 'CLOSED';
    failureCount = 0;
    successCount = 0;
    nextAttemptAt = 0;
  };

  return {
    canRequest: () => {
      if (state === 'OPEN') {
        if (Date.now() >= nextAttemptAt) {
          state = 'HALF_OPEN';
          return true;
        }
        return false;
      }
      return true;
    },
    recordSuccess: () => {
      if (state === 'HALF_OPEN') {
        successCount += 1;
        if (successCount >= successThreshold) {
          close();
        }
        return;
      }
      failureCount = 0;
    },
    recordFailure: () => {
      if (state === 'HALF_OPEN') {
        open();
        return;
      }
      failureCount += 1;
      if (failureCount >= failureThreshold) {
        open();
      }
    },
    getState: () => state,
    getNextAttemptAt: () => nextAttemptAt
  };
};

export const withRetry = async (
  fn,
  attempts = 3,
  shouldRetry = () => true,
  options = {}
) => {
  const { timeoutMs, breaker, onRetry } = options;
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    if (breaker && breaker.canRequest && !breaker.canRequest()) {
      const error = new Error('Circuit breaker aberto');
      error.code = 'CIRCUIT_OPEN';
      error.nextAttemptAt = breaker.getNextAttemptAt ? breaker.getNextAttemptAt() : null;
      throw error;
    }
    try {
      const result = await runWithTimeout(fn, timeoutMs);
      if (breaker && breaker.recordSuccess) {
        breaker.recordSuccess();
      }
      return result;
    } catch (error) {
      lastError = error;
      if (breaker && breaker.recordFailure) {
        breaker.recordFailure(error);
      }
      if (!shouldRetry(error) || i === attempts - 1) {
        throw error;
      }
      const delay = 2 ** i * 1000;
      if (onRetry) {
        onRetry({ attempt: i + 1, delay, error });
      }
      await sleep(delay);
    }
  }
  throw lastError;
};
