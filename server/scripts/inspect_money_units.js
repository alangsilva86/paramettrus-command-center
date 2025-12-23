import { query } from '../src/db.js';
import { config } from '../src/config.js';
import { normalizeMoney } from '../src/utils/normalize.js';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (value === undefined) return fallback;
  return value;
};

const limit = Number(getArg('limit', '50'));
const showSamples = Number(getArg('show-samples', '5'));

const getField = (record, key) => {
  if (!record || !key) return null;
  if (record[key] !== undefined) return record[key];
  const upperKey = key?.toUpperCase?.();
  if (upperKey && record[upperKey] !== undefined) return record[upperKey];
  if (key.includes('.')) {
    const parts = key.split('.');
    let current = record;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        current = null;
        break;
      }
    }
    if (current !== null && current !== undefined) return current;
  }
  return null;
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const run = async () => {
  const rawRows = await query(
    `SELECT source_contract_id, payload
     FROM contracts_raw
     WHERE source_contract_id IS NOT NULL
     ORDER BY fetched_at DESC
     LIMIT $1`,
    [limit]
  );
  if (rawRows.rowCount === 0) {
    console.log('Nenhum payload bruto encontrado.');
    process.exit(0);
  }

  const ids = rawRows.rows.map((row) => row.source_contract_id).filter(Boolean);
  const normRows = await query(
    `SELECT contract_id, premio, comissao_valor
     FROM contracts_norm
     WHERE contract_id = ANY($1)`,
    [ids]
  );
  const normMap = new Map(
    normRows.rows.map((row) => [String(row.contract_id), row])
  );

  const premioRatios = [];
  const comissaoRatios = [];
  const samples = [];
  let rawPremioDecimals = 0;
  let rawComissaoDecimals = 0;

  rawRows.rows.forEach((row) => {
    const payload = row.payload || {};
    const rawPremio = normalizeMoney(getField(payload, config.zohoFields.premio));
    const rawComissao = normalizeMoney(getField(payload, config.zohoFields.comissaoValor));
    if (rawPremio !== null && rawPremio % 1 !== 0) rawPremioDecimals += 1;
    if (rawComissao !== null && rawComissao % 1 !== 0) rawComissaoDecimals += 1;

    const norm = normMap.get(String(row.source_contract_id));
    if (!norm || rawPremio === null || rawComissao === null) return;
    const premioRatio = rawPremio !== 0 ? Number(norm.premio) / rawPremio : null;
    const comissaoRatio = rawComissao !== 0 ? Number(norm.comissao_valor) / rawComissao : null;
    if (Number.isFinite(premioRatio)) premioRatios.push(premioRatio);
    if (Number.isFinite(comissaoRatio)) comissaoRatios.push(comissaoRatio);

    if (samples.length < showSamples) {
      samples.push({
        contract_id: row.source_contract_id,
        raw_premio: rawPremio,
        raw_comissao: rawComissao,
        stored_premio: norm.premio,
        stored_comissao: norm.comissao_valor,
        ratio_premio: premioRatio,
        ratio_comissao: comissaoRatio
      });
    }
  });

  console.log('Diagnostico de unidade monetaria');
  console.log(`Config: MONEY_SOURCE_UNIT=${config.money?.sourceUnit} MONEY_DB_UNIT=${config.money?.dbUnit}`);
  console.log(`Amostras comparaveis: premio=${premioRatios.length} comissao=${comissaoRatios.length}`);
  console.log(`Mediana ratio premio (stored/raw): ${median(premioRatios) ?? 'n/a'}`);
  console.log(`Mediana ratio comissao (stored/raw): ${median(comissaoRatios) ?? 'n/a'}`);
  console.log(`Raw com decimais: premio=${rawPremioDecimals}/${rawRows.rowCount}, comissao=${rawComissaoDecimals}/${rawRows.rowCount}`);
  if (samples.length > 0) {
    console.log('');
    console.log('Amostras:');
    samples.forEach((sample) => {
      console.log(
        `  ${sample.contract_id} raw_premio=${sample.raw_premio} stored_premio=${sample.stored_premio} ratio=${sample.ratio_premio}`
      );
      console.log(
        `  ${sample.contract_id} raw_comissao=${sample.raw_comissao} stored_comissao=${sample.stored_comissao} ratio=${sample.ratio_comissao}`
      );
    });
  }
};

run().catch((error) => {
  console.error('Falha ao inspecionar unidades:', error.message);
  process.exit(1);
});
