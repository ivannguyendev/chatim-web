import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenManager, readTokenSubject } from "../../src/auth/token";

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

  it("reads the chat user id from the sub claim of the exchanged token", async () => {
    const claims = btoa(JSON.stringify({ sub: "409BKeLbOoM", exp: 1 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: `e30.${claims}.sig`,
          expires_in: 300,
        }),
      }),
    );

    const tm = new TokenManager({
      identityUrl: "http://localhost:8084",
      getSubjectToken: async () => "tenant-jwt",
    });

    await expect(tm.getMyUserId()).resolves.toBe("409BKeLbOoM");
    tm.destroy();
  });

  it("rejects a chat token without a sub claim", () => {
    expect(() => readTokenSubject("e30.e30.sig")).toThrow(
      "Chat token has no sub claim",
    );
    expect(() => readTokenSubject("opaque")).toThrow("Chat token is not a JWT");
  });

  it("rejects a chat token whose claims are not base64url JSON", () => {
    expect(() => readTokenSubject("a.!!.s")).toThrow("Chat token is not a JWT");
  });

  it("drops a token exchange that finishes after destroy", async () => {
    let resolveSubjectToken: (token: string) => void = () => {};
    const subjectToken = new Promise<string>((resolve) => {
      resolveSubjectToken = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "late-token", expires_in: 300 }),
      }),
    );

    const tm = new TokenManager({
      identityUrl: "http://localhost:8084",
      getSubjectToken: () => subjectToken,
    });
    const renewListener = vi.fn();
    tm.onRenew(renewListener);

    const pending = tm.getToken();
    tm.destroy();
    resolveSubjectToken("tenant-jwt");

    await expect(pending).rejects.toThrow("Token manager destroyed");
    expect(vi.getTimerCount()).toBe(0);
    expect(renewListener).not.toHaveBeenCalled();
  });

  it("exchanges again on the next getToken after a scheduled renew fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-1", expires_in: 300 }),
      })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-3", expires_in: 300 }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const tm = new TokenManager({
      identityUrl: "http://localhost:8084",
      getSubjectToken: async () => "tenant-jwt",
    });

    await tm.getToken();
    await vi.advanceTimersByTimeAsync(260 * 1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(tm.getToken()).resolves.toBe("token-3");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    tm.destroy();
  });
});
