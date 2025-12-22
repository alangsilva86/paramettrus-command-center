import dotenv from 'dotenv';

dotenv.config();

const required = (key, fallback = undefined) => {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
};

export const config = {
  env: process.env.APP_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  apiBaseUrl: process.env.API_BASE_URL || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  scheduler: {
    enabled: process.env.ENABLE_SCHEDULER === 'true',
    cron: process.env.INGEST_CRON || '0 * * * *'
  },
  zoho: {
    clientId: required('ZOHO_CLIENT_ID', 'missing'),
    clientSecret: required('ZOHO_CLIENT_SECRET', 'missing'),
    refreshToken: required('ZOHO_REFRESH_TOKEN', 'missing'),
    apiDomain: process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com',
    creatorOwner: process.env.ZOHO_CREATOR_OWNER || '',
    creatorApp: process.env.ZOHO_CREATOR_APP || 'corretora_paramettrus',
    creatorReport: process.env.ZOHO_CREATOR_REPORT || 'Contratos_Report'
  },
  ingest: {
    renewalGraceDays: Number(process.env.RENEWAL_GRACE_DAYS || 30),
    defaultCurveId: process.env.DEFAULT_CURVE_ID || 'curve_default',
    lockedMonths: (process.env.LOCKED_MONTHS || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  },
  zohoFields: {
    contractId: process.env.ZOHO_FIELD_CONTRACT_ID || 'contract_id',
    cpfCnpj: process.env.ZOHO_FIELD_CPF_CNPJ || 'cpf_cnpj',
    seguradoNome: process.env.ZOHO_FIELD_SEGURADO_NOME || 'segurado_nome',
    vendedorId: process.env.ZOHO_FIELD_VENDEDOR_ID || 'vendedor_id',
    produto: process.env.ZOHO_FIELD_PRODUTO || 'produto',
    seguradora: process.env.ZOHO_FIELD_SEGURADORA || 'seguradora',
    cidade: process.env.ZOHO_FIELD_CIDADE || 'cidade',
    dataEfetivacao: process.env.ZOHO_FIELD_DATA_EFETIVACAO || 'data_efetivacao',
    inicio: process.env.ZOHO_FIELD_INICIO || 'inicio',
    termino: process.env.ZOHO_FIELD_TERMINO || 'termino',
    premio: process.env.ZOHO_FIELD_PREMIO || 'premio',
    comissaoValor: process.env.ZOHO_FIELD_COMISSAO_VALOR || 'comissao_valor',
    comissaoPct: process.env.ZOHO_FIELD_COMISSAO_PCT || 'comissao_pct'
  }
};
