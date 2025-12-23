import {
  AdminIngestResponse,
  AdminRulesCreateResponse,
  CrossSellSummary,
  DashboardSnapshot,
  SnapshotCompare,
  RenewalListItem,
  RulesVersionItem,
  StatusResponse
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const fetchDashboardSnapshot = async (
  monthRef: string,
  filters?: { vendorId?: string; ramo?: string }
): Promise<DashboardSnapshot> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef });
  if (filters?.vendorId) params.set('vendedor_id', filters.vendorId);
  if (filters?.ramo) params.set('ramo', filters.ramo);
  const response = await fetch(`${API_BASE}/api/snapshots/month?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Falha ao carregar snapshot');
  }
  return response.json();
};

export const fetchScenarioSnapshot = async (
  monthRef: string,
  scenarioId: string,
  rulesVersionId?: string
): Promise<DashboardSnapshot> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef, scenario_id: scenarioId, force_reprocess: 'true' });
  if (rulesVersionId) params.set('rules_version_id', rulesVersionId);
  const response = await fetch(`${API_BASE}/api/snapshots/month?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Falha ao simular cenário');
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
    throw new Error('Falha ao carregar renovações');
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
    throw new Error('Falha ao carregar cross-sell');
  }
  return response.json();
};

export const fetchStatus = async (): Promise<StatusResponse> => {
  const response = await fetch(`${API_BASE}/api/status`);
  if (!response.ok) {
    throw new Error('Falha ao carregar status');
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
    throw new Error('Falha ao comparar cenários');
  }
  return response.json();
};

export const fetchScenarioHistory = async (monthRef: string): Promise<DashboardSnapshot[]> => {
  const params = new URLSearchParams({ yyyy_mm: monthRef });
  const response = await fetch(`${API_BASE}/api/snapshots/scenarios?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Falha ao carregar histórico de cenários');
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
    throw new Error('Falha ao carregar rules versions');
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Falha ao criar rules version');
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
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || 'Falha ao rodar ingestão');
  }
  return response.json();
};
