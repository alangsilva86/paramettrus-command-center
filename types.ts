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

export interface RulesVersionItem extends RulesVersion {
  effective_to?: string | null;
  penalties?: Record<string, unknown>;
  created_by?: string | null;
  created_at?: string;
  audit_note?: string | null;
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
  scenario_id?: string | null;
  rules_version_id?: string | null;
  created_at?: string | null;
  snapshot_version?: number;
  money_unit?: 'centavos' | 'reais';
  data_coverage: DataCoverage;
  filters: {
    vendors: string[];
    ramos: string[];
  };
  kpis: {
    meta_comissao: number;
    comissao_mtd: number;
    premio_mtd: number;
    ticket_medio: number;
    margem_media_pct: number;
    pct_meta: number;
    forecast_comissao: number; // RN01
    forecast_pct_meta: number;
    gap_diario: number;
    auto_share_comissao: number;
    monoproduto_pct: number;
    mom_comissao_pct: number;
    yoy_comissao_pct: number;
    mom_premio_pct: number;
    yoy_premio_pct: number;
    mom_margem_pct: number;
    yoy_margem_pct: number;
    mom_ticket_pct: number;
    yoy_ticket_pct: number;
  };
  trend_daily: Array<{
    date: string;
    comissao: number;
    premio: number;
  }>;
  renewals: {
    d7: { count: number; comissao_risco: number };
    d15: { count: number; comissao_risco: number };
    d30: { count: number; comissao_risco: number };
  };
  leaderboard: LeaderboardEntry[];
  vendor_stats: VendorStat[];
  radar: {
    bubble_products: RadarProductBubble[];
    top_insurer_share: number;
  };
  mix: {
    products: MixProductItem[];
    insurers: MixInsurerItem[];
    matrix: MixMatrixItem[];
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
  owner?: string;
  stage?: string;
  renewal_probability?: number;
  impact_score?: number;
}

export interface CrossSellSummary {
  totalCustomers: number;
  monoprodutoCount: number;
  multiProdutoCount: number;
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

export interface AdminIngestResponse {
  status: string;
  run_id?: string;
  error?: string;
}

export interface AdminRulesCreateResponse {
  rules_version_id: string;
  status: string;
}

export interface DataCoverage {
  contracts_total: number;
  contracts_valid: number;
  contracts_invalid: number;
  contracts_incomplete: number;
  valid_pct: number;
  sources: Array<{ source: string; count: number }>;
  last_ingestion_at: string | null;
  ingestion_status: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MixProductItem {
  ramo: string;
  comissao_total: number;
  premio_total: number;
  margem_pct: number;
  share_comissao: number;
  share_premio: number;
  mom_comissao_pct: number;
  mom_share_delta: number;
  risk_pct: number;
}

export interface MixInsurerItem {
  seguradora: string;
  comissao_total: number;
  premio_total: number;
  margem_pct: number;
  share_comissao: number;
  mom_comissao_pct: number;
  mom_share_delta: number;
}

export interface MixMatrixItem {
  ramo: string;
  quadrant: 'HIGH_MARGIN_HIGH_VOLUME' | 'HIGH_MARGIN_LOW_VOLUME' | 'LOW_MARGIN_HIGH_VOLUME' | 'LOW_MARGIN_LOW_VOLUME';
  margem_pct: number;
  volume_share: number;
  risk_pct: number;
}

export interface VendorStat {
  vendedor_id: string;
  xp: number;
  comissao: number;
  premio: number;
  sales_count: number;
  growth_mom_pct: number;
  gap_comissao: number;
  gap_diario: number;
  top_opportunities: Array<{
    contract_id: string;
    segurado_nome: string;
    comissao_valor: number;
    days_to_end: number;
    stage?: string;
    impact_score?: number;
  }>;
}

export interface SnapshotCompare {
  base: DashboardSnapshot;
  scenario: DashboardSnapshot;
  delta: {
    kpis: Record<string, number>;
    ranking: Array<{
      vendedor_id: string;
      base_rank: number | null;
      scenario_rank: number | null;
      rank_delta: number | null;
    }>;
    mix: Array<{
      ramo: string;
      share_delta: number;
    }>;
  };
}
