export interface ClientConfig {
  gatewayUrl: string;
  wsUrl: string;
  identityUrl: string;
  heartbeatIntervalMs: number;
  serverHeartbeatTimeoutMs: number;
  tokenRenewRatio: number;
  commandTimeoutMs: number;
  markReadIntervalMs: number;
}

export const SERVER_MARK_READ_MIN_INTERVAL_MS = 1000;

export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  gatewayUrl: "http://localhost:8082",
  wsUrl: "ws://localhost:8081/ws",
  identityUrl: "http://localhost:8084",
  heartbeatIntervalMs: 8000,
  serverHeartbeatTimeoutMs: 15000,
  tokenRenewRatio: 0.8,
  commandTimeoutMs: 10000,
  markReadIntervalMs: 1000,
};

export function validateClientConfig(config: ClientConfig): ClientConfig {
  if (config.heartbeatIntervalMs >= config.serverHeartbeatTimeoutMs) {
    throw new Error(
      `heartbeatIntervalMs (${config.heartbeatIntervalMs}ms) must be less than serverHeartbeatTimeoutMs (${config.serverHeartbeatTimeoutMs}ms) to prevent connection drops`,
    );
  }

  if (config.tokenRenewRatio < 0.7 || config.tokenRenewRatio > 0.85) {
    throw new Error(
      `tokenRenewRatio (${config.tokenRenewRatio}) must be between 0.70 and 0.85 per Module 09 §11 spec`,
    );
  }

  if (!(config.commandTimeoutMs > 0)) {
    throw new Error(
      `commandTimeoutMs (${config.commandTimeoutMs}ms) must be greater than 0 so unanswered commands always settle`,
    );
  }

  if (!(config.markReadIntervalMs >= SERVER_MARK_READ_MIN_INTERVAL_MS)) {
    throw new Error(
      `markReadIntervalMs (${config.markReadIntervalMs}ms) must be at least ${SERVER_MARK_READ_MIN_INTERVAL_MS}ms: the server accepts one MarkRead per second per room`,
    );
  }

  return config;
}
