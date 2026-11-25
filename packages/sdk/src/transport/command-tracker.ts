import type { ServerResponse } from "../gen/chatim/v1/ws_pb";

export type CommandFailureReason =
  | "not_connected"
  | "connection_lost"
  | "timeout"
  | "server_error";

export class ChatimCommandError extends Error {
  readonly reason: CommandFailureReason;
  readonly code: number;

  constructor(reason: CommandFailureReason, code = 0, detail = "") {
    super(detail ? `${reason} (code ${code}): ${detail}` : reason);
    this.name = "ChatimCommandError";
    this.reason = reason;
    this.code = code;
  }
}

interface PendingCommand {
  resolve: (response: ServerResponse) => void;
  reject: (error: ChatimCommandError) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class CommandTracker {
  private readonly timeoutMs: number;
  private nextId = 1n;
  private readonly pending = new Map<bigint, PendingCommand>();

  constructor(timeoutMs: number) {
    this.timeoutMs = timeoutMs;
  }

  get inFlight(): number {
    return this.pending.size;
  }

  start(): { id: bigint; response: Promise<ServerResponse> } {
    const id = this.nextId;
    this.nextId += 1n;
    const response = new Promise<ServerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ChatimCommandError("timeout"));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    return { id, response };
  }

  settle(response: ServerResponse): void {
    const entry = this.pending.get(response.id);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(response.id);
    if (response.code === 0) {
      entry.resolve(response);
    } else {
      entry.reject(
        new ChatimCommandError("server_error", response.code, response.message),
      );
    }
  }

  failAll(reason: CommandFailureReason): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new ChatimCommandError(reason));
    }
    this.pending.clear();
  }
}
