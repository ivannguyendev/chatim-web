import { type ChatimClientOptions, createChatimClient } from "@chatim/sdk";
import type { ChatimClientAdapter } from "./chatim-types";
import { env } from "./env";

type ClientFactory = (opts: ChatimClientOptions) => ChatimClientAdapter;

export interface AdapterRefs {
  innerClient: { current: ChatimClientAdapter | null };
  getSubjectToken: { current: () => Promise<string> };
  factory: { current: ClientFactory | undefined };
}

export interface DelegatingAdapter {
  adapter: ChatimClientAdapter;
  ensureClient: () => ChatimClientAdapter;
}

export function createDelegatingAdapter(refs: AdapterRefs): DelegatingAdapter {
  const ensureClient = (): ChatimClientAdapter => {
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

  const adapter: ChatimClientAdapter = {
    get status() {
      return refs.innerClient.current?.status ?? "disconnected";
    },
    connect: () => ensureClient().connect(),
    close: () => {
      refs.innerClient.current?.close();
      refs.innerClient.current = null;
    },
    onStatusChange: (h) => ensureClient().onStatusChange(h),
    onFrame: (h) => ensureClient().onFrame(h),
    sendMessage: (r, t, c) => ensureClient().sendMessage(r, t, c),
    sendTyping: (r, s) => ensureClient().sendTyping(r, s),
    openRoom: (r) => ensureClient().openRoom(r),
    closeRoom: (r) => ensureClient().closeRoom(r),
    watchPresence: (ids) => ensureClient().watchPresence(ids),
    listMyRooms: () => ensureClient().listMyRooms(),
    getHistory: (r, l) => ensureClient().getHistory(r, l),
    getUser: (u) => ensureClient().getUser(u),
    getMyProfile: () => ensureClient().getMyProfile(),
  };

  return { adapter, ensureClient };
}
