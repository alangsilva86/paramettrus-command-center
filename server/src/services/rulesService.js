import { query } from '../db.js';
import { formatDate, toDateOnly } from '../utils/date.js';

const DEFAULT_RULES = {
  rules_version_id: 'v2025_12_01_001',
  effective_from: '2025-12-01',
  effective_to: null,
  meta_global_comissao: 170000,
  dias_uteis: 22,
  product_weights: {
    AUTO: 1.0,
    VIDA: 2.0,
    RESID: 1.8,
    EMP: 1.6,
    COND: 1.2,
    OUTROS: 1.0
  },
  bonus_events: {
    cross_sell: 500,
    combo_breaker: 800,
    salvamento_d5: 600
  },
  penalties: {
    churn_lock_xp: true
  }
};

const buildRulesVersionId = async (effectiveFrom) => {
  const ref = effectiveFrom.replace(/-/g, '_');
  const result = await query(
    'SELECT COUNT(*)::int AS total FROM rules_versions WHERE effective_from = $1',
    [effectiveFrom]
  );
  const seq = String(result.rows[0]?.total + 1).padStart(3, '0');
  return `v${ref}_${seq}`;
};

export const getRulesVersionForDate = async (date) => {
  const effective = formatDate(date);
  const result = await query(
    `SELECT *
     FROM rules_versions
     WHERE effective_from <= $1
     ORDER BY effective_from DESC
     LIMIT 1`,
    [effective]
  );
  if (result.rowCount > 0) return result.rows[0];

  return DEFAULT_RULES;
};

export const getRulesVersionById = async (rulesVersionId) => {
  const result = await query(
    `SELECT * FROM rules_versions WHERE rules_version_id = $1 LIMIT 1`,
    [rulesVersionId]
  );
  if (result.rowCount > 0) return result.rows[0];
  return null;
};

export const createRulesVersion = async ({ payload, actor, force }) => {
  const effectiveDate = toDateOnly(payload.effective_from);
  if (!effectiveDate) {
    throw new Error('effective_from inválido');
  }
  const today = toDateOnly(new Date());
  if (effectiveDate < today && !force) {
    throw new Error('effective_from no passado exige force=true');
  }

  const rulesVersionId = await buildRulesVersionId(formatDate(effectiveDate));

  await query(
    `INSERT INTO rules_versions (
      rules_version_id,
      effective_from,
      effective_to,
      meta_global_comissao,
      dias_uteis,
      product_weights,
      bonus_events,
      penalties,
      created_by,
      audit_note
    ) VALUES (
      $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10
    )`,
    [
      rulesVersionId,
      formatDate(effectiveDate),
      payload.effective_to || null,
      payload.meta_global_comissao,
      payload.dias_uteis,
      JSON.stringify(payload.product_weights),
      JSON.stringify(payload.bonus_events),
      JSON.stringify(payload.penalties || {}),
      actor || null,
      payload.audit_note || null
    ]
  );

  await query(
    `INSERT INTO audit_logs (event_type, actor, payload)
     VALUES ($1, $2, $3::jsonb)`,
    ['RULES_VERSION_CREATED', actor || null, JSON.stringify({ rules_version_id: rulesVersionId })]
  );

  return rulesVersionId;
};
