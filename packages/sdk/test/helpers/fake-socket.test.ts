import { describe, expect, it } from "vitest";
import { FakeWebSocket } from "./fake-socket";

describe("FakeWebSocket", () => {
  it("should simulate connection lifecycle and message sending", () => {
    const ws = new FakeWebSocket("ws://localhost:8081/ws", "chatim.v1");
    expect(ws.readyState).toBe(FakeWebSocket.CONNECTING);
    expect(ws.protocol).toBe("chatim.v1");

    ws.simulateOpen();
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);

    const data = new Uint8Array([1, 2, 3]);
    ws.send(data);
    expect(ws.sentData.length).toBe(1);
    expect(ws.sentData[0]).toEqual(data);
  });
});
