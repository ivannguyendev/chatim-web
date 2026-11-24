export interface ClientConfig {
  gatewayUrl: string;
  wsUrl: string;
  identityUrl: string;
  heartbeatIntervalMs: number;
  serverHeartbeatTimeoutMs: number;
  tokenRenewRatio: number;
}

export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  gatewayUrl: "http://localhost:8082",
  wsUrl: "ws://localhost:8081/ws",
  identityUrl: "http://localhost:8084",
  heartbeatIntervalMs: 8000,
  serverHeartbeatTimeoutMs: 15000,
  tokenRenewRatio: 0.8,
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

  return config;
}
