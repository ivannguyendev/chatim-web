export interface ChatRoomView {
  id: string;
  name: string;
  isDirect: boolean;
  peerUserId: string | null;
  memberCount: number;
  unreadCount: number;
  lastMessageText: string;
}

export type MessageDeliveryStatus = "sending" | "sent" | "error";

export interface ChatMessageView {
  key: string;
  cid?: string;
  roomId: string;
  seq: number | null;
  senderId: string;
  text: string;
  createdAtMs: number;
  status: MessageDeliveryStatus;
}

const MAX_SAFE_SEQ = BigInt(Number.MAX_SAFE_INTEGER);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  return trimmed.startsWith("https://") || trimmed.startsWith("http://");
}

function parseSeq(raw: unknown): number | null {
  if (typeof raw === "bigint") {
    return raw > 0n && raw <= MAX_SAFE_SEQ ? Number(raw) : null;
  }
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const asBig = BigInt(raw.trim());
    return asBig > 0n && asBig <= MAX_SAFE_SEQ ? Number(asBig) : null;
  }
  return null;
}

export function parseTimestampMs(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Date.parse(raw);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  if (isRecord(raw) && raw.seconds !== undefined) {
    const sec = Number(raw.seconds);
    const nanos =
      typeof raw.nanos === "number" && Number.isFinite(raw.nanos)
        ? raw.nanos
        : 0;
    if (Number.isFinite(sec) && sec > 0) {
      return sec * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return Date.now();
}

function normalizeSingleRoom(
  entry: unknown,
  currentUserId: string,
): ChatRoomView | null {
  if (!isRecord(entry)) {
    return null;
  }
  const roomObj = isRecord(entry.room) ? entry.room : entry;
  const rawId = roomObj.id ?? roomObj.roomId;
  const id = typeof rawId === "string" ? rawId.trim() : "";
  if (!id) {
    return null;
  }

  const rawType = roomObj.type;
  const isDirect =
    roomObj.isDirect === true ||
    rawType === 1 ||
    rawType === "ROOM_TYPE_DM" ||
    rawType === "DM";

  const directUsers = Array.isArray(roomObj.directUsers)
    ? roomObj.directUsers
        .filter((u): u is string => typeof u === "string")
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
    : [];
  const peerFromList =
    directUsers.find((u) => u !== currentUserId) ?? directUsers[0] ?? null;
  const explicitPeer =
    typeof roomObj.peerUserId === "string" && roomObj.peerUserId.trim()
      ? roomObj.peerUserId.trim()
      : null;
  const peerUserId = isDirect ? (explicitPeer ?? peerFromList) : null;

  const rawName = typeof roomObj.name === "string" ? roomObj.name.trim() : "";
  const name = rawName || peerUserId || id;

  const memberCount =
    typeof roomObj.memberCount === "number" &&
    Number.isInteger(roomObj.memberCount) &&
    roomObj.memberCount > 0
      ? roomObj.memberCount
      : isDirect
        ? 2
        : 1;

  const unreadObj = isRecord(entry.unread) ? entry.unread : null;
  const rawUnread =
    typeof unreadObj?.count === "number"
      ? unreadObj.count
      : typeof entry.unreadCount === "number"
        ? entry.unreadCount
        : 0;
  const unreadCount =
    Number.isFinite(rawUnread) && rawUnread > 0 ? Math.floor(rawUnread) : 0;

  const previewObj = isRecord(entry.preview) ? entry.preview : null;
  const lastMessageText =
    typeof previewObj?.text === "string"
      ? previewObj.text
      : typeof entry.lastMessageText === "string"
        ? entry.lastMessageText
        : "";

  return {
    id,
    name,
    isDirect,
    peerUserId,
    memberCount,
    unreadCount,
    lastMessageText,
  };
}

export function normalizeRoomsResponse(
  raw: unknown,
  currentUserId: string,
): ChatRoomView[] {
  if (!isRecord(raw)) {
    return [];
  }
  const list = Array.isArray(raw.items)
    ? raw.items
    : Array.isArray(raw.rooms)
      ? raw.rooms
      : [];

  const result: ChatRoomView[] = [];
  for (const item of list) {
    const normalized = normalizeSingleRoom(item, currentUserId);
    if (normalized) {
      result.push(normalized);
    }
  }
  return result;
}

export function normalizeProtoMessage(
  raw: unknown,
  fallbackRoomId: string,
): ChatMessageView | null {
  if (!isRecord(raw)) {
    return null;
  }
  if (raw.deleted === true || raw.hidden === true) {
    return null;
  }
  const rawRoomId = raw.roomId ?? fallbackRoomId;
  const roomId = typeof rawRoomId === "string" ? rawRoomId.trim() : "";
  if (!roomId) {
    return null;
  }
  const seq = parseSeq(raw.seq);
  const cid =
    typeof raw.cid === "string" && raw.cid.trim().length > 0
      ? raw.cid.trim()
      : undefined;
  if (seq === null && !cid) {
    return null;
  }
  const rawSender = raw.sender ?? raw.senderId;
  const senderId = typeof rawSender === "string" ? rawSender.trim() : "";
  const text = typeof raw.text === "string" ? raw.text : "";
  const createdAtMs = parseTimestampMs(raw.createdAt);
  const key = cid ?? `seq-${seq}`;

  return {
    key,
    cid,
    roomId,
    seq,
    senderId,
    text,
    createdAtMs,
    status: "sent",
  };
}

export function normalizeHistoryResponse(
  raw: unknown,
  roomId: string,
): ChatMessageView[] {
  if (!isRecord(raw) || !Array.isArray(raw.messages)) {
    return [];
  }
  let timeline: ChatMessageView[] = [];
  for (const item of raw.messages) {
    const parsed = normalizeProtoMessage(item, roomId);
    if (parsed) {
      timeline = mergeMessageIntoTimeline(timeline, parsed);
    }
  }
  return timeline;
}

export function mergeMessageIntoTimeline(
  existing: ReadonlyArray<ChatMessageView>,
  incoming: ChatMessageView,
): ChatMessageView[] {
  const next: ChatMessageView[] = [];
  let replaced = false;

  for (const item of existing) {
    const sameSeq =
      incoming.seq !== null && item.seq !== null && item.seq === incoming.seq;
    const sameCid =
      Boolean(incoming.cid) && Boolean(item.cid) && item.cid === incoming.cid;

    if (sameSeq || sameCid) {
      if (!replaced) {
        const resolvedSeq = incoming.seq ?? item.seq;
        const resolvedStatus = resolvedSeq !== null ? "sent" : incoming.status;
        next.push({
          ...item,
          ...incoming,
          seq: resolvedSeq,
          status: resolvedStatus,
          key: item.cid ?? incoming.cid ?? incoming.key,
          cid: incoming.cid ?? item.cid,
        });
        replaced = true;
      }
    } else {
      next.push(item);
    }
  }

  if (!replaced) {
    next.push(incoming);
  }

  next.sort((a, b) => {
    if (a.seq !== null && b.seq !== null) {
      return a.seq - b.seq;
    }
    if (a.seq !== null && b.seq === null) {
      return -1;
    }
    if (a.seq === null && b.seq !== null) {
      return 1;
    }
    return a.createdAtMs - b.createdAtMs;
  });

  return next;
}
