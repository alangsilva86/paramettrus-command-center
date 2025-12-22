// --- SCHEMA 2.4.1: Raw Data ---
export interface ContractRaw {
  raw_id: string;
  source_contract_id?: string;
  payload: any;
  fetched_at: string;
}

// --- SCHEMA 2.4.2: Normalized Data ---
export interface ContractNorm {
  contract_id: string;
  cpf_cnpj: string;
  segurado_nome: string;
  vendedor_id: string;
  produto: 'Auto' | 'Residencial' | 'Vida' | 'Empresarial' | 'Outros'; // Normalized names
  ramo: 'AUTO' | 'VIDA' | 'RESID' | 'EMP' | 'OUTROS';
  seguradora: string;
  data_efetivacao: string; // ISO Date
  inicio: string;
  termino: string;
  status: 'vigente' | 'cancelado' | 'pendente';
  premio: number;
  comissao_pct: number;
  comissao_valor: number;
  is_monoproduto: boolean;
  row_hash: string;
}

// --- SCHEMA 2.4.4: Rules Version ---
export interface RulesVersion {
  rules_version_id: string;
  effective_from: string;
  meta_global_comissao: number;
  dias_uteis: number;
  product_weights: Record<string, number>;
  bonus_events: {
    cross_sell: number;
    combo_breaker: number;
    salvamento_d5: number;
  };
}

// --- SCHEMA 2.4.5: XP Ledger ---
export interface XpLedgerEntry {
  ledger_id: string;
  contract_id: string;
  vendedor_id: string;
  rules_version_id: string;
  xp_base: number;
  xp_bonus: number;
  xp_total: number;
  reasons: string[]; // e.g., ['CROSS_SELL', 'COMBO_BREAKER']
  calculated_at: string;
}

// --- API SNAPSHOT PAYLOAD (Section 2.6) ---
export interface DashboardSnapshot {
  month: string;
  kpis: {
    meta_comissao: number;
    comissao_mtd: number;
    pct_meta: number;
    forecast_comissao: number; // RN01
    forecast_pct_meta: number;
    gap_diario: number;
    auto_share_comissao: number;
    monoproduto_pct: number;
  };
  renewals: {
    d7: { count: number; comissao_risco: number };
    d15: { count: number; comissao_risco: number };
  };
  leaderboard: LeaderboardEntry[];
  radar: {
    bubble_products: RadarProductBubble[];
    top_insurer_share: number;
  };
}

export interface LeaderboardEntry {
  vendedor_id: string;
  xp: number;
  comissao: number;
  sales_count: number;
  badges: string[]; // 'DEFENSOR', 'COMBO', etc.
}

export interface RadarProductBubble {
  ramo: string;
  comissao_total: number; // X Axis
  comissao_pct_avg: number; // Y Axis
  premio_total: number; // Size (Z Axis)
  retencao_proxy: number; // Color context
}

export interface RenewalListItem {
  contract_id: string;
  segurado_nome: string;
  vendedor_id: string;
  termino: string;
  comissao_valor: number;
  days_to_end: number;
}

export interface CrossSellSummary {
  totalCustomers: number;
  monoprodutoPct: number;
  autoVidaCount: number;
  autoSemVidaCount: number;
  autoSemVida: Array<{
    cpf_cnpj: string;
    segurado_nome: string;
    comissao_total: number;
    premio_total: number;
  }>;
}

export interface StatusResponse {
  status: string;
  last_ingestion_at: string | null;
  stale_data: boolean;
}
