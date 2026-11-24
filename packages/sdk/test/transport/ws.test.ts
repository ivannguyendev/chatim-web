import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
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
});
