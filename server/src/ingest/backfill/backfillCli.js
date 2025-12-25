import { toDateOnly } from '../../utils/date.js';

const BACKFILL_USAGE = `Usage: node scripts/ingest_backfill.js --from YYYY-MM-DD --to YYYY-MM-DD [options]

Options:
  --date-field effective|inicio|modified   (default: effective)
  --include-inicio                          include inicio range when date-field=effective
  --dry-run                                 do not write to database
`;

const ALLOWED_DATE_FIELD_MODES = new Set(['effective', 'inicio', 'modified']);

const findArgValue = (argv, name, fallback = null) => {
  const idx = argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const value = argv[idx + 1];
  if (value === undefined) return fallback;
  return value;
};

/**
 * @typedef {Object} BackfillCliOptions
 * @property {Date} fromDate
 * @property {Date} toDate
 * @property {'effective'|'inicio'|'modified'} dateFieldMode
 * @property {boolean} includeInicio
 * @property {boolean} dryRun
 */

/**
 * @typedef {Object} BackfillCliResult
 * @property {boolean} [help]
 * @property {string} [usage]
 * @property {string} [error]
 * @property {BackfillCliOptions} [options]
 */

/**
 * @param {string[]} argv
 * @returns {BackfillCliResult}
 */
export const parseBackfillCli = (argv) => {
  if (argv.includes('--help')) {
    return { help: true, usage: BACKFILL_USAGE };
  }

  const fromArg = findArgValue(argv, 'from');
  const toArg = findArgValue(argv, 'to');
  if (!fromArg || !toArg) {
    return { error: 'Parametros obrigatorios: --from YYYY-MM-DD --to YYYY-MM-DD' };
  }

  const fromDate = toDateOnly(fromArg);
  const toDate = toDateOnly(toArg);
  if (!fromDate || !toDate) {
    return { error: 'Datas invalidas. Use YYYY-MM-DD.' };
  }
  if (fromDate > toDate) {
    return { error: '--from deve ser menor ou igual a --to' };
  }

  const dateFieldMode = findArgValue(argv, 'date-field', 'effective');
  if (!ALLOWED_DATE_FIELD_MODES.has(dateFieldMode)) {
    return { error: '--date-field deve ser effective, inicio ou modified' };
  }

  const includeInicio = argv.includes('--include-inicio');
  const dryRun = argv.includes('--dry-run');

  return {
    options: {
      fromDate,
      toDate,
      dateFieldMode,
      includeInicio,
      dryRun
    }
  };
};

export { BACKFILL_USAGE, ALLOWED_DATE_FIELD_MODES };
