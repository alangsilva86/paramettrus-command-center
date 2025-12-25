import { config } from '../../config.js';
import { toReais } from '../../utils/money.js';

export const SNAPSHOT_VERSION = 2;
export const SNAPSHOT_MONEY_UNIT = config.money?.dbUnit || 'centavos';

/**
 * @param {number} value
 * @returns {number}
 */
export const toReaisDb = (value) => toReais(value, SNAPSHOT_MONEY_UNIT);

/**
 * @param {Object} snapshot
 * @returns {boolean}
 */
export const isSnapshotVersionCompatible = (snapshot) =>
  snapshot?.snapshot_version === SNAPSHOT_VERSION &&
  snapshot?.money_unit === SNAPSHOT_MONEY_UNIT;
