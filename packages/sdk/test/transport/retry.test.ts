import { describe, expect, it } from "vitest";
import { getReconnectDelayMs } from "../../src/transport/retry";

describe("Reconnect Backoff Calculator", () => {
  it("returns 0-60s for code 1001 (server restart)", () => {
    const delay = getReconnectDelayMs(1001, 1);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(60000);
  });

  it("returns 0-3s for code 1000, 1006 and network drops", () => {
    const delay1000 = getReconnectDelayMs(1000, 1);
    expect(delay1000).toBeGreaterThanOrEqual(0);
    expect(delay1000).toBeLessThanOrEqual(3000);

    const delay1006 = getReconnectDelayMs(1006, 1);
    expect(delay1006).toBeGreaterThanOrEqual(0);
    expect(delay1006).toBeLessThanOrEqual(3000);
  });

  it("returns 30-60s for code 4009 (user connection limit)", () => {
    const delay = getReconnectDelayMs(4009, 1);
    expect(delay).toBeGreaterThanOrEqual(30000);
    expect(delay).toBeLessThanOrEqual(60000);
  });

  it("returns null for code 4003 (tenant disabled - permanent stop)", () => {
    const delay = getReconnectDelayMs(4003, 1);
    expect(delay).toBeNull();
  });

  it("calculates exponential backoff for other error codes capped at 60s", () => {
    expect(getReconnectDelayMs(1002, 0)).toBe(1000);
    expect(getReconnectDelayMs(1002, 1)).toBe(2000);
    expect(getReconnectDelayMs(1002, 2)).toBe(4000);
    expect(getReconnectDelayMs(1002, 10)).toBe(60000);
  });
});
