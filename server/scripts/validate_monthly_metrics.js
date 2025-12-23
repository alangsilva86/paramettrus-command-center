import { query } from '../src/db.js';
import { config } from '../src/config.js';
import { toReais } from '../src/utils/money.js';
import { buildStatusFilter } from '../src/utils/status.js';

const expectedRows = [
  { month: '2024-01', contratos: 22, premio: 40018.88, comissao: 5628.74, pct: 14.07 },
  { month: '2024-02', contratos: 12, premio: 38030.95, comissao: 4665.4, pct: 12.27 },
  { month: '2024-03', contratos: 11, premio: 51098.09, comissao: 5628.33, pct: 11.01 },
  { month: '2024-04', contratos: 16, premio: 42479.38, comissao: 4588.0, pct: 10.8 },
  { month: '2024-05', contratos: 27, premio: 53122.07, comissao: 7993.11, pct: 15.05 },
  { month: '2024-06', contratos: 18, premio: 34721.58, comissao: 5874.84, pct: 16.92 },
  { month: '2024-07', contratos: 20, premio: 48739.7, comissao: 8195.25, pct: 16.81 },
  { month: '2024-08', contratos: 22, premio: 61805.71, comissao: 9771.97, pct: 15.81 },
  { month: '2024-09', contratos: 36, premio: 152639.95, comissao: 18906.13, pct: 12.39 },
  { month: '2024-10', contratos: 26, premio: 69996.96, comissao: 9980.27, pct: 14.26 },
  { month: '2024-11', contratos: 30, premio: 100111.13, comissao: 11990.1, pct: 11.98 },
  { month: '2024-12', contratos: 30, premio: 89774.02, comissao: 11902.96, pct: 13.26 },
  { month: '2025-01', contratos: 26, premio: 50625.05, comissao: 7343.48, pct: 14.51 },
  { month: '2025-02', contratos: 40, premio: 95064.37, comissao: 12444.04, pct: 13.09 },
  { month: '2025-03', contratos: 35, premio: 99189.09, comissao: 13224.69, pct: 13.33 },
  { month: '2025-04', contratos: 32, premio: 117615.15, comissao: 14771.14, pct: 12.56 },
  { month: '2025-05', contratos: 56, premio: 168509.74, comissao: 24826.94, pct: 14.73 },
  { month: '2025-06', contratos: 31, premio: 49259.55, comissao: 6036.23, pct: 12.25 },
  { month: '2025-07', contratos: 42, premio: 97884.38, comissao: 12313.93, pct: 12.58 },
  { month: '2025-08', contratos: 43, premio: 137719.34, comissao: 18509.4, pct: 13.44 },
  { month: '2025-09', contratos: 43, premio: 217578.87, comissao: 26493.46, pct: 12.18 },
  { month: '2025-10', contratos: 53, premio: 119679.05, comissao: 16014.55, pct: 13.38 },
  { month: '2025-11', contratos: 43, premio: 134998.5, comissao: 16384.64, pct: 12.14 },
  { month: '2025-12', contratos: 1, premio: 6150.0, comissao: 1230.0, pct: 20.0 }
];

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (value === undefined) return fallback;
  return value;
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const help = args.includes('--help');
if (help) {
  console.log(`Usage: node scripts/validate_monthly_metrics.js [options]

Options:
  --month-start YYYY-MM
  --month-end YYYY-MM
  --tol-contratos N          (default: 0)
  --tol-premio N             (default: 1)
  --tol-comissao N           (default: 1)
  --tol-pct N                (default: 0.01) percentage points
  --exclude-incomplete       exclude is_incomplete rows
`);
  process.exit(0);
}

const tolerance = {
  contratos: toNumber(getArg('tol-contratos', '0'), 0),
  premio: toNumber(getArg('tol-premio', '1'), 1),
  comissao: toNumber(getArg('tol-comissao', '1'), 1),
  pct: toNumber(getArg('tol-pct', '0.01'), 0.01)
};

const monthStart = getArg('month-start', expectedRows[0].month);
const monthEnd = getArg('month-end', expectedRows[expectedRows.length - 1].month);
const excludeIncomplete = args.includes('--exclude-incomplete');

const expected = expectedRows.filter((row) => row.month >= monthStart && row.month <= monthEnd);
const expectedMap = new Map(expected.map((row) => [row.month, row]));

const total = await query('SELECT COUNT(*)::int AS total FROM contracts_norm');
if (!total.rows[0] || total.rows[0].total === 0) {
  console.log('Base vazia. Popule o banco e rode novamente.');
  process.exit(2);
}

