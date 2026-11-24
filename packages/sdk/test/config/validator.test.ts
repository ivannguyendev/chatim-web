import { describe, expect, it } from "vitest";
import {
  DEFAULT_CLIENT_CONFIG,
  validateClientConfig,
} from "../../src/config/validator";

describe("Client Config Validator (Ops Enforced in Code)", () => {
  it("should accept valid default configuration", () => {
    const config = validateClientConfig(DEFAULT_CLIENT_CONFIG);
    expect(config.heartbeatIntervalMs).toBe(8000);
    expect(config.tokenRenewRatio).toBe(0.8);
  });

  it("should throw error if heartbeat interval >= server timeout (15000ms)", () => {
    expect(() =>
      validateClientConfig({
        ...DEFAULT_CLIENT_CONFIG,
        heartbeatIntervalMs: 15000,
      }),
    ).toThrow(/heartbeatIntervalMs.*must be less than.*15000/);
  });

  it("should throw error if token renew ratio is outside 0.70 - 0.85", () => {
    expect(() =>
      validateClientConfig({
        ...DEFAULT_CLIENT_CONFIG,
        tokenRenewRatio: 0.65,
      }),
    ).toThrow(/tokenRenewRatio.*between 0.70 and 0.85/);
  });
});
