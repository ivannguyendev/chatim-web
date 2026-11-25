import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  AuthFrameSchema,
  type ClientFrame,
  ClientFrameSchema,
  HeartbeatFrameSchema,
  LoadRoomsFrameSchema,
  type ServerFrame,
  ServerFrameSchema,
} from "../gen/chatim/v1/ws_pb";
import { getReconnectDelayMs } from "./retry";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "waiting_auth"
  | "running";

export const LOAD_ROOMS_JITTER_MS = 1000;
const DEFAULT_LOAD_ROOMS_RETRY_MS = 1000;
const DEFAULT_RETRY_LATER_MS = 1000;
const HANDSHAKE_FAILURE_CODE = 1011;
const TOKEN_REJECTED_CODE = 4001;

export interface WebSocketTransportOptions {
  wsUrl: string;
  getToken: () => Promise<string>;
  refreshToken?: () => Promise<string>;
  heartbeatIntervalMs?: number;
  webSocketFactory?: (url: string, protocols: string) => WebSocket;
}

export type FrameHandler = (frame: ServerFrame) => void;
export type StatusHandler = (status: ConnectionStatus) => void;
export type ReadyHandler = () => void;

export class WebSocketTransport {
  private wsUrl: string;
  private getToken: () => Promise<string>;
  private refreshToken: () => Promise<string>;
  private heartbeatIntervalMs: number;
  private wsFactory: (url: string, protocols: string) => WebSocket;

  private ws: WebSocket | null = null;
  private _status: ConnectionStatus = "disconnected";
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private loadRoomsTimer: ReturnType<typeof setTimeout> | null = null;
  private retryLaterTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private isClosedExplicitly = false;
  private opened = false;
  private needsFreshToken = false;

  private frameHandlers: Set<FrameHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();
  private readyHandlers: Set<ReadyHandler> = new Set();
  private resyncHandlers: Set<ReadyHandler> = new Set();

