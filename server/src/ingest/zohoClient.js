import axios from 'axios';
import { config } from '../config.js';

const TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const getZohoAccessToken = async () => {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.zoho.clientId,
    client_secret: config.zoho.clientSecret,
    refresh_token: config.zoho.refreshToken
  });
  const response = await axios.post(TOKEN_URL, params);
  return response.data.access_token;
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
  const records = [];
  let page = 1;
  let keepGoing = true;

  while (keepGoing) {
    const response = await axios.get(baseUrl, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        Accept: 'application/json'
      },
      params: {
        page,
        limit
      }
    });

    const data = response.data?.data || response.data?.records || [];
    if (Array.isArray(data)) {
      records.push(...data);
    }
    if (!Array.isArray(data) || data.length < limit) {
      keepGoing = false;
    } else {
      page += 1;
    }
  }

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
