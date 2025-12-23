export type QualityStatus = 'ok' | 'attention' | 'critical';
export type ExceptionSeverity = 'critical' | 'attention' | 'info';

export interface DataQualityExceptionSummary {
  type: 'unknown_seller' | 'missing_product' | 'missing_value';
  label: string;
  count: number;
  impact: number;
  severity: ExceptionSeverity;
  action_label: string;
}

export interface DataQualityResponse {
  month_ref: string;
  freshness_minutes: number | null;
  last_ingestion_at: string | null;
  ingestion_status: string;
  contracts_total: number;
  contracts_valid: number;
  contracts_invalid: number;
  contracts_incomplete: number;
  coverage_pct: number;
  quality_status: QualityStatus;
  quality_reason: string;
  exceptions: DataQualityExceptionSummary[];
}

export interface DataQualityExceptionItem {
  contract_id: string;
  segurado_nome: string;
  vendedor_id: string;
  ramo: string;
  premio: number;
  comissao_valor: number;
  impact: number;
  status: string;
  quality_flags: string[];
}

export interface ExceptionsListResponse {
  type: string;
  total: number;
  items: DataQualityExceptionItem[];
  limit: number;
  offset: number;
}

export interface SnapshotStatusResponse {
  month_ref: string;
  state: 'OPEN' | 'PROCESSING' | 'CLOSED';
  last_snapshot_at: string | null;
  lock_reason?: string | null;
  lock_source?: 'config' | 'db' | null;
  rules?: {
    rules_version_id: string;
    effective_from: string;
    meta_global_comissao: number;
    dias_uteis: number;
    created_at?: string | null;
    created_by?: string | null;
    audit_note?: string | null;
  } | null;
}