  constructor(options: WebSocketTransportOptions) {
    this.wsUrl = options.wsUrl;
    this.getToken = options.getToken;
    this.refreshToken = options.refreshToken || options.getToken;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 8000;
    this.wsFactory =
      options.webSocketFactory ||
      ((url, protocols) => new WebSocket(url, protocols));
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  onFrame(handler: FrameHandler) {
    this.frameHandlers.add(handler);
    return () => this.frameHandlers.delete(handler);
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onReady(handler: ReadyHandler) {
    this.readyHandlers.add(handler);
    return () => this.readyHandlers.delete(handler);
  }

  onResync(handler: ReadyHandler) {
    this.resyncHandlers.add(handler);
    return () => this.resyncHandlers.delete(handler);
  }

  private setStatus(status: ConnectionStatus) {
    if (this._status !== status) {
      this._status = status;
      this.dispatch(this.statusHandlers, status);
    }
  }

  connect() {
    const replacing = this.ws !== null;
    this.clearReconnectTimer();
    this.releaseSocket();
    this.isClosedExplicitly = false;
    this.opened = false;
    if (replacing) {
      this.setStatus("disconnected");
    }
    this.setStatus("connecting");

    try {
      this.ws = this.wsFactory(this.wsUrl, "chatim.v1");
      this.ws.binaryType = "arraybuffer";

      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event) => this.handleMessage(event);
      this.ws.onclose = (event) => this.handleClose(event);
      this.ws.onerror = () => {};
    } catch {
      this.scheduleReconnect(1006);
    }
  }

  private async handleOpen() {
    this.opened = true;
    this.setStatus("waiting_auth");
    this.startHeartbeat();
    await this.authenticate();
  }

  private async authenticate() {
    const socket = this.ws;
    const fresh = this.needsFreshToken;
    try {
      const token = await (fresh ? this.refreshToken() : this.getToken());
      if (fresh) {
        this.needsFreshToken = false;
      }
      if (this.isStale(socket)) {
        return;
      }
      this.sendAuth(token);
    } catch {
      if (this.isStale(socket)) {
        return;
      }
      this.failHandshake();
    }
  }

  private isStale(socket: WebSocket | null) {
    return this.ws !== socket || this.isClosedExplicitly;
  }

  private failHandshake() {
    this.releaseSocket();
    this.setStatus("disconnected");
    if (!this.isClosedExplicitly) {
      this.scheduleReconnect(HANDSHAKE_FAILURE_CODE);
    }
  }

  sendAuth(token: string) {
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "auth",
        value: create(AuthFrameSchema, { token }),
      },
    });
    this.send(frame);
  }

  send(frame: ClientFrame) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const bytes = toBinary(ClientFrameSchema, frame);
    this.ws.send(bytes);
  }

  private handleMessage(event: MessageEvent) {
    try {
      const bytes = new Uint8Array(event.data as ArrayBuffer);
      const serverFrame = fromBinary(ServerFrameSchema, bytes);
      const frame = serverFrame.frame;
      const becameReady =
        frame.case === "ready" ||
        (frame.case === "resync" && this._status === "waiting_auth");

      if (becameReady || frame.case === "resync") {
        this.clearLoadRoomsTimer();
      }
      if (becameReady) {
        this.setStatus("running");
        this.reconnectAttempt = 0;
      } else if (frame.case === "retryLater") {
        this.scheduleRetryAuth(
          Number(frame.value.retryAfterMs) || DEFAULT_RETRY_LATER_MS,
        );
      } else if (frame.case === "loadFailed") {
        this.scheduleLoadRooms(
          Number(frame.value.retryAfterMs) || DEFAULT_LOAD_ROOMS_RETRY_MS,
        );
      }

      if (becameReady) {
        this.dispatch(this.readyHandlers);
      } else if (frame.case === "resync") {
        this.dispatch(this.resyncHandlers);
      }
      this.dispatch(this.frameHandlers, serverFrame);
    } catch {}
  }

  private dispatch<A extends unknown[]>(
    handlers: Iterable<(...args: A) => void>,
    ...args: A
  ) {
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch {}
    }
  }

  private handleClose(event: CloseEvent) {
    this.ws = null;
    if (event.code === TOKEN_REJECTED_CODE) {
      this.needsFreshToken = true;
    }
    this.stopHeartbeat();
    this.clearLoadRoomsTimer();
    this.clearRetryLaterTimer();
    this.setStatus("disconnected");

    if (!this.isClosedExplicitly) {
      this.scheduleReconnect(this.opened ? event.code : HANDSHAKE_FAILURE_CODE);
    }
  }

  private scheduleReconnect(code: number) {
    this.clearReconnectTimer();
    const delay = getReconnectDelayMs(code, this.reconnectAttempt);
    if (delay === null) {
      return;
    }

    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private scheduleLoadRooms(retryAfterMs: number) {
    this.clearLoadRoomsTimer();
    const delay =
      retryAfterMs + Math.floor(Math.random() * LOAD_ROOMS_JITTER_MS);
    this.loadRoomsTimer = setTimeout(() => {
      this.loadRoomsTimer = null;
      this.send(
        create(ClientFrameSchema, {
          frame: {
            case: "loadRooms",
            value: create(LoadRoomsFrameSchema, {}),
          },
        }),
      );
    }, delay);
  }

  private clearLoadRoomsTimer() {
    if (this.loadRoomsTimer) {
      clearTimeout(this.loadRoomsTimer);
      this.loadRoomsTimer = null;
    }
  }

  private scheduleRetryAuth(retryAfterMs: number) {
    this.clearRetryLaterTimer();
    this.retryLaterTimer = setTimeout(async () => {
      this.retryLaterTimer = null;
      if (this._status !== "waiting_auth") {
        return;
      }
      await this.authenticate();
    }, retryAfterMs);
  }

  private clearRetryLaterTimer() {
    if (this.retryLaterTimer) {
      clearTimeout(this.retryLaterTimer);
      this.retryLaterTimer = null;
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      const frame = create(ClientFrameSchema, {
        frame: {
          case: "heartbeat",
          value: create(HeartbeatFrameSchema, {}),
        },
      });
      this.send(frame);
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private releaseSocket() {
    this.stopHeartbeat();
    this.clearLoadRoomsTimer();
    this.clearRetryLaterTimer();
    this.closeSocket();
  }

  private closeSocket() {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  }

  close() {
    this.isClosedExplicitly = true;
    this.clearReconnectTimer();
    this.releaseSocket();
    this.setStatus("disconnected");
  }
}
