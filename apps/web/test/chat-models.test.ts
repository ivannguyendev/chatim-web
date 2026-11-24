import { describe, expect, it } from "vitest";
import {
  type ChatMessageView,
  isSafeHttpUrl,
  mergeMessageIntoTimeline,
  normalizeHistoryResponse,
  normalizeProtoMessage,
  normalizeRoomsResponse,
  parseTimestampMs,
} from "../src/lib/chat-models";
import { createAppQueryClient, queryKeys } from "../src/lib/query-client";

describe("query-client", () => {
  it("scopes all query keys by userId and configures QueryClient defaults", () => {
    expect(queryKeys.profile("u_1")).toEqual(["profile", "u_1"]);
    expect(queryKeys.profile("u_1")).not.toEqual(queryKeys.profile("u_2"));

    expect(queryKeys.user("u_1", "u_peer")).toEqual(["user", "u_1", "u_peer"]);
    expect(queryKeys.rooms("u_1")).toEqual(["rooms", "u_1"]);
    expect(queryKeys.messages("u_1", "r_1")).toEqual([
      "messages",
      "u_1",
      "r_1",
    ]);

    const client = createAppQueryClient();
    const defaults = client.getDefaultOptions().queries;
    expect(defaults?.retry).toBe(1);
    expect(defaults?.refetchOnWindowFocus).toBe(false);
    expect(defaults?.staleTime).toBe(30_000);
  });
});

describe("isSafeHttpUrl", () => {
  it("accepts http and https URLs and rejects dangerous or invalid inputs", () => {
    expect(isSafeHttpUrl("https://cdn.example.com/avatar.png")).toBe(true);
    expect(isSafeHttpUrl("  http://localhost:8080/img.jpg  ")).toBe(true);

    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
    expect(isSafeHttpUrl("   ")).toBe(false);
    expect(isSafeHttpUrl(null)).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);
    expect(isSafeHttpUrl(123)).toBe(false);
    expect(isSafeHttpUrl({})).toBe(false);
  });
});

describe("normalizeRoomsResponse", () => {
  it("parses Connect items with group and DM rooms, resolves peerUserId, clamps unread and ignores malformed entries", () => {
    const connectPayload = {
      items: [
        {
          room: {
            id: "r_group",
            name: "Kho HCM",
            type: "ROOM_TYPE_GROUP",
            memberCount: 12,
          },
          unread: { count: 4 },
          preview: { text: "Hàng đã xuất kho" },
        },
        {
          room: {
            id: "r_dm_enum",
            type: "ROOM_TYPE_DM",
            directUsers: ["u_me", "u_peer_1"],
          },
          unread: { count: -5 },
          preview: { text: "Chào bạn" },
        },
        {
          room: {
            roomId: "r_dm_num",
            type: 1,
            directUsers: ["u_peer_2", "u_me"],
          },
          unread: { count: 2.9 },
        },
        {
          room: { id: "   " },
        },
        null,
        "invalid",
      ],
    };

    const rooms = normalizeRoomsResponse(connectPayload, "u_me");
    expect(rooms).toEqual([
      {
        id: "r_group",
        name: "Kho HCM",
        isDirect: false,
        peerUserId: null,
        memberCount: 12,
        unreadCount: 4,
        lastMessageText: "Hàng đã xuất kho",
      },
      {
        id: "r_dm_enum",
        name: "u_peer_1",
        isDirect: true,
        peerUserId: "u_peer_1",
        memberCount: 2,
        unreadCount: 0,
        lastMessageText: "Chào bạn",
      },
      {
        id: "r_dm_num",
        name: "u_peer_2",
        isDirect: true,
        peerUserId: "u_peer_2",
        memberCount: 2,
        unreadCount: 2,
        lastMessageText: "",
      },
    ]);
  });

  it("parses flat rooms arrays and handles non-record responses", () => {
    const flatPayload = {
      rooms: [
        {
          id: "r_flat_dm",
          name: "Nguyễn Văn A",
          isDirect: true,
          peerUserId: "u_explicit",
          unreadCount: 3,
          lastMessageText: "Xin chào",
        },
        {
          id: "r_flat_group",
          name: "Chung",
          unreadCount: -1,
        },
      ],
    };

    expect(normalizeRoomsResponse(flatPayload, "u_me")).toEqual([
      {
        id: "r_flat_dm",
        name: "Nguyễn Văn A",
        isDirect: true,
        peerUserId: "u_explicit",
        memberCount: 2,
        unreadCount: 3,
        lastMessageText: "Xin chào",
      },
      {
        id: "r_flat_group",
        name: "Chung",
        isDirect: false,
        peerUserId: null,
        memberCount: 1,
        unreadCount: 0,
        lastMessageText: "",
      },
    ]);

    expect(normalizeRoomsResponse(null, "u_me")).toEqual([]);
    expect(normalizeRoomsResponse({}, "u_me")).toEqual([]);
  });
});

