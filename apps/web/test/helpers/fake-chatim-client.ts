import type { UserProfile } from "@chatim/sdk";
import { vi } from "vitest";
import type {
  ChatimClientAdapter,
  IncomingServerFrame,
  SdkStatus,
} from "../../src/lib/chatim-types";

export class FakeChatimClient implements ChatimClientAdapter {
  private _status: SdkStatus = "disconnected";
  private readonly statusHandlers = new Set<(status: SdkStatus) => void>();
  private readonly frameHandlers = new Set<
    (frame: IncomingServerFrame) => void
  >();

  get status(): SdkStatus {
    return this._status;
  }

  get statusListenerCount(): number {
    return this.statusHandlers.size;
  }

  get frameListenerCount(): number {
    return this.frameHandlers.size;
  }

  readonly connect = vi.fn(() => {
    this.emitStatus("connecting");
  });

  readonly close = vi.fn(() => {
    this.emitStatus("disconnected");
  });

  readonly onStatusChange = vi.fn((handler: (status: SdkStatus) => void) => {
    this.statusHandlers.add(handler);
    return () => {
      this.statusHandlers.delete(handler);
    };
  });

  readonly onFrame = vi.fn((handler: (frame: IncomingServerFrame) => void) => {
    this.frameHandlers.add(handler);
    return () => {
      this.frameHandlers.delete(handler);
    };
  });

  readonly sendMessage =
    vi.fn<(roomId: string, text: string, cid?: string) => void>();

  readonly sendTyping = vi.fn<(roomId: string, stopped?: boolean) => void>();

  readonly openRoom = vi.fn<(roomId: string) => void>();

  readonly closeRoom = vi.fn<(roomId: string) => void>();

  readonly watchPresence = vi.fn<(userIds: string[]) => void>();

  readonly listMyRooms = vi.fn<() => Promise<unknown>>(async () => ({
    items: [],
  }));

  readonly getHistory = vi.fn<
    (roomId: string, limit?: number) => Promise<unknown>
  >(async () => ({
    messages: [],
  }));

  readonly getUser = vi.fn<(userId: string) => Promise<UserProfile | null>>(
    async () => null,
  );

  readonly getMyProfile = vi.fn<() => Promise<UserProfile>>(async () => ({
    id: "lan",
    displayName: "Lan Nguyễn",
  }));

  emitStatus(nextStatus: SdkStatus): void {
    if (this._status !== nextStatus) {
      this._status = nextStatus;
      for (const handler of this.statusHandlers) {
        handler(nextStatus);
      }
    }
  }

  emitReady(): void {
    this.emitStatus("running");
    this.emitFrame({ frame: { case: "ready", value: {} } });
  }

  emitFrame(frame: IncomingServerFrame): void {
    for (const handler of this.frameHandlers) {
      handler(frame);
    }
  }
}