const conditions = ['is_invalid = FALSE', 'month_ref BETWEEN $1 AND $2'];
const params = [monthStart, monthEnd];
if (excludeIncomplete) {
  conditions.push('is_incomplete = FALSE');
}
const statusFilter = buildStatusFilter(params, config.contractStatus);
if (statusFilter) {
  conditions.push(statusFilter);
}
const sql = `
  SELECT month_ref,
         COUNT(DISTINCT contract_id)::int AS contratos,
         COALESCE(SUM(premio),0) AS premio_total,
         COALESCE(SUM(comissao_valor),0) AS comissao_total
  FROM contracts_norm
  WHERE ${conditions.join(' AND ')}
  GROUP BY month_ref
  ORDER BY month_ref;
`;
const res = await query(sql, params);

const moneyUnit = config.money?.dbUnit || 'centavos';

const actualMap = new Map(
  res.rows.map((row) => [
    row.month_ref,
    {
      contratos: Number(row.contratos || 0),
      premio: toReais(row.premio_total || 0, moneyUnit),
      comissao: toReais(row.comissao_total || 0, moneyUnit)
    }
  ])
);

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMoney = (value) => currency.format(value).replace(/\u00a0/g, ' ');
const formatPct = (value) => `${number.format(value)}%`;

const results = [];
let failures = 0;
let warnings = 0;

for (const row of expected) {
  const actual = actualMap.get(row.month) || { contratos: 0, premio: 0, comissao: 0 };
  const pctActual = actual.premio > 0 ? (actual.comissao / actual.premio) * 100 : 0;
  const pctRounded = Math.round(pctActual * 100) / 100;

  const diffContratos = actual.contratos - row.contratos;
  const diffPremio = actual.premio - row.premio;
  const diffComissao = actual.comissao - row.comissao;
  const diffPct = pctRounded - row.pct;

  const passContratos = Math.abs(diffContratos) <= tolerance.contratos;
  const passPremio = Math.abs(diffPremio) <= tolerance.premio;
  const passComissao = Math.abs(diffComissao) <= tolerance.comissao;
  const passPct = Math.abs(diffPct) <= tolerance.pct;

  const pass = passContratos && passPremio && passComissao && passPct;
  if (!pass) failures += 1;

  const sanityWarnings = [];
  const pctMax = Number(config.quality?.comissaoPctMax ?? 0.5) * 100;
  if (actual.premio > 0 && pctActual > pctMax) {
    sanityWarnings.push(`pct_acima_max(${pctMax.toFixed(1)}%)`);
  }
  if (actual.premio > 0 && pctActual > 100) {
    sanityWarnings.push('pct_acima_100');
  }
  if (sanityWarnings.length > 0) warnings += 1;

  results.push({
    month: row.month,
    contratos: `${actual.contratos} vs ${row.contratos} (${diffContratos >= 0 ? '+' : ''}${diffContratos})`,
    premio: `${formatMoney(actual.premio)} vs ${formatMoney(row.premio)} (${diffPremio >= 0 ? '+' : ''}${formatMoney(diffPremio)})`,
    comissao: `${formatMoney(actual.comissao)} vs ${formatMoney(row.comissao)} (${diffComissao >= 0 ? '+' : ''}${formatMoney(diffComissao)})`,
    pct: `${formatPct(pctRounded)} vs ${formatPct(row.pct)} (${diffPct >= 0 ? '+' : ''}${diffPct.toFixed(2)}pp)`,
    pass,
    sanityWarnings
  });
}

const extraMonths = res.rows
  .map((row) => row.month_ref)
  .filter((month) => !expectedMap.has(month));

console.log(`Comparativo mensal (${monthStart} a ${monthEnd})`);
console.log(`Tolerancia: contratos <= ${tolerance.contratos}, premio <= ${tolerance.premio}, comissao <= ${tolerance.comissao}, pct <= ${tolerance.pct}pp`);
const statusMode =
  config.contractStatus.include.length > 0
    ? `include: ${config.contractStatus.include.join(', ')}`
    : config.contractStatus.exclude.length > 0
    ? `exclude: ${config.contractStatus.exclude.join(', ')}`
    : 'all';
console.log(`Status: ${statusMode}`);
console.log(`Linhas avaliadas: ${results.length}, falhas: ${failures}, alertas: ${warnings}`);
console.log('');

for (const row of results) {
  const status = row.pass ? 'OK ' : 'FAIL';
  console.log(`${status} ${row.month}`);
  console.log(`  contratos: ${row.contratos}`);
  console.log(`  premio:    ${row.premio}`);
  console.log(`  comissao:  ${row.comissao}`);
  console.log(`  pct:       ${row.pct}`);
  if (row.sanityWarnings.length > 0) {
    console.log(`  alerta:    ${row.sanityWarnings.join(', ')}`);
  }
}

if (extraMonths.length > 0) {
  console.log('');
  console.log(`Meses extras no banco (nao esperados): ${extraMonths.join(', ')}`);
}

process.exit(failures > 0 ? 1 : 0);
