import axios from 'axios';
import { config } from '../config.js';
import { logError, logInfo, logSuccess, logWarn } from '../utils/logger.js';

const TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getZohoAccessToken = async () => {
  logInfo('zoho', 'Pedindo token ao Zoho OAuth');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.zoho.clientId,
    client_secret: config.zoho.clientSecret,
    refresh_token: config.zoho.refreshToken
  });
  try {
    const response = await axios.post(TOKEN_URL, params);
    logSuccess('zoho', 'Token recebido com sucesso');
    return response.data.access_token;
  } catch (error) {
    const status = error?.response?.status;
    const detail = error?.response?.data?.error_description || error?.message;
    logError('zoho', 'Falha ao obter token', { status, detail });
    throw error;
  }
};

export const fetchZohoReport = async ({ limit = 200 } = {}) => {
  const token = await getZohoAccessToken();
  const base = `${config.zoho.apiDomain}/creator/v2.1/data`;
  let path = '';

  if (config.zoho.creatorOwner) {
    path = `${config.zoho.creatorOwner}/${config.zoho.creatorApp}/report/${config.zoho.creatorReport}`;
  } else if (config.zoho.creatorApp.includes('/')) {
    path = `${config.zoho.creatorApp}/${config.zoho.creatorReport}`;
  } else {
    path = `${config.zoho.creatorApp}/report/${config.zoho.creatorReport}`;
  }

  const baseUrl = `${base}/${path}`;
  logInfo('zoho', 'Buscando dados no Zoho Creator', { endpoint: baseUrl });
  const records = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    let response;
    try {
      response = await axios.get(baseUrl, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: 'application/json'
        },
        params: {
          page,
          limit
        }
      });
    } catch (error) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.message || error?.message;
      logWarn('zoho', 'Resposta inesperada do Zoho Creator', { status, detail, page });
      throw error;
    }

    const data = response.data?.data || response.data?.records || [];
    if (Array.isArray(data)) {
      records.push(...data);
    }
    logInfo('zoho', 'Página recebida', { page, count: Array.isArray(data) ? data.length : 0 });
    if (!Array.isArray(data) || data.length < limit) {
      keepGoing = false;
    } else {
      page += 1;
    }
  }

  logSuccess('zoho', 'Coleta finalizada', { total: records.length });
  return records;
};

export const withRetry = async (fn, attempts = 3) => {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = 2 ** i * 1000;
      await sleep(delay);
    }
  }
  throw lastError;
};
