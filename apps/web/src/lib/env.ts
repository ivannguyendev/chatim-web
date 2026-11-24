export interface AppEnv {
  GATEWAY_URL: string;
  WS_URL: string;
  IDENTITY_URL: string;
}

export function parseEnv(raw: Record<string, string | undefined>): AppEnv {
  const GATEWAY_URL = raw.VITE_GATEWAY_URL || "http://localhost:8082";
  const WS_URL = raw.VITE_WS_URL || "ws://localhost:8081/ws";
  const IDENTITY_URL = raw.VITE_IDENTITY_URL || "http://localhost:8084";

  if (!WS_URL.startsWith("ws://") && !WS_URL.startsWith("wss://")) {
    throw new Error(`WS_URL must use ws:// or wss://, received: ${WS_URL}`);
  }

  if (
    !GATEWAY_URL.startsWith("http://") &&
    !GATEWAY_URL.startsWith("https://")
  ) {
    throw new Error(
      `GATEWAY_URL must use http:// or https://, received: ${GATEWAY_URL}`,
    );
  }

  return {
    GATEWAY_URL,
    WS_URL,
    IDENTITY_URL,
  };
}

export const env = parseEnv(
  typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {},
);
