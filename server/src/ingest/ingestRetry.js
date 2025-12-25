import { config } from '../config.js';
import { createCircuitBreaker } from './zohoClient.js';

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const createZohoCircuitBreaker = () => {
  return createCircuitBreaker({
    failureThreshold: toPositiveNumber(config.ingest?.circuitBreakerFailureThreshold, 3),
    cooldownMs: toPositiveNumber(config.ingest?.circuitBreakerCooldownMs, 30000)
  });
};

export const buildZohoRetryOptions = (breaker, overrides = {}) => {
  const timeoutFallback = config.zoho.requestTimeoutMs
    ? config.zoho.requestTimeoutMs + 5000
    : 30000;
  return {
    attempts: toPositiveNumber(config.ingest?.retryAttempts, 3),
    timeoutMs: toPositiveNumber(config.ingest?.retryTimeoutMs, timeoutFallback),
    breaker,
    ...overrides
  };
};
