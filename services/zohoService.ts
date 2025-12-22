import { CrossSellSummary, DashboardSnapshot, RenewalListItem, StatusResponse } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export const fetchDashboardSnapshot = async (monthRef: string): Promise<DashboardSnapshot> => {
  const response = await fetch(`${API_BASE}/api/snapshots/month?yyyy_mm=${encodeURIComponent(monthRef)}`);
  if (!response.ok) {
    throw new Error('Falha ao carregar snapshot');
  }
  return response.json();
};

export const fetchRenewalList = async (windowDays: number): Promise<RenewalListItem[]> => {
  const response = await fetch(`${API_BASE}/api/renewals/list?window=${windowDays}`);
  if (!response.ok) {
    throw new Error('Falha ao carregar renovações');
  }
  const payload = await response.json();
  return payload.items || [];
};

export const fetchCrossSellSummary = async (): Promise<CrossSellSummary> => {
  const response = await fetch(`${API_BASE}/api/cross-sell/auto-sem-vida`);
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
