import type { UserProfile } from "@chatim/sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatMessageView, ChatRoomView } from "../src/lib/chat-models";
import {
  ChatimProvider,
  useChatimClient,
  useConnectionStatus,
  useMyProfile,
  usePresenceMap,
  useTypingUsers,
  useUserProfile,
} from "../src/lib/chatim-provider";
import { createAppQueryClient, queryKeys } from "../src/lib/query-client";
import { FakeChatimClient } from "./helpers/fake-chatim-client";

function RealtimeProbe({
  roomId,
  onPresenceRender,
}: {
  roomId: string | null;
  onPresenceRender?: (map: Readonly<Record<string, boolean>>) => void;
}) {
  const client = useChatimClient();
  const status = useConnectionStatus();
  const presence = usePresenceMap();
  const typingUsers = useTypingUsers(roomId);
  onPresenceRender?.(presence);

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="presence">{JSON.stringify(presence)}</span>
      <span data-testid="typing">{typingUsers.join(",")}</span>
      <button type="button" onClick={() => client.openRoom("r_probe")}>
        open
      </button>
    </div>
  );
}

function ProfileProbe({
  fallbackName,
  targetUserId,
}: {
  fallbackName: string;
  targetUserId: string;
}) {
  const me = useMyProfile(fallbackName);
  const peer = useUserProfile(targetUserId);

  return (
    <div>
      <span data-testid="my-name">{me.displayName}</span>
      <span data-testid="my-avatar">{me.avatarUrl ?? "none"}</span>
      <span data-testid="peer-name">{peer.displayName}</span>
      <span data-testid="peer-avatar">{peer.avatarUrl ?? "none"}</span>
    </div>
  );
}