describe("normalizeProtoMessage and normalizeHistoryResponse", () => {
  it("parses bigint, numeric and string seq values while rejecting non-positive, NaN or unsafe seq", () => {
    const fromBigInt = normalizeProtoMessage(
      {
        seq: 42n,
        sender: "u_1",
        text: "BigInt seq",
        createdAt: "2026-11-24T10:00:00.000Z",
      },
      "r_1",
    );
    expect(fromBigInt?.seq).toBe(42);
    expect(fromBigInt?.key).toBe("seq-42");
    expect(fromBigInt?.createdAtMs).toBe(
      Date.parse("2026-11-24T10:00:00.000Z"),
    );

    const fromNumber = normalizeProtoMessage(
      {
        roomId: "r_custom",
        seq: 7,
        senderId: "u_2",
        text: "Numeric seq",
        createdAt: { seconds: "1700000000", nanos: 250_000_000 },
      },
      "r_fallback",
    );
    expect(fromNumber).toEqual({
      key: "seq-7",
      cid: undefined,
      roomId: "r_custom",
      seq: 7,
      senderId: "u_2",
      text: "Numeric seq",
      createdAtMs: 1_700_000_000_250,
      status: "sent",
    });

    const fromString = normalizeProtoMessage(
      {
        seq: "105",
        cid: "c_105",
        sender: "u_1",
        text: "String seq",
        createdAt: 1_700_000_001_000,
      },
      "r_1",
    );
    expect(fromString?.seq).toBe(105);
    expect(fromString?.key).toBe("c_105");

    expect(normalizeProtoMessage({ seq: 0, text: "zero" }, "r_1")).toBeNull();
    expect(normalizeProtoMessage({ seq: -3, text: "neg" }, "r_1")).toBeNull();
    expect(normalizeProtoMessage({ seq: 0n, text: "zero" }, "r_1")).toBeNull();
    expect(
      normalizeProtoMessage({ seq: Number.NaN, text: "nan" }, "r_1"),
    ).toBeNull();
    expect(
      normalizeProtoMessage(
        { seq: Number.MAX_SAFE_INTEGER + 1, text: "unsafe" },
        "r_1",
      ),
    ).toBeNull();
    expect(
      normalizeProtoMessage(
        { seq: "9007199254740993", text: "unsafe-str" },
        "r_1",
      ),
    ).toBeNull();
  });

  it("skips deleted and hidden messages and normalizes history ordered by seq", () => {
    expect(
      normalizeProtoMessage({ seq: 1, text: "del", deleted: true }, "r_1"),
    ).toBeNull();
    expect(
      normalizeProtoMessage({ seq: 2, text: "hid", hidden: true }, "r_1"),
    ).toBeNull();

    const history = normalizeHistoryResponse(
      {
        messages: [
          {
            seq: "3",
            sender: "u_2",
            text: "Ba",
            createdAt: "2026-11-24T10:03:00Z",
          },
          {
            seq: 1,
            sender: "u_1",
            text: "Một",
            createdAt: { seconds: 1_700_000_010, nanos: 0 },
          },
          {
            seq: 2,
            deleted: true,
            sender: "u_1",
            text: "Đã xóa",
          },
          {
            seq: 4,
            hidden: true,
            sender: "u_2",
            text: "Đã ẩn",
          },
          {
            seq: 2n,
            sender: "u_1",
            text: "Hai",
            createdAt: "2026-11-24T10:02:00Z",
          },
        ],
      },
      "r_1",
    );

    expect(history.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(history.map((m) => m.text)).toEqual(["Một", "Hai", "Ba"]);
    expect(parseTimestampMs({ seconds: 10, nanos: 5_000_000 })).toBe(10_005);
    expect(normalizeHistoryResponse(null, "r_1")).toEqual([]);
  });
});

describe("mergeMessageIntoTimeline", () => {
  it("reconciles optimistic cid, deduplicates seq, sorts confirmed ascending and keeps pending at the end without mutating input", () => {
    const confirmed1: ChatMessageView = {
      key: "seq-10",
      roomId: "r_1",
      seq: 10,
      senderId: "u_1",
      text: "Tin 10",
      createdAtMs: 1_000,
      status: "sent",
    };
    const optimistic1: ChatMessageView = {
      key: "cid-opt-1",
      cid: "cid-opt-1",
      roomId: "r_1",
      seq: null,
      senderId: "u_me",
      text: "Đang gửi 1",
      createdAtMs: 2_000,
      status: "sending",
    };
    const optimistic2: ChatMessageView = {
      key: "cid-opt-2",
      cid: "cid-opt-2",
      roomId: "r_1",
      seq: null,
      senderId: "u_me",
      text: "Đang gửi 2",
      createdAtMs: 3_000,
      status: "sending",
    };

    const initial: ReadonlyArray<ChatMessageView> = [
      confirmed1,
      optimistic1,
      optimistic2,
    ];
    const snapshot = structuredClone(initial);

    const serverAckForOpt1: ChatMessageView = {
      key: "cid-opt-1",
      cid: "cid-opt-1",
      roomId: "r_1",
      seq: 12,
      senderId: "u_me",
      text: "Đang gửi 1",
      createdAtMs: 2_100,
      status: "sent",
    };

    const afterAck = mergeMessageIntoTimeline(initial, serverAckForOpt1);
    expect(initial).toEqual(snapshot);
    expect(
      afterAck.map((m) => ({ key: m.key, seq: m.seq, status: m.status })),
    ).toEqual([
      { key: "seq-10", seq: 10, status: "sent" },
      { key: "cid-opt-1", seq: 12, status: "sent" },
      { key: "cid-opt-2", seq: null, status: "sending" },
    ]);

    const outOfOrderConfirmed: ChatMessageView = {
      key: "seq-11",
      roomId: "r_1",
      seq: 11,
      senderId: "u_other",
      text: "Tin xen giữa 11",
      createdAtMs: 2_050,
      status: "sent",
    };

    const afterOutOfOrder = mergeMessageIntoTimeline(
      afterAck,
      outOfOrderConfirmed,
    );
    expect(afterOutOfOrder.map((m) => m.seq)).toEqual([10, 11, 12, null]);

    const duplicateSeq11: ChatMessageView = {
      key: "seq-11",
      roomId: "r_1",
      seq: 11,
      senderId: "u_other",
      text: "Tin xen giữa 11",
      createdAtMs: 2_050,
      status: "sent",
    };

    const afterDuplicate = mergeMessageIntoTimeline(
      afterOutOfOrder,
      duplicateSeq11,
    );
    expect(afterDuplicate).toHaveLength(4);
    expect(afterDuplicate.map((m) => m.seq)).toEqual([10, 11, 12, null]);
  });
});
