import {
  type ChatimClientOptions,
  type UserProfile,
  createChatimClient,
} from "@chatim/sdk";
import type { QueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import {
  type ChatMessageView,
  type ChatRoomView,
  isSafeHttpUrl,
  mergeMessageIntoTimeline,
  normalizeProtoMessage,
} from "./chat-models";
import type {
  ChatimClientAdapter,
  IncomingServerFrame,
  SdkStatus,
  UiConnectionStatus,
} from "./chatim-types";
import { env } from "./env";
import { queryKeys } from "./query-client";
import { CHAT_TIMERS } from "./timers";

type ClientFactory = (opts: ChatimClientOptions) => ChatimClientAdapter;
type SetRecord<V> = Dispatch<SetStateAction<Record<string, V>>>;

export interface AdapterRefs {
  innerClient: { current: ChatimClientAdapter | null };
  getSubjectToken: { current: () => Promise<string> };
  factory: { current: ClientFactory | undefined };
}

export function createDelegatingAdapter(
  refs: AdapterRefs,
): ChatimClientAdapter {
  const ensure = (): ChatimClientAdapter => {
    if (refs.innerClient.current === null) {
      const opts: ChatimClientOptions = {
        gatewayUrl: env.GATEWAY_URL,
        wsUrl: env.WS_URL,
        identityUrl: env.IDENTITY_URL,
        getSubjectToken: () => refs.getSubjectToken.current(),
      };
      refs.innerClient.current = refs.factory.current
        ? refs.factory.current(opts)
        : createChatimClient(opts);
    }
    return refs.innerClient.current;
  };

  return {
    get status() {
      return refs.innerClient.current?.status ?? "disconnected";
    },
    connect: () => ensure().connect(),
    close: () => {
      refs.innerClient.current?.close();
      refs.innerClient.current = null;
    },
    onStatusChange: (h) => ensure().onStatusChange(h),
    onFrame: (h) => ensure().onFrame(h),
    sendMessage: (r, t, c) => ensure().sendMessage(r, t, c),
    sendTyping: (r, s) => ensure().sendTyping(r, s),
    openRoom: (r) => ensure().openRoom(r),
    closeRoom: (r) => ensure().closeRoom(r),
    watchPresence: (ids) => ensure().watchPresence(ids),
    listMyRooms: () => ensure().listMyRooms(),
    getHistory: (r, l) => ensure().getHistory(r, l),
    getUser: (u) => ensure().getUser(u),
    getMyProfile: () => ensure().getMyProfile(),
  };
}

export function mapSdkStatus(
  prev: UiConnectionStatus,
  nextStatus: SdkStatus,
): UiConnectionStatus {
  if (nextStatus === "running") return "connected";
  if (prev === "reauth_required") return "reauth_required";
  return nextStatus === "disconnected" ? "disconnected" : "connecting";
}

export function toSafeProfile(
  raw: UserProfile | null | undefined,
  fallbackId: string,
  fallbackName: string,
): UserProfile {
  const id = raw?.id?.trim() || fallbackId;
  const displayName = raw?.displayName?.trim() || fallbackName || id;
  const avatarUrl = isSafeHttpUrl(raw?.avatarUrl) ? raw.avatarUrl : undefined;
  return { id, displayName, avatarUrl, state: raw?.state };
}

export interface FrameDispatcherDeps {
  userId: string;
  activeRoomRef: { current: string | null };
  rawClient: ChatimClientAdapter;
  queryClient: QueryClient;
  typingTimers: Map<string, ReturnType<typeof setTimeout>>;
  setConnectionStatus: Dispatch<SetStateAction<UiConnectionStatus>>;
  setPresenceMap: SetRecord<boolean>;
  setTypingByRoom: SetRecord<ReadonlyArray<string>>;
}

export function createFrameHandler(
  d: FrameDispatcherDeps,
): (envelope: IncomingServerFrame) => void {
  const clearTyping = (rId: string, uId: string) => {
    const key = `${rId}\u0000${uId}`;
    const timer = d.typingTimers.get(key);
    if (timer !== undefined) {
      clearTimeout(timer);
      d.typingTimers.delete(key);
    }
    d.setTypingByRoom((prev) => {
      const cur = prev[rId];
      if (!cur || !cur.includes(uId)) return prev;
      const next = cur.filter((id) => id !== uId);
      if (next.length > 0) return { ...prev, [rId]: next };
      const { [rId]: _drop, ...rest } = prev;
      return rest;
    });
  };
  const inv = (queryKey: readonly string[]) => {
    void d.queryClient.invalidateQueries({ queryKey });
  };

  return ({ frame }) => {
    if (frame.case === "authRequired") {
      d.setConnectionStatus("reauth_required");
      if (frame.value.reason === 4) d.rawClient.close();
    } else if (frame.case === "resync") {
      inv(queryKeys.rooms(d.userId));
      if (d.activeRoomRef.current) {
        inv(queryKeys.messages(d.userId, d.activeRoomRef.current));
      }
    } else if (frame.case === "presence") {
      d.setPresenceMap((prev) => {
        const next = { ...prev };
        for (const e of frame.value.entries) {
          const id = e.userId.trim();
          if (id) next[id] = e.online;
        }
        return next;
      });
    } else if (frame.case === "typing") {
      const rId = frame.value.roomId.trim();
      const uId = frame.value.userId.trim();
      if (!rId || !uId || uId === d.userId) return;
      if (frame.value.stopped) return clearTyping(rId, uId);
      const key = `${rId}\u0000${uId}`;
      clearTimeout(d.typingTimers.get(key));
      d.typingTimers.set(
        key,
        setTimeout(() => clearTyping(rId, uId), CHAT_TIMERS.typingExpireMs),
      );
      d.setTypingByRoom((prev) => {
        const cur = prev[rId] ?? [];
        return cur.includes(uId) ? prev : { ...prev, [rId]: [...cur, uId] };
      });
    } else if (
      frame.case === "event" &&
      frame.value.payload.case === "messageCreated"
    ) {
      const parsed = normalizeProtoMessage(
        frame.value.payload.value.message,
        frame.value.roomId,
      );
      if (!parsed) return;
      const rId = parsed.roomId;
      if (parsed.senderId) clearTyping(rId, parsed.senderId);
      const msgKey = queryKeys.messages(d.userId, rId);
      const empty = d.queryClient.getQueryData(msgKey) === undefined;
      d.queryClient.setQueryData<ChatMessageView[]>(msgKey, (cur) =>
        mergeMessageIntoTimeline(cur ?? [], parsed),
      );
      if (empty) {
        void d.queryClient.invalidateQueries({
          queryKey: msgKey,
          refetchType: "none",
        });
      }
      const inc =
        d.activeRoomRef.current !== rId && parsed.senderId !== d.userId ? 1 : 0;
      const lastMessageText = parsed.text;
      d.queryClient.setQueryData<ChatRoomView[]>(
        queryKeys.rooms(d.userId),
        (rs) =>
          rs?.map((r) =>
            r.id !== rId
              ? r
              : { ...r, lastMessageText, unreadCount: r.unreadCount + inc },
          ),
      );
    }
  };
}
