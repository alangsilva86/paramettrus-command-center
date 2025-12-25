CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2.4.1 contracts_raw
CREATE TABLE IF NOT EXISTS contracts_raw (
  raw_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_contract_id TEXT,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4.2 contracts_norm
CREATE TABLE IF NOT EXISTS contracts_norm (
  contract_id TEXT PRIMARY KEY,
  cpf_cnpj TEXT,
  segurado_nome TEXT,
  vendedor_id TEXT,
  produto TEXT,
  ramo TEXT,
  seguradora TEXT,
  cidade TEXT,
  data_efetivacao DATE,
  inicio DATE,
  termino DATE,
  status TEXT,
  premio NUMERIC(14,0), -- stored in centavos
  comissao_pct NUMERIC(8,4),
  comissao_valor NUMERIC(14,0), -- stored in centavos
  added_time TIMESTAMPTZ,
  modified_time TIMESTAMPTZ,
  zoho_record_id TEXT,
  zoho_modified_time TIMESTAMPTZ,
  row_hash TEXT NOT NULL,
  dedup_group TEXT NOT NULL,
  is_synthetic_id BOOLEAN NOT NULL DEFAULT FALSE,
  is_incomplete BOOLEAN NOT NULL DEFAULT FALSE,
  is_invalid BOOLEAN NOT NULL DEFAULT FALSE,
  quality_flags TEXT[],
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  month_ref TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE contracts_norm ADD COLUMN IF NOT EXISTS added_time TIMESTAMPTZ;
ALTER TABLE contracts_norm ADD COLUMN IF NOT EXISTS modified_time TIMESTAMPTZ;
ALTER TABLE contracts_norm ADD COLUMN IF NOT EXISTS quality_flags TEXT[];
ALTER TABLE contracts_norm ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE contracts_norm ADD COLUMN IF NOT EXISTS zoho_record_id TEXT;
ALTER TABLE contracts_norm ADD COLUMN IF NOT EXISTS zoho_modified_time TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contracts_norm_month ON contracts_norm (month_ref);
CREATE INDEX IF NOT EXISTS idx_contracts_norm_rowhash ON contracts_norm (row_hash, month_ref);
CREATE INDEX IF NOT EXISTS idx_contracts_norm_cpf ON contracts_norm (cpf_cnpj);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_norm_zoho_record ON contracts_norm (zoho_record_id);

-- 2.4.3 customers
CREATE TABLE IF NOT EXISTS customers (
  cpf_cnpj TEXT PRIMARY KEY,
  first_seen_at DATE,
  last_seen_at DATE,
  active_products TEXT[],
  distinct_ramos_count INT NOT NULL DEFAULT 0,
  is_monoproduto BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2.4.4 rules_versions
CREATE TABLE IF NOT EXISTS rules_versions (
  rules_version_id TEXT PRIMARY KEY,
  effective_from DATE NOT NULL,
  effective_to DATE,
  meta_global_comissao NUMERIC(14,2) NOT NULL,
  dias_uteis INT NOT NULL,
  product_weights JSONB NOT NULL,
  bonus_events JSONB NOT NULL,
  penalties JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  audit_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_rules_versions_effective ON rules_versions (effective_from);

-- 2.4.5 xp_ledger
CREATE TABLE IF NOT EXISTS xp_ledger (
  ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL,
  cpf_cnpj TEXT,
  vendedor_id TEXT,
  rules_version_id TEXT NOT NULL,
  xp_base NUMERIC(14,2) NOT NULL,
  xp_bonus NUMERIC(14,2) NOT NULL,
  xp_total NUMERIC(14,2) NOT NULL,
  reasons TEXT[],
  calculated_at TIMESTAMPTZ NOT NULL,
  calc_hash TEXT NOT NULL,
  month_ref TEXT NOT NULL,
  supersedes_ledger_id UUID,
  is_scenario BOOLEAN NOT NULL DEFAULT FALSE,
  scenario_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_xp_ledger_month ON xp_ledger (month_ref);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_vendor ON xp_ledger (vendedor_id, month_ref);

-- 2.4.6 renewal_actions
CREATE TABLE IF NOT EXISTS renewal_actions (
  action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id TEXT NOT NULL,
  vendedor_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_renewal_actions_contract ON renewal_actions (contract_id);

-- 2.4.7 month_curve
CREATE TABLE IF NOT EXISTS month_curve (
  curve_id TEXT NOT NULL,
  day INT NOT NULL,
  cum_share NUMERIC(6,4) NOT NULL,
  PRIMARY KEY (curve_id, day)
);

-- snapshots_month (cache)
CREATE TABLE IF NOT EXISTS snapshots_month (
  snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_ref TEXT NOT NULL,
  scenario_id TEXT,
  rules_version_id TEXT NOT NULL,
  data JSONB NOT NULL,
  is_scenario BOOLEAN NOT NULL DEFAULT FALSE,
  stale_data BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_month ON snapshots_month (month_ref, scenario_id);

-- ingestion runs
CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  fetched_count INT NOT NULL DEFAULT 0,
  inserted_norm_count INT NOT NULL DEFAULT 0,
  duplicates_count INT NOT NULL DEFAULT 0,
  error TEXT,
  details JSONB
);

-- audit logs
CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  actor TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- month locks
CREATE TABLE IF NOT EXISTS month_locks (
  month_ref TEXT PRIMARY KEY,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  reason TEXT
);
