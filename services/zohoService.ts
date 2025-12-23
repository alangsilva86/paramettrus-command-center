import {
  AdminIngestResponse,
  AdminHealthResponse,
  AdminMonthStatusResponse,
  AdminRulesCreateResponse,
  CrossSellSummary,
  DashboardSnapshot,
  SnapshotCompare,
  RenewalListItem,
  RulesVersionItem,
  StatusResponse
} from '../types';
import {
  DataQualityResponse,
  ExceptionsListResponse,
  SnapshotStatusResponse
} from '../src/types/ops';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

const parseErrorMessage = async (response: Response, fallback: string) => {
  const status = response.status;
  let message = fallback;
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error || parsed?.message || parsed?.status || text || fallback;
    } catch (_error) {
      message = text;
    }
  }
  if (status === 401 || status === 403) {
    return 'Token expirado ou inválido.';
  }
  return message || fallback;
};

export const fetchDashboardSnapshot = async (
  monthRef: string,
  filters?: { vendorId?: string; ramo?: string }
): Promise<DashboardSnapshot> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef });
  if (filters?.vendorId) params.set('vendedor_id', filters.vendorId);
  if (filters?.ramo) params.set('ramo', filters.ramo);
  const response = await fetch(`${API_BASE}/api/snapshots/month?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar snapshot'));
  }
  return response.json();
};

export const fetchScenarioSnapshot = async (
  monthRef: string,
  scenarioId: string,
  rulesVersionId?: string,
  adminToken?: string,
  actor?: string
): Promise<DashboardSnapshot> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef, scenario_id: scenarioId, force_reprocess: 'true' });
  if (rulesVersionId) params.set('rules_version_id', rulesVersionId);
  const response = await fetch(`${API_BASE}/api/snapshots/month?${params.toString()}`, {
    headers: buildAdminHeaders(adminToken, actor)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao simular cenário'));
  }
  return response.json();
};

export const fetchRenewalList = async (
  windowDays: number,
  filters?: { vendorId?: string; ramo?: string }
): Promise<RenewalListItem[]> => {
  const params = new URLSearchParams({ window: String(windowDays) });
  if (filters?.vendorId) params.set('vendedor_id', filters.vendorId);
  if (filters?.ramo) params.set('ramo', filters.ramo);
  const response = await fetch(`${API_BASE}/api/renewals/list?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar renovações'));
  }
  const payload = await response.json();
  return payload.items || [];
};

export const fetchCrossSellSummary = async (
  filters?: { vendorId?: string; ramo?: string }
): Promise<CrossSellSummary> => {
  const params = new URLSearchParams();
  if (filters?.vendorId) params.set('vendedor_id', filters.vendorId);
  if (filters?.ramo) params.set('ramo', filters.ramo);
  const response = await fetch(
    `${API_BASE}/api/cross-sell/auto-sem-vida${params.toString() ? `?${params.toString()}` : ''}`
  );
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar cross-sell'));
  }
  return response.json();
};

export const fetchStatus = async (): Promise<StatusResponse> => {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar status'));
  }
  return response.json();
};

export const fetchSnapshotCompare = async (
  monthRef: string,
  scenarioId: string
): Promise<SnapshotCompare> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef, scenario_id: scenarioId });
  const response = await fetch(`${API_BASE}/api/snapshots/compare?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao comparar cenários'));
  }
  return response.json();
};

export const fetchScenarioHistory = async (monthRef: string): Promise<DashboardSnapshot[]> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef });
  const response = await fetch(`${API_BASE}/api/snapshots/scenarios?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar histórico de cenários'));
  }
  const payload = await response.json();
  return payload.items || [];
};

const buildAdminHeaders = (token?: string, actor?: string) => {
  const headers: Record<string, string> = {};
  if (token) headers['x-admin-token'] = token;
  if (actor) headers['x-user-id'] = actor;
  return headers;
};

export const listRulesVersions = async (adminToken?: string): Promise<RulesVersionItem[]> => {
  const response = await fetch(`${API_BASE}/api/admin/rules_versions`, {
    headers: buildAdminHeaders(adminToken)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar regras'));
  }
  const payload = await response.json();
  return payload.items || [];
};

export const createRulesVersion = async (
  payload: Record<string, unknown>,
  adminToken?: string,
  actor?: string
): Promise<AdminRulesCreateResponse> => {
  const response = await fetch(`${API_BASE}/api/admin/rules_versions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminToken, actor)
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao publicar regra'));
  }
  return response.json();
};

export const triggerIngestion = async (
  adminToken?: string,
  actor?: string
): Promise<AdminIngestResponse> => {
  const response = await fetch(`${API_BASE}/api/admin/ingest`, {
    method: 'POST',
    headers: buildAdminHeaders(adminToken, actor)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao sincronizar dados'));
  }
  return response.json();
};

export const fetchZohoHealth = async (
  adminToken?: string,
  actor?: string
): Promise<AdminHealthResponse> => {
  const response = await fetch(`${API_BASE}/api/admin/zoho/health`, {
    headers: buildAdminHeaders(adminToken, actor)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao testar conexões'));
  }
  return response.json();
};

export const fetchMonthStatus = async (
  monthRef: string,
  adminToken?: string
): Promise<AdminMonthStatusResponse> => {
  const params = new URLSearchParams({ month_ref: monthRef });
  const response = await fetch(`${API_BASE}/api/admin/month-status?${params.toString()}`, {
    headers: buildAdminHeaders(adminToken)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao consultar bloqueio do mês'));
  }
  return response.json();
};

export const simulateScenarioDraft = async (
  monthRef: string,
  scenarioId: string,
  rulesPayload: Record<string, unknown>,
  adminToken?: string,
  actor?: string
): Promise<DashboardSnapshot> => {
  const response = await fetch(`${API_BASE}/api/admin/scenarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAdminHeaders(adminToken, actor)
    },
    body: JSON.stringify({
      month_ref: monthRef,
      scenario_id: scenarioId,
      rules_payload: rulesPayload
    })
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao simular cenário'));
  }
  return response.json();
};

export const reprocessSnapshot = async (
  monthRef: string,
  rulesVersionId?: string,
  adminToken?: string,
  actor?: string
): Promise<DashboardSnapshot> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef, force_reprocess: 'true' });
  if (rulesVersionId) params.set('rules_version_id', rulesVersionId);
  const response = await fetch(`${API_BASE}/api/snapshots/month?${params.toString()}`, {
    headers: buildAdminHeaders(adminToken, actor)
  });
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao reprocessar mês'));
  }
  return response.json();
};

export const fetchDataQuality = async (monthRef: string): Promise<DataQualityResponse> => {
  const params = new URLSearchParams({ month_ref: monthRef });
  const response = await fetch(`${API_BASE}/api/status/data-quality?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar qualidade dos dados'));
  }
  return response.json();
};

export const fetchExceptionsList = async (
  monthRef: string,
  type: string,
  limit = 20,
  offset = 0
): Promise<ExceptionsListResponse> => {
  const params = new URLSearchParams({
    month_ref: monthRef,
    type,
    limit: String(limit),
    offset: String(offset)
  });
  const response = await fetch(`${API_BASE}/api/status/exceptions?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar exceções'));
  }
  return response.json();
};

export const fetchSnapshotStatus = async (monthRef: string): Promise<SnapshotStatusResponse> => {
  const params = new URLSearchParams({ month_ref: monthRef });
  const response = await fetch(`${API_BASE}/api/snapshots/status?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, 'Falha ao carregar status do mês'));
  }
  return response.json();
};
