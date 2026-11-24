import { describe, expect, it } from "vitest";
import { parseEnv } from "../src/lib/env";

describe("Webapp Environment Validator", () => {
  it("should fallback to local dev ports when environment variables are unset", () => {
    const env = parseEnv({});
    expect(env.GATEWAY_URL).toBe("http://localhost:8082");
    expect(env.WS_URL).toBe("ws://localhost:8081/ws");
    expect(env.IDENTITY_URL).toBe("http://localhost:8084");
  });

  it("should throw error if WS_URL does not use ws:// or wss://", () => {
    expect(() =>
      parseEnv({
        VITE_WS_URL: "http://localhost:8081/ws",
      }),
    ).toThrow(/WS_URL must use ws:\/\/ or wss:\/\//);
  });
});
