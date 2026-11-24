import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenManager } from "../../src/auth/token";

describe("TokenManager", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("exchanges subject token via RFC 8693 token exchange", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "chat-ed25519-token",
        expires_in: 300,
        token_type: "Bearer",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tm = new TokenManager({
      identityUrl: "http://localhost:8084",
      getSubjectToken: async () => "tenant-jwt",
    });

    const token = await tm.getToken();
    expect(token).toBe("chat-ed25519-token");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8084/v1/token",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }),
    );

    tm.destroy();
  });

  it("schedules auto-renew between 70% and 85% of TTL", async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation(async () => {
      callCount++;
      return {
        ok: true,
        json: async () => ({
          access_token: `token-${callCount}`,
          expires_in: 300,
          token_type: "Bearer",
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const tm = new TokenManager({
      identityUrl: "http://localhost:8084",
      getSubjectToken: async () => "tenant-jwt",
    });

    let renewedToken: string | null = null;
    tm.onRenew((t) => {
      renewedToken = t;
    });

    await tm.getToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(260 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(renewedToken).toBe("token-2");

    tm.destroy();
  });
});
