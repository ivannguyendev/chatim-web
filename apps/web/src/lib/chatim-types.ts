import type { UserProfile } from "@chatim/sdk";

export type SdkStatus =
  | "disconnected"
  | "connecting"
  | "waiting_auth"
  | "running";

export type UiConnectionStatus =
  | "connected"
  | "connecting"
  | "disconnected"
  | "reauth_required";

export type OtherEventPayloadCase =
  | "roomCreated"
  | "messageEdited"
  | "messageDeleted"
  | "reactionChanged"
  | "countsChanged"
  | "messagePinned"
  | "messageUnpinned"
  | "memberAdded"
  | "memberRemoved"
  | "memberRoleChanged"
  | "memberCountChanged"
  | "memberPriorityChanged"
  | "historyCleared"
  | "bookmarkChanged"
  | "roomUpdated"
  | "roomPreferencesChanged"
  | "readPositions"
  | undefined;

export type IncomingEventPayload =
  | {
      case: "messageCreated";
      value: {
        message?: unknown;
      };
    }
  | {
      case: OtherEventPayloadCase;
      value?: unknown;
    };

export interface IncomingServerFrame {
  frame:
    | { case: "response"; value: unknown }
    | { case: "ready"; value: unknown }
    | {
        case: "event";
        value: {
          roomId: string;
          payload: IncomingEventPayload;
        };
      }
    | { case: "notification"; value: unknown }
    | { case: "resync"; value: { reason: number } }
    | { case: "roomClosed"; value: { roomId: string; reason: number } }
    | { case: "loadFailed"; value: { retryAfterMs: number } }
    | {
        case: "typing";
        value: { roomId: string; userId: string; stopped: boolean };
      }
    | {
        case: "presence";
        value: {
          entries: ReadonlyArray<{ userId: string; online: boolean }>;
        };
      }
    | { case: "retryLater"; value: { retryAfterMs: number } }
    | { case: "authRequired"; value: { reason: number } }
    | { case: "frameError"; value: { reason: number } }
    | { case: undefined; value?: undefined };
}

export interface ChatimClientAdapter {
  readonly status: SdkStatus;
  connect(): void;
  close(): void;
  onStatusChange(handler: (status: SdkStatus) => void): () => void;
  onFrame(handler: (frame: IncomingServerFrame) => void): () => void;
  sendMessage(roomId: string, text: string, cid?: string): void;
  sendTyping(roomId: string, stopped?: boolean): void;
  openRoom(roomId: string): void;
  closeRoom(roomId: string): void;
  watchPresence(userIds: string[]): void;
  listMyRooms(): Promise<unknown>;
  getHistory(roomId: string, limit?: number): Promise<unknown>;
  getUser(userId: string): Promise<UserProfile | null>;
  getMyProfile(): Promise<UserProfile>;
}
