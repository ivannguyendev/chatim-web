import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChatimClient } from "../src/index";
import { FakeWebSocket } from "./helpers/fake-socket";

describe("ChatimClient", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("orchestrates connection, token exchange and provides public API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: "mock-token", expires_in: 300 }),
      }),
    );

    let socket: FakeWebSocket | null = null;
    const client = createChatimClient({
      gatewayUrl: "http://localhost:8082",
      wsUrl: "ws://localhost:8081/ws",
      identityUrl: "http://localhost:8084",
      getSubjectToken: async () => "subject-jwt",
      webSocketFactory: (url, proto) => {
        socket = new FakeWebSocket(url, proto);
        return socket as any;
      },
    });

    client.connect();
    expect(socket).not.toBeNull();

    socket!.simulateOpen();
    const token = await client.getToken();
    expect(token).toBe("mock-token");

    client.close();
  });
});
