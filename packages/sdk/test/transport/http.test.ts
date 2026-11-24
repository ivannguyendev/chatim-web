import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "../../src/transport/http";

describe("GatewayClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls ListMyRooms with Authorization Bearer header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rooms: [{ roomId: "room-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new GatewayClient({
      gatewayUrl: "http://localhost:8082",
      getToken: async () => "bearer-token",
    });

    const res = await client.listMyRooms();
    expect(res.rooms.length).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8082/chatim.v1.ChatService/ListMyRooms",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer bearer-token",
        },
      }),
    );
  });
});
