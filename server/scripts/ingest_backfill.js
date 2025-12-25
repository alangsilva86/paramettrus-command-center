import { BACKFILL_USAGE, parseBackfillCli } from '../src/ingest/backfill/backfillCli.js';
import { handleBackfillError, runBackfill } from '../src/ingest/backfill/backfillService.js';

const cli = parseBackfillCli(process.argv.slice(2));
if (cli.help) {
  console.log(cli.usage || BACKFILL_USAGE);
  process.exit(0);
}
if (cli.error) {
  console.error(cli.error);
  process.exit(1);
}

runBackfill(cli.options).catch((error) => {
  handleBackfillError(error);
  process.exit(1);
});
