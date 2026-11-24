import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  AuthFrameSchema,
  ClientFrame,
  ClientFrameSchema,
  HeartbeatFrameSchema,
  ServerFrame,
  ServerFrameSchema,
} from "../gen/chatim/v1/ws_pb";
import { getReconnectDelayMs } from "./retry";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "waiting_auth"
  | "running";

export interface WebSocketTransportOptions {
  wsUrl: string;
  getToken: () => Promise<string>;
  heartbeatIntervalMs?: number;
  webSocketFactory?: (url: string, protocols: string) => WebSocket;
}

export type FrameHandler = (frame: ServerFrame) => void;
export type StatusHandler = (status: ConnectionStatus) => void;

export class WebSocketTransport {
  private wsUrl: string;
  private getToken: () => Promise<string>;
  private heartbeatIntervalMs: number;
  private wsFactory: (url: string, protocols: string) => WebSocket;

  private ws: WebSocket | null = null;
  private _status: ConnectionStatus = "disconnected";
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private reconnectAttempt = 0;
  private isClosedExplicitly = false;

  private frameHandlers: Set<FrameHandler> = new Set();
  private statusHandlers: Set<StatusHandler> = new Set();

  constructor(options: WebSocketTransportOptions) {
    this.wsUrl = options.wsUrl;
    this.getToken = options.getToken;
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

  private setStatus(status: ConnectionStatus) {
    if (this._status !== status) {
      this._status = status;
      for (const handler of this.statusHandlers) {
        handler(status);
      }
    }
  }

  connect() {
    this.isClosedExplicitly = false;
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
    this.setStatus("waiting_auth");
    try {
      const token = await this.getToken();
      this.sendAuth(token);
    } catch {
      this.closeSocket();
      this.scheduleReconnect(4001);
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

      if (serverFrame.frame.case === "ready") {
        this.setStatus("running");
        this.reconnectAttempt = 0;
        this.startHeartbeat();
      } else if (serverFrame.frame.case === "retry_later") {
        const retryAfterMs =
          Number(serverFrame.frame.value.retryAfterMs) || 1000;
        setTimeout(async () => {
          if (this.status === "waiting_auth") {
            const token = await this.getToken();
            this.sendAuth(token);
          }
        }, retryAfterMs);
      }

      for (const handler of this.frameHandlers) {
        handler(serverFrame);
      }
    } catch {}
  }

  private handleClose(event: CloseEvent) {
    this.stopHeartbeat();
    this.setStatus("disconnected");

    if (!this.isClosedExplicitly) {
      this.scheduleReconnect(event.code);
    }
  }

  private scheduleReconnect(code: number) {
    const delay = getReconnectDelayMs(code, this.reconnectAttempt);
    if (delay === null) {
      return;
    }

    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.closeSocket();
    this.setStatus("disconnected");
  }
}
