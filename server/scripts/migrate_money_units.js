import { query } from '../src/db.js';
import { config } from '../src/config.js';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  if (value === undefined) return fallback;
  return value;
};

const normalizeUnit = (value) => String(value || '').trim().toLowerCase();

const fromUnit = normalizeUnit(getArg('from-unit', ''));
const toUnit = normalizeUnit(getArg('to-unit', ''));
const apply = args.includes('--apply');
const alterSchema = args.includes('--alter-schema');

const usage = () => {
  console.log(`Usage: node scripts/migrate_money_units.js --from-unit reais|centavos --to-unit reais|centavos [options]

Options:
  --apply         executa a migracao (default: dry-run)
  --alter-schema  ajusta o tipo das colunas (NUMERIC(14,0) para centavos)
`);
};

if (!fromUnit || !toUnit) {
  usage();
  process.exit(1);
}
if (!['reais', 'centavos'].includes(fromUnit) || !['reais', 'centavos'].includes(toUnit)) {
  usage();
  process.exit(1);
}

const resolveExpression = (column) => {
  if (fromUnit === toUnit) return column;
  if (fromUnit === 'reais' && toUnit === 'centavos') return `ROUND(${column} * 100)`;
  if (fromUnit === 'centavos' && toUnit === 'reais') return `${column} / 100.0`;
  return column;
};

const run = async () => {
  console.log(`Config atual: MONEY_SOURCE_UNIT=${config.money?.sourceUnit} MONEY_DB_UNIT=${config.money?.dbUnit}`);
  console.log(`Migracao solicitada: ${fromUnit} -> ${toUnit}`);
  if (!apply) {
    console.log('Modo dry-run. Use --apply para executar.');
    console.log(`SQL: UPDATE contracts_norm SET premio = ${resolveExpression('premio')}, comissao_valor = ${resolveExpression('comissao_valor')};`);
    process.exit(0);
  }

  await query('BEGIN');
  try {
    await query(
      `UPDATE contracts_norm
       SET premio = ${resolveExpression('premio')},
           comissao_valor = ${resolveExpression('comissao_valor')}`
    );

    if (alterSchema && toUnit === 'centavos') {
      await query(
        `ALTER TABLE contracts_norm
         ALTER COLUMN premio TYPE NUMERIC(14,0),
         ALTER COLUMN comissao_valor TYPE NUMERIC(14,0)`
      );
    }

    await query('COMMIT');
    console.log('Migracao concluida.');
  } catch (error) {
    await query('ROLLBACK');
    console.error('Falha na migracao:', error.message);
    process.exit(1);
  }
};

run().catch((error) => {
  console.error('Erro inesperado:', error.message);
  process.exit(1);
});
