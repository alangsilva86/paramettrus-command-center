import { isSnapshotVersionCompatible } from './constants.js';
import { fetchScenarioSnapshots } from './repository.js';

export const listScenarioSnapshots = async ({ monthRef }) => {
  const rows = await fetchScenarioSnapshots({ monthRef });
  return rows
    .map((row) => ({
      ...row.data,
      scenario_id: row.scenario_id,
      rules_version_id: row.rules_version_id,
      created_at: row.created_at
    }))
    .filter((snapshot) => isSnapshotVersionCompatible(snapshot));
};
