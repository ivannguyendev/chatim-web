import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LAN_CHAT_USER_ID,
  createTestClient,
  flushMicrotasks,
  stubServerFetch,
} from "./helpers/running-client";

const KHO_HCM = "3cSuFSuZYdY";
const ALICE = "7hQx2LmPa0Z";

describe("ChatimClient realtime commands", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubServerFetch();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("resolves sendMessage with the seq of the matching response", async () => {
    const t = createTestClient();
    await t.openAndReady();

    const sending = t.client.sendMessage(KHO_HCM, "Lô hàng sáng nay", "c-1");
    expect(t.sent().at(-1)).toMatchObject({
      frame: {
        case: "request",
        value: {
          id: 1n,
          request: {
            case: "sendMessage",
            value: { roomId: KHO_HCM, text: "Lô hàng sáng nay", cid: "c-1" },
          },
        },
      },
    });

    t.receive({
      frame: {
        case: "response",
        value: {
          id: 1n,
          code: 0,
          result: { case: "sendMessage", value: { seq: 144n } },
        },
      },
    });

    await expect(sending).resolves.toEqual({
      cid: "c-1",
      seq: 144,
      createdAtMs: null,
    });
    t.client.close();
  });

  it("rejects with server_error carrying the gRPC code", async () => {
    const t = createTestClient();
    await t.openAndReady();
    const sending = t.client.sendMessage(KHO_HCM, "x", "c-1");

    t.receive({
      frame: {
        case: "response",
        value: { id: 1n, code: 8, message: "slow down" },
      },
    });

    await expect(sending).rejects.toMatchObject({
      reason: "server_error",
      code: 8,
    });
    t.client.close();
  });

  it("rejects at once with not_connected before ready", async () => {
    const t = createTestClient();

    await expect(
      t.client.sendMessage(KHO_HCM, "x", "c-1"),
    ).rejects.toMatchObject({ reason: "not_connected" });
    expect(t.sockets).toHaveLength(0);
  });

  it("rejects in-flight commands with connection_lost when the socket drops", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const t = createTestClient();
    await t.openAndReady();
    const sending = t.client.sendMessage(KHO_HCM, "x", "c-1");
    const assertion = expect(sending).rejects.toMatchObject({
      reason: "connection_lost",
    });

    t.socket().simulateClose(1006);

    await assertion;
    t.client.close();
  });

  it("rejects with timeout when no response arrives within commandTimeoutMs", async () => {
    const t = createTestClient();
    await t.openAndReady();
    const sending = t.client.sendMessage(KHO_HCM, "x", "c-1");
    const assertion = expect(sending).rejects.toMatchObject({
      reason: "timeout",
    });

    vi.advanceTimersByTime(10000);

    await assertion;
    t.client.close();
  });

  it("sends rooms opened before ready once ready arrives", async () => {
    const t = createTestClient();
    t.client.connect();
    t.socket().simulateOpen();
    await flushMicrotasks();

    t.client.openRoom(KHO_HCM);
    expect(t.sent().map((f) => f.frame.case)).toEqual(["auth"]);

    t.receive({ frame: { case: "ready", value: {} } });
    expect(t.sent().at(-1)).toMatchObject({
      frame: { case: "openRoom", value: { roomId: KHO_HCM } },
    });
    t.client.close();
  });

  it("sends neither typing nor close_room before ready and does not replay a room closed while waiting", async () => {
    const t = createTestClient();
    t.client.connect();
    t.socket().simulateOpen();
    await flushMicrotasks();

    t.client.openRoom(KHO_HCM);
    t.client.sendTyping(KHO_HCM);
    t.client.sendTyping(KHO_HCM, true);
    t.client.closeRoom(KHO_HCM);
    expect(t.sent().map((f) => f.frame.case)).toEqual(["auth"]);

    t.receive({ frame: { case: "ready", value: {} } });
    expect(t.sent().map((f) => f.frame.case)).toEqual(["auth"]);
    t.client.close();
  });

  it("re-sends open rooms and the watch list after every ready, and only open rooms after resync", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const t = createTestClient();
    await t.openAndReady();
    t.client.openRoom(KHO_HCM);
    t.client.watchPresence([ALICE, ALICE]);
    expect(t.sent().at(-1)).toMatchObject({
      frame: { case: "watchPresence", value: { userIds: [ALICE] } },
    });

    const sentBeforeResync = t.sent().length;
    t.receive({ frame: { case: "resync", value: { reason: 1 } } });
    expect(t.sent().slice(sentBeforeResync)).toMatchObject([
      { frame: { case: "openRoom", value: { roomId: KHO_HCM } } },
    ]);

    t.socket().simulateClose(1001);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.sockets).toHaveLength(2);
    await t.readyOnLatest();

    expect(t.sent().map((f) => f.frame.case)).toEqual([
      "auth",
      "openRoom",
      "watchPresence",
    ]);
    t.client.close();
  });

  it("keeps at most 200 unique ids in the presence watch list", async () => {
    const t = createTestClient();
    await t.openAndReady();
    const ids = Array.from(
      { length: 250 },
      (_, i) => `user${String(i).padStart(7, "0")}`,
    );

    t.client.watchPresence(ids);

    const last = t.sent().at(-1);
    expect(
      last?.frame.case === "watchPresence" ? last.frame.value.userIds : [],
    ).toHaveLength(200);
    t.client.close();
  });

  it("flushes the pending MarkRead before close_room and forgets the room", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const t = createTestClient();
    await t.openAndReady();
    t.client.openRoom(KHO_HCM);

    t.client.markRead(KHO_HCM, 144);
    t.client.markRead(KHO_HCM, 146);
    t.client.closeRoom(KHO_HCM);

    expect(t.sent().slice(-3)).toMatchObject([
      {
        frame: {
          case: "request",
          value: {
            request: {
              case: "markRead",
              value: { roomId: KHO_HCM, seq: 144n },
            },
          },
        },
      },
      {
        frame: {
          case: "request",
          value: {
            request: {
              case: "markRead",
              value: { roomId: KHO_HCM, seq: 146n },
            },
          },
        },
      },
      { frame: { case: "closeRoom", value: { roomId: KHO_HCM } } },
    ]);

    t.socket().simulateClose(1006);
    await vi.advanceTimersByTimeAsync(0);
    await t.readyOnLatest();
    expect(t.sent().map((f) => f.frame.case)).toEqual(["auth"]);
    t.client.close();
  });

  it("waits for in-flight MarkRead responses before calling ListMyRooms", async () => {
    const fetchMock = stubServerFetch({ items: [] });
    const t = createTestClient();
    await t.openAndReady();
    const calledListMyRooms = () =>
      fetchMock.mock.calls.some(([url]) =>
        String(url).endsWith("/ListMyRooms"),
      );

    t.client.markRead(KHO_HCM, 144);
    const rooms = t.client.listMyRooms();
    await flushMicrotasks();
    expect(calledListMyRooms()).toBe(false);

    t.receive({
      frame: {
        case: "response",
        value: {
          id: 1n,
          code: 0,
          result: { case: "markRead", value: { readSeq: 144n, readVer: 1n } },
        },
      },
    });

    await expect(rooms).resolves.toEqual({ items: [] });
    expect(calledListMyRooms()).toBe(true);
    t.client.close();
  });

  it("returns the chat user id from the exchanged token", async () => {
    const t = createTestClient();
    await expect(t.client.getMyUserId()).resolves.toBe(LAN_CHAT_USER_ID);
    t.client.close();
  });
});
