import type { ChatimClientOptions, UserProfile } from "@chatim/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createDelegatingAdapter,
  createFrameHandler,
  mapSdkStatus,
  toSafeProfile,
} from "./chatim-realtime";
import type {
  ChatimClientAdapter,
  IncomingServerFrame,
  SdkStatus,
  UiConnectionStatus,
} from "./chatim-types";
import { queryKeys } from "./query-client";

export type {
  ChatimClientAdapter,
  IncomingServerFrame,
  SdkStatus,
  UiConnectionStatus,
};

export interface ChatimProviderProps {
  userId: string;
  activeRoomId: string | null;
  getSubjectToken: () => Promise<string>;
  clientFactory?: (options: ChatimClientOptions) => ChatimClientAdapter;
  children: ReactNode;
}

interface ClientScopeValue {
  client: ChatimClientAdapter;
  userId: string;
}

interface EphemeralStateValue {
  connectionStatus: UiConnectionStatus;
  presenceMap: Readonly<Record<string, boolean>>;
  typingByRoom: Readonly<Record<string, ReadonlyArray<string>>>;
}

const EMPTY_USERS: ReadonlyArray<string> = Object.freeze([]);
const ClientContext = createContext<ClientScopeValue | null>(null);
const EphemeralContext = createContext<EphemeralStateValue | null>(null);

export function ChatimProvider({
  userId,
  activeRoomId,
  getSubjectToken,
  clientFactory,
  children,
}: ChatimProviderProps) {
  const queryClient = useQueryClient();
  const innerClientRef = useRef<ChatimClientAdapter | null>(null);
  const getSubjectTokenRef = useRef(getSubjectToken);
  const activeRoomRef = useRef(activeRoomId);
  const factoryRef = useRef(clientFactory);

  const [connectionStatus, setConnectionStatus] =
    useState<UiConnectionStatus>("connecting");
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const [typingByRoom, setTypingByRoom] = useState<
    Record<string, ReadonlyArray<string>>
  >({});

  useEffect(() => {
    getSubjectTokenRef.current = getSubjectToken;
    activeRoomRef.current = activeRoomId;
    factoryRef.current = clientFactory;
  }, [getSubjectToken, activeRoomId, clientFactory]);

  const adapter = useMemo<ChatimClientAdapter>(
    () =>
      createDelegatingAdapter({
        innerClient: innerClientRef,
        getSubjectToken: getSubjectTokenRef,
        factory: factoryRef,
      }),
    [],
  );

  useEffect(() => {
    setConnectionStatus("connecting");
    setPresenceMap({});
    setTypingByRoom({});
    const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const unsubStatus = adapter.onStatusChange((nextStatus) => {
      setConnectionStatus((prev) => mapSdkStatus(prev, nextStatus));
    });
    const rawClient = innerClientRef.current!;
    const unsubFrame = rawClient.onFrame(
      createFrameHandler({
        userId,
        activeRoomRef,
        rawClient,
        queryClient,
        typingTimers,
        setConnectionStatus,
        setPresenceMap,
        setTypingByRoom,
      }),
    );

    rawClient.connect();
    return () => {
      unsubStatus();
      unsubFrame();
      for (const timer of typingTimers.values()) clearTimeout(timer);
      typingTimers.clear();
      adapter.close();
    };
  }, [adapter, queryClient, userId]);

  const scopeValue = useMemo<ClientScopeValue>(
    () => ({ client: adapter, userId }),
    [adapter, userId],
  );
  const ephemeralValue = useMemo<EphemeralStateValue>(
    () => ({ connectionStatus, presenceMap, typingByRoom }),
    [connectionStatus, presenceMap, typingByRoom],
  );

  return (
    <ClientContext.Provider value={scopeValue}>
      <EphemeralContext.Provider value={ephemeralValue}>
        {children}
      </EphemeralContext.Provider>
    </ClientContext.Provider>
  );
}

function useClientScope(): ClientScopeValue {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error("Missing ChatimProvider");
  return ctx;
}

function useEphemeralState(): EphemeralStateValue {
  const ctx = useContext(EphemeralContext);
  if (!ctx) throw new Error("Missing ChatimProvider");
  return ctx;
}

export function useChatimClient(): ChatimClientAdapter {
  return useClientScope().client;
}

export function useConnectionStatus(): UiConnectionStatus {
  return useEphemeralState().connectionStatus;
}

export function usePresenceMap(): Readonly<Record<string, boolean>> {
  return useEphemeralState().presenceMap;
}

export function useTypingUsers(roomId: string | null): ReadonlyArray<string> {
  const { typingByRoom } = useEphemeralState();
  return roomId ? (typingByRoom[roomId] ?? EMPTY_USERS) : EMPTY_USERS;
}

export function useMyProfile(fallbackDisplayName: string): UserProfile {
  const { client, userId } = useClientScope();
  const { data } = useQuery({
    queryKey: queryKeys.profile(userId),
    queryFn: () => client.getMyProfile(),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
  });
  return toSafeProfile(data, userId, fallbackDisplayName.trim());
}

export function useUserProfile(targetUserId: string): UserProfile {
  const { client, userId } = useClientScope();
  const trimmed = targetUserId.trim();
  const { data } = useQuery({
    queryKey: queryKeys.user(userId, trimmed),
    queryFn: () => client.getUser(trimmed),
    enabled: Boolean(userId && trimmed),
    staleTime: 5 * 60_000,
  });
  return toSafeProfile(data, trimmed, trimmed);
}
