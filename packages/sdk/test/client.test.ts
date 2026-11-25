import { fromBinary } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientFrameSchema } from "../src/gen/chatim/v1/ws_pb";
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

  it("exchanges a new token before authenticating again after close 4001", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-1", expires_in: 300 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "token-2", expires_in: 300 }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const sockets: FakeWebSocket[] = [];
    const client = createChatimClient({
      gatewayUrl: "http://localhost:8082",
      wsUrl: "ws://localhost:8081/ws",
      identityUrl: "http://localhost:8084",
      getSubjectToken: async () => "subject-jwt",
      webSocketFactory: (url, proto) => {
        const socket = new FakeWebSocket(url, proto);
        sockets.push(socket);
        return socket as any;
      },
    });
    const flush = async () => {
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    };

    client.connect();
    sockets[0]!.simulateOpen();
    await flush();
    sockets[0]!.simulateClose(4001);
    vi.advanceTimersByTime(0);
    sockets[1]!.simulateOpen();
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      fromBinary(ClientFrameSchema, sockets[1]!.sentData[0] as Uint8Array)
        .frame,
    ).toMatchObject({ case: "auth", value: { token: "token-2" } });
    client.close();
  });
});
