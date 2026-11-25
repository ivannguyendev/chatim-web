import {
  type MessageInitShape,
  create,
  fromBinary,
  toBinary,
} from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClientFrameSchema,
  HeartbeatFrameSchema,
  ReadyFrameSchema,
  ServerFrameSchema,
} from "../../src/gen/chatim/v1/ws_pb";
import { WebSocketTransport } from "../../src/transport/ws";
import { FakeWebSocket } from "../helpers/fake-socket";

describe("WebSocketTransport", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("connects with subprotocol chatim.v1 and sends AuthFrame immediately upon open", async () => {
    let createdWs: FakeWebSocket | null = null;
    const transport = new WebSocketTransport({
      wsUrl: "ws://localhost:8081/ws",
      getToken: async () => "token-123",
      webSocketFactory: (url, proto) => {
        createdWs = new FakeWebSocket(url, proto);
        return createdWs as any;
      },
    });

    transport.connect();
    expect(createdWs).not.toBeNull();
    expect(createdWs!.protocol).toBe("chatim.v1");

    createdWs!.simulateOpen();
    await Promise.resolve();
    expect(createdWs!.sentData.length).toBe(1);

    const sentFrame = fromBinary(
      ClientFrameSchema,
      createdWs!.sentData[0] as Uint8Array,
    );
    expect(sentFrame.frame.case).toBe("auth");
    if (sentFrame.frame.case === "auth") {
      expect(sentFrame.frame.value.token).toBe("token-123");
    }

    transport.close();
  });

  it("transitions to running and starts 8s periodic heartbeat after receiving ReadyFrame", async () => {
    let createdWs: FakeWebSocket | null = null;
    const transport = new WebSocketTransport({
      wsUrl: "ws://localhost:8081/ws",
      getToken: async () => "token-123",
      webSocketFactory: (url, proto) => {
        createdWs = new FakeWebSocket(url, proto);
        return createdWs as any;
      },
    });

    transport.connect();
    createdWs!.simulateOpen();
    await Promise.resolve();

    const readyFrame = create(ServerFrameSchema, {
      frame: { case: "ready", value: {} },
    });
    createdWs!.simulateMessage(toBinary(ServerFrameSchema, readyFrame));

    expect(transport.status).toBe("running");

    vi.advanceTimersByTime(8000);
    expect(createdWs!.sentData.length).toBe(2);

    const heartbeatFrame = fromBinary(
      ClientFrameSchema,
      createdWs!.sentData[1] as Uint8Array,
    );
    expect(heartbeatFrame.frame.case).toBe("heartbeat");

    transport.close();
  });

  const flush = async () => {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  };

  function deferredTokens() {
    const pending: Array<{
      resolve: (token: string) => void;
      reject: (error: Error) => void;
    }> = [];
    const getToken = () =>
      new Promise<string>((resolve, reject) => {
        pending.push({ resolve, reject });
      });
    return { getToken, pending };
  }

  function setup(
    getToken: () => Promise<string> = async () => "token-123",
    refreshToken?: () => Promise<string>,
  ) {
    const sockets: FakeWebSocket[] = [];
    const transport = new WebSocketTransport({
      wsUrl: "ws://localhost:8081/ws",
      getToken,
      refreshToken,
      webSocketFactory: (url, proto) => {
        const ws = new FakeWebSocket(url, proto);
        sockets.push(ws);
        return ws as any;
      },
    });
    const ws = () => sockets[sockets.length - 1]!;
    const receive = (init: MessageInitShape<typeof ServerFrameSchema>) =>
      ws().simulateMessage(
        toBinary(
          ServerFrameSchema,
          create(ServerFrameSchema, init),
        ) as unknown as ArrayBuffer,
      );
    const sentCases = () =>
      ws().sentData.map(
        (data) => fromBinary(ClientFrameSchema, data as Uint8Array).frame.case,
      );
    return { transport, ws, receive, sentCases, sockets };
  }

  it("sends heartbeat every 8s while still waiting for ready", async () => {
    const { transport, ws, sentCases } = setup();
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();

    vi.advanceTimersByTime(8000);

    expect(transport.status).toBe("waiting_auth");
    expect(sentCases()).toEqual(["auth", "heartbeat"]);
    transport.close();
  });

  it("notifies ready listeners on every ready, treats resync before ready as ready, and resync listeners only on a running connection", async () => {
    const { transport, ws, receive } = setup();
    const onReady = vi.fn();
    const onResync = vi.fn();
    transport.onReady(onReady);
    transport.onResync(onResync);
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();

    receive({ frame: { case: "resync", value: { reason: 1 } } });
    expect(transport.status).toBe("running");
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onResync).not.toHaveBeenCalled();

    receive({ frame: { case: "resync", value: { reason: 1 } } });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(onResync).toHaveBeenCalledTimes(1);

    receive({ frame: { case: "ready", value: {} } });
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(onResync).toHaveBeenCalledTimes(1);
    transport.close();
  });

  it("sends load_rooms after retry_after_ms plus jitter when loading rooms failed", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { transport, ws, receive, sentCases } = setup();
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();

    receive({ frame: { case: "loadFailed", value: { retryAfterMs: 2000 } } });
    vi.advanceTimersByTime(2499);
    expect(sentCases()).not.toContain("loadRooms");

    vi.advanceTimersByTime(1);
    expect(sentCases()).toContain("loadRooms");
    transport.close();
  });

  it("cancels pending load_rooms and retry_later timers on close", async () => {
    const { transport, ws, receive } = setup();
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();
    receive({ frame: { case: "loadFailed", value: { retryAfterMs: 2000 } } });
    receive({ frame: { case: "retryLater", value: { retryAfterMs: 5000 } } });

    transport.close();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("drops a pending load_rooms once a resync shows the user was reloaded", async () => {
    const { transport, ws, receive, sentCases } = setup();
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();
    receive({ frame: { case: "ready", value: {} } });
    receive({ frame: { case: "loadFailed", value: { retryAfterMs: 2000 } } });

    receive({ frame: { case: "resync", value: { reason: 1 } } });
    vi.advanceTimersByTime(5000);

    expect(sentCases()).not.toContain("loadRooms");
    transport.close();
  });

  it("backs off when the socket closes before opening, since browsers hide the handshake status", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { transport, ws, sockets } = setup();
    transport.connect();

    ws().simulateClose(1006);
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    transport.close();
  });

  it("backs off 1s then 2s when getting a token fails instead of reconnecting at once", async () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new WebSocketTransport({
      wsUrl: "ws://localhost:8081/ws",
      getToken: async () => {
        throw new Error("invalid_grant");
      },
      webSocketFactory: (url, proto) => {
        const ws = new FakeWebSocket(url, proto);
        sockets.push(ws);
        return ws as any;
      },
    });
    transport.connect();
    sockets[0]!.simulateOpen();
    await flush();
    expect(transport.status).toBe("disconnected");
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1]!.simulateOpen();
    await flush();
    vi.advanceTimersByTime(1999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    transport.close();
  });

  it("ignores a token failure that arrives after close", async () => {
    const tokens = deferredTokens();
    const { transport, ws, sockets } = setup(tokens.getToken);
    transport.connect();
    ws().simulateOpen();
    transport.close();

    tokens.pending[0]!.reject(new Error("invalid_grant"));
    await flush();
    vi.advanceTimersByTime(60000);

    expect(sockets).toHaveLength(1);
    expect(transport.status).toBe("disconnected");
  });

  it("sends only the new socket's auth when the old token arrives after reconnecting", async () => {
    const tokens = deferredTokens();
    const { transport, ws, sentCases } = setup(tokens.getToken);
    transport.connect();
    ws().simulateOpen();
    transport.close();
    transport.connect();
    ws().simulateOpen();

    tokens.pending[1]!.resolve("token-new");
    tokens.pending[0]!.resolve("token-old");
    await flush();

    expect(sentCases()).toEqual(["auth"]);
    expect(
      fromBinary(ClientFrameSchema, ws().sentData[0] as Uint8Array).frame,
    ).toMatchObject({ case: "auth", value: { token: "token-new" } });
    transport.close();
  });

  it("schedules a single reconnect when a token failure follows a server close", async () => {
    const tokens = deferredTokens();
    const { transport, ws, sockets } = setup(tokens.getToken);
    transport.connect();
    ws().simulateOpen();
    ws().simulateClose(1000);

    tokens.pending[0]!.reject(new Error("invalid_grant"));
    await flush();
    vi.advanceTimersByTime(60000);

    expect(sockets).toHaveLength(2);
    transport.close();
  });

  it("keeps notifying listeners and dispatching the frame when a ready listener throws", async () => {
    const { transport, ws, receive } = setup();
    const nextReady = vi.fn();
    const onFrame = vi.fn();
    transport.onReady(() => {
      throw new Error("listener failed");
    });
    transport.onReady(nextReady);
    transport.onFrame(onFrame);
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();

    receive({ frame: { case: "ready", value: {} } });

    expect(transport.status).toBe("running");
    expect(nextReady).toHaveBeenCalledTimes(1);
    expect(onFrame).toHaveBeenCalledTimes(1);
    transport.close();
  });

  it("clears a pending load_rooms when the handshake fails, leaving only the reconnect timer", async () => {
    const tokens = deferredTokens();
    const { transport, ws, receive } = setup(tokens.getToken);
    transport.connect();
    ws().simulateOpen();
    tokens.pending[0]!.resolve("token-123");
    await flush();
    receive({ frame: { case: "loadFailed", value: { retryAfterMs: 2000 } } });
    receive({ frame: { case: "retryLater", value: { retryAfterMs: 100 } } });

    vi.advanceTimersByTime(100);
    tokens.pending[1]!.reject(new Error("invalid_grant"));
    await flush();

    expect(transport.status).toBe("disconnected");
    expect(vi.getTimerCount()).toBe(1);
    transport.close();
  });

  it("reconnects after a server close even when a status listener throws", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { transport, ws, sockets } = setup();
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();
    transport.onStatusChange(() => {
      throw new Error("listener failed");
    });

    ws().simulateClose(1006);
    vi.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(2);
    transport.close();
  });

  it("keeps a single reconnect timer when connecting again fails while a reconnect is pending", () => {
    const sockets: FakeWebSocket[] = [];
    const transport = new WebSocketTransport({
      wsUrl: "ws://localhost:8081/ws",
      getToken: async () => "token-123",
      webSocketFactory: (url, proto) => {
        if (sockets.length === 1) {
          throw new Error("blocked");
        }
        const ws = new FakeWebSocket(url, proto);
        sockets.push(ws);
        return ws as any;
      },
    });
    transport.connect();
    sockets[0]!.simulateClose(1000);

    transport.connect();

    expect(vi.getTimerCount()).toBe(1);
    transport.close();
  });

  it("cancels a pending reconnect when connect is called during the backoff", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const { transport, ws, sockets } = setup();
    transport.connect();
    ws().simulateOpen();
    await Promise.resolve();
    ws().simulateClose(1000);

    transport.connect();
    vi.advanceTimersByTime(3000);

    expect(sockets).toHaveLength(2);
    transport.close();
  });

  it("exchanges a fresh token for the reconnect after close 4001", async () => {
    const refreshToken = vi.fn(async () => "token-fresh");
    const { transport, ws, sockets } = setup(
      async () => "token-123",
      refreshToken,
    );
    transport.connect();
    ws().simulateOpen();
    await flush();
    ws().simulateClose(4001);
    vi.advanceTimersByTime(0);
    expect(sockets).toHaveLength(2);

    ws().simulateOpen();
    await flush();

    expect(refreshToken).toHaveBeenCalledTimes(1);
    expect(
      fromBinary(ClientFrameSchema, ws().sentData[0] as Uint8Array).frame,
    ).toMatchObject({ case: "auth", value: { token: "token-fresh" } });
    transport.close();
  });

  it("keeps exchanging a fresh token after close 4001 until one succeeds", async () => {
    const getToken = vi.fn(async () => "token-123");
    const refreshToken = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("identity unavailable"))
      .mockResolvedValueOnce("token-fresh");
    const { transport, ws, sockets } = setup(getToken, refreshToken);
    transport.connect();
    ws().simulateOpen();
    await flush();
    ws().simulateClose(4001);
    vi.advanceTimersByTime(0);
    ws().simulateOpen();
    await flush();

    vi.advanceTimersByTime(2000);
    expect(sockets).toHaveLength(3);
    ws().simulateOpen();
    await flush();

    expect(getToken).toHaveBeenCalledTimes(1);
    expect(refreshToken).toHaveBeenCalledTimes(2);
    expect(
      fromBinary(ClientFrameSchema, ws().sentData[0] as Uint8Array).frame,
    ).toMatchObject({ case: "auth", value: { token: "token-fresh" } });
    transport.close();
  });

  it("closes the previous socket and its timers when connect is called again", async () => {
    const { transport, ws, receive, sockets } = setup();
    const onFrame = vi.fn();
    transport.onFrame(onFrame);
    transport.connect();
    const first = ws();
    first.simulateOpen();
    await flush();
    receive({ frame: { case: "loadFailed", value: { retryAfterMs: 2000 } } });
    receive({ frame: { case: "retryLater", value: { retryAfterMs: 100 } } });
    onFrame.mockClear();

    transport.connect();

    expect(sockets).toHaveLength(2);
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(vi.getTimerCount()).toBe(0);

    first.simulateMessage(
      toBinary(
        ServerFrameSchema,
        create(ServerFrameSchema, { frame: { case: "ready", value: {} } }),
      ) as unknown as ArrayBuffer,
    );
    first.simulateClose(1006);
    vi.advanceTimersByTime(60000);

    expect(sockets).toHaveLength(2);
    expect(onFrame).not.toHaveBeenCalled();
    expect(transport.status).toBe("connecting");
    ws().simulateOpen();
    await flush();
    expect(transport.status).toBe("waiting_auth");
    transport.close();
  });
});