describe("ChatimProvider and realtime hooks", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("connects on mount, maps status transitions, updates presence without no-op clones, and handles typing expiry and stopped flags", () => {
    vi.useFakeTimers();
    const fakeClient = new FakeChatimClient();
    const queryClient = createAppQueryClient();
    let latestPresence: Readonly<Record<string, boolean>> = {};

    render(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId="r_1"
          getSubjectToken={async () => "dev.subject.token"}
          clientFactory={() => fakeClient}
        >
          <RealtimeProbe
            roomId="r_1"
            onPresenceRender={(m) => {
              latestPresence = m;
            }}
          />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    expect(fakeClient.connect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status").textContent).toBe("connecting");

    act(() => {
      fakeClient.emitStatus("waiting_auth");
    });
    expect(screen.getByTestId("status").textContent).toBe("connecting");

    act(() => {
      fakeClient.emitReady();
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "presence",
          value: {
            entries: [
              { userId: "alice", online: true },
              { userId: "bob", online: false },
            ],
          },
        },
      });
    });
    expect(JSON.parse(screen.getByTestId("presence").textContent!)).toEqual({
      alice: true,
      bob: false,
    });
    const snapshotPresence = latestPresence;

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "presence",
          value: {
            entries: [
              { userId: "alice", online: true },
              { userId: "bob", online: false },
            ],
          },
        },
      });
    });
    expect(latestPresence).toBe(snapshotPresence);

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "presence",
          value: { entries: [{ userId: "bob", online: true }] },
        },
      });
    });
    expect(JSON.parse(screen.getByTestId("presence").textContent!)).toEqual({
      alice: true,
      bob: true,
    });

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "r_1", userId: "lan", stopped: false },
        },
      });
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "   ", userId: "alice", stopped: false },
        },
      });
    });
    expect(screen.getByTestId("typing").textContent).toBe("");

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "r_1", userId: "alice", stopped: false },
        },
      });
    });
    expect(screen.getByTestId("typing").textContent).toBe("alice");

    act(() => {
      vi.advanceTimersByTime(2500);
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "r_1", userId: "alice", stopped: false },
        },
      });
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("typing").textContent).toBe("alice");

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByTestId("typing").textContent).toBe("");

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "r_1", userId: "bob", stopped: false },
        },
      });
    });
    expect(screen.getByTestId("typing").textContent).toBe("bob");

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "r_1", userId: "bob", stopped: true },
        },
      });
    });
    expect(screen.getByTestId("typing").textContent).toBe("");
  });

  it("patches messages and rooms caches on messageCreated, marks unseeded room messages invalidated, and invalidates rooms when room is unknown", () => {
    const fakeClient = new FakeChatimClient();
    const queryClient = createAppQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const initialRooms: ChatRoomView[] = [
      {
        id: "r_active",
        name: "Phòng Đang Mở",
        isDirect: false,
        peerUserId: null,
        memberCount: 3,
        unreadCount: 0,
        lastMessageText: "Tin cũ 1",
      },
      {
        id: "r_inactive",
        name: "Kho HCM",
        isDirect: false,
        peerUserId: null,
        memberCount: 5,
        unreadCount: 2,
        lastMessageText: "Tin cũ 2",
      },
    ];
    const optimisticMsg: ChatMessageView = {
      key: "cid-opt-1",
      cid: "cid-opt-1",
      roomId: "r_active",
      seq: null,
      senderId: "lan",
      text: "Tin đang gửi",
      createdAtMs: 1_000,
      status: "sending",
    };

    queryClient.setQueryData(queryKeys.rooms("lan"), initialRooms);
    queryClient.setQueryData(queryKeys.messages("lan", "r_active"), [
      optimisticMsg,
    ]);

    render(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId="r_active"
          getSubjectToken={async () => "dev.subject.token"}
          clientFactory={() => fakeClient}
        >
          <RealtimeProbe roomId="r_active" />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "typing",
          value: { roomId: "r_active", userId: "alice", stopped: false },
        },
      });
    });
    expect(screen.getByTestId("typing").textContent).toBe("alice");

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "event",
          value: {
            roomId: "r_active",
            payload: {
              case: "messageCreated",
              value: {
                message: {
                  roomId: "r_active",
                  seq: 10n,
                  sender: "alice",
                  text: "Chào Lan",
                  createdAt: 1_500,
                },
              },
            },
          },
        },
      });
    });

    expect(screen.getByTestId("typing").textContent).toBe("");

    const activeTimeline = queryClient.getQueryData<ChatMessageView[]>(
      queryKeys.messages("lan", "r_active"),
    );
    expect(activeTimeline?.map((m) => ({ seq: m.seq, text: m.text }))).toEqual([
      { seq: 10, text: "Chào Lan" },
      { seq: null, text: "Tin đang gửi" },
    ]);

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "event",
          value: {
            roomId: "r_inactive",
            payload: {
              case: "messageCreated",
              value: {
                message: {
                  roomId: "r_inactive",
                  seq: 20n,
                  sender: "bob",
                  text: "Hàng mới nhập kho",
                  createdAt: 2_000,
                },
              },
            },
          },
        },
      });
      fakeClient.emitFrame({
        frame: {
          case: "event",
          value: {
            roomId: "r_inactive",
            payload: {
              case: "messageCreated",
              value: {
                message: {
                  roomId: "r_inactive",
                  seq: 21n,
                  sender: "lan",
                  text: "Đã nhận thông tin",
                  createdAt: 2_500,
                },
              },
            },
          },
        },
      });
    });

    expect(
      queryClient.getQueryState(queryKeys.messages("lan", "r_inactive"))
        ?.dataUpdatedAt,
    ).toBe(0);

    const updatedRooms = queryClient.getQueryData<ChatRoomView[]>(
      queryKeys.rooms("lan"),
    );
    expect(updatedRooms).toEqual([
      {
        ...initialRooms[0]!,
        lastMessageText: "Chào Lan",
        unreadCount: 0,
      },
      {
        ...initialRooms[1]!,
        lastMessageText: "Đã nhận thông tin",
        unreadCount: 3,
      },
    ]);

    invalidateSpy.mockClear();

    act(() => {
      fakeClient.emitFrame({
        frame: {
          case: "event",
          value: {
            roomId: "r_unknown_new",
            payload: {
              case: "messageCreated",
              value: {
                message: {
                  roomId: "r_unknown_new",
                  seq: 1n,
                  sender: "alice",
                  text: "Phòng mới tạo",
                  createdAt: 3_000,
                },
              },
            },
          },
        },
      });
    });

    expect(queryClient.getQueryData(queryKeys.rooms("lan"))).toBe(updatedRooms);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.rooms("lan"),
    });
  });

  it("invalidates rooms and active room messages queries when receiving resync", () => {
    const fakeClient = new FakeChatimClient();
    const queryClient = createAppQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId="r_active"
          getSubjectToken={async () => "dev.subject.token"}
          clientFactory={() => fakeClient}
        >
          <RealtimeProbe roomId="r_active" />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.emitFrame({
        frame: { case: "resync", value: { reason: 1 } },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.rooms("lan"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.messages("lan", "r_active"),
    });

    invalidateSpy.mockClear();

    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId={null}
          getSubjectToken={async () => "dev.subject.token"}
          clientFactory={() => fakeClient}
        >
          <RealtimeProbe roomId={null} />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.emitFrame({
        frame: { case: "resync", value: { reason: 2 } },
      });
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.rooms("lan"),
    });
  });

  it("transitions to reauth_required and closes client when authRequired has reason REVOKED (4)", () => {
    const fakeClient = new FakeChatimClient();
    const queryClient = createAppQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId={null}
          getSubjectToken={async () => "dev.subject.token"}
          clientFactory={() => fakeClient}
        >
          <RealtimeProbe roomId={null} />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    act(() => {
      fakeClient.emitReady();
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");

    act(() => {
      fakeClient.emitFrame({
        frame: { case: "authRequired", value: { reason: 4 } },
      });
    });

    expect(fakeClient.close).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status").textContent).toBe("reauth_required");

    act(() => {
      fakeClient.emitStatus("connecting");
    });
    expect(screen.getByTestId("status").textContent).toBe("reauth_required");

    act(() => {
      fakeClient.emitStatus("running");
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");
  });

  it("handles React StrictMode double-mount cleanly by closing first client and connecting a fresh second client", () => {
    const createdClients: FakeChatimClient[] = [];
    const queryClient = createAppQueryClient();

    const { unmount } = render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <ChatimProvider
            userId="lan"
            activeRoomId="r_1"
            getSubjectToken={async () => "dev.subject.token"}
            clientFactory={() => {
              const instance = new FakeChatimClient();
              createdClients.push(instance);
              return instance;
            }}
          >
            <RealtimeProbe roomId="r_1" />
          </ChatimProvider>
        </QueryClientProvider>
      </StrictMode>,
    );

    expect(createdClients).toHaveLength(2);
    const firstClient = createdClients[0]!;
    const secondClient = createdClients[1]!;

    expect(firstClient.connect).toHaveBeenCalledTimes(1);
    expect(firstClient.close).toHaveBeenCalledTimes(1);
    expect(firstClient.statusListenerCount).toBe(0);
    expect(firstClient.frameListenerCount).toBe(0);

    expect(secondClient.connect).toHaveBeenCalledTimes(1);
    expect(secondClient.close).not.toHaveBeenCalled();

    act(() => {
      firstClient.emitReady();
    });
    expect(screen.getByTestId("status").textContent).toBe("connecting");

    act(() => {
      secondClient.emitReady();
      secondClient.emitFrame({
        frame: {
          case: "presence",
          value: { entries: [{ userId: "alice", online: true }] },
        },
      });
    });
    expect(screen.getByTestId("status").textContent).toBe("connected");
    expect(JSON.parse(screen.getByTestId("presence").textContent!)).toEqual({
      alice: true,
    });

    act(() => {
      screen.getByRole("button", { name: "open" }).click();
    });
    expect(firstClient.openRoom).not.toHaveBeenCalled();
    expect(secondClient.openRoom).toHaveBeenCalledWith("r_probe");

    unmount();
    expect(secondClient.close).toHaveBeenCalledTimes(1);
    expect(secondClient.statusListenerCount).toBe(0);
    expect(secondClient.frameListenerCount).toBe(0);
  });

  it("resolves directory profiles via useMyProfile and useUserProfile while falling back cleanly before resolution", async () => {
    const fakeClient = new FakeChatimClient();
    const queryClient = createAppQueryClient();
    const safeAvatarUrl = new URL("/avatars/lan.png", window.location.origin)
      .href;

    let resolveMe!: (profile: UserProfile) => void;
    let resolvePeer!: (profile: UserProfile | null) => void;

    fakeClient.getMyProfile.mockImplementation(
      () =>
        new Promise<UserProfile>((resolve) => {
          resolveMe = resolve;
        }),
    );
    fakeClient.getUser.mockImplementation(
      () =>
        new Promise<UserProfile | null>((resolve) => {
          resolvePeer = resolve;
        }),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId={null}
          getSubjectToken={async () => "dev.subject.token"}
          clientFactory={() => fakeClient}
        >
          <ProfileProbe fallbackName="Lan Tạm" targetUserId="alice" />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("my-name").textContent).toBe("Lan Tạm");
    expect(screen.getByTestId("my-avatar").textContent).toBe("none");
    expect(screen.getByTestId("peer-name").textContent).toBe("alice");
    expect(screen.getByTestId("peer-avatar").textContent).toBe("none");

    await act(async () => {
      resolveMe({
        id: "lan",
        displayName: "Lan Nguyễn",
        avatarUrl: safeAvatarUrl,
      });
      resolvePeer({
        id: "alice",
        displayName: "Alice Trần",
        avatarUrl: "javascript:alert(1)",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("my-name").textContent).toBe("Lan Nguyễn");
      expect(screen.getByTestId("my-avatar").textContent).toBe(safeAvatarUrl);
      expect(screen.getByTestId("peer-name").textContent).toBe("Alice Trần");
      expect(screen.getByTestId("peer-avatar").textContent).toBe("none");
    });
  });

  it("uses updated getSubjectToken and clientFactory immediately for child queries when switching userId", async () => {
    const queryClient = createAppQueryClient();
    const lanClient = new FakeChatimClient();
    const aliceClient = new FakeChatimClient();
    const observedTokens: string[] = [];

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="lan"
          activeRoomId={null}
          getSubjectToken={async () => "lan.token"}
          clientFactory={(opts) => {
            lanClient.getMyProfile.mockImplementation(async () => {
              const token = await opts.getSubjectToken();
              observedTokens.push(`lanFactory:${token}`);
              return { id: "lan", displayName: "Lan Nguyễn" };
            });
            return lanClient;
          }}
        >
          <ProfileProbe fallbackName="Lan Tạm" targetUserId="bob" />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("my-name").textContent).toBe("Lan Nguyễn");
    });
    expect(observedTokens).toEqual(["lanFactory:lan.token"]);

    rerender(
      <QueryClientProvider client={queryClient}>
        <ChatimProvider
          userId="alice"
          activeRoomId={null}
          getSubjectToken={async () => "alice.token"}
          clientFactory={(opts) => {
            aliceClient.getMyProfile.mockImplementation(async () => {
              const token = await opts.getSubjectToken();
              observedTokens.push(`aliceFactory:${token}`);
              return { id: "alice", displayName: "Alice Trần" };
            });
            return aliceClient;
          }}
        >
          <ProfileProbe fallbackName="Alice Tạm" targetUserId="bob" />
        </ChatimProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("my-name").textContent).toBe("Alice Trần");
    });
    expect(lanClient.close).toHaveBeenCalledTimes(1);
    expect(aliceClient.connect).toHaveBeenCalledTimes(1);
    expect(observedTokens).toEqual([
      "lanFactory:lan.token",
      "aliceFactory:alice.token",
    ]);
  });
});
