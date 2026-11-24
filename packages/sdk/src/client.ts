import { create } from "@bufbuild/protobuf";
import { TokenManager } from "./auth/token";
import {
  type ClientConfig,
  DEFAULT_CLIENT_CONFIG,
  validateClientConfig,
} from "./config/validator";
import { DirectoryBatcher, type UserProfile } from "./directory/batcher";
import { SendMessageRequestSchema } from "./gen/chatim/v1/chat_pb";
import {
  ClientFrameSchema,
  ClientRequestSchema,
  CloseRoomFrameSchema,
  OpenRoomFrameSchema,
  type ServerFrame,
  TypingFrameSchema,
  WatchPresenceFrameSchema,
} from "./gen/chatim/v1/ws_pb";
import { GatewayClient } from "./transport/http";
import {
  type ConnectionStatus,
  WebSocketTransport,
  type WebSocketTransportOptions,
} from "./transport/ws";

export interface ChatimClientOptions extends Partial<ClientConfig> {
  getSubjectToken: () => Promise<string>;
  webSocketFactory?: WebSocketTransportOptions["webSocketFactory"];
}

export class ChatimClient {
  private config: ClientConfig;
  private tokenManager: TokenManager;
  private wsTransport: WebSocketTransport;
  private gateway: GatewayClient;
  private directory: DirectoryBatcher;

  private nextRequestId = 1;

  constructor(options: ChatimClientOptions) {
    this.config = validateClientConfig({
      ...DEFAULT_CLIENT_CONFIG,
      ...options,
    });

    this.tokenManager = new TokenManager({
      identityUrl: this.config.identityUrl,
      getSubjectToken: options.getSubjectToken,
    });

    this.wsTransport = new WebSocketTransport({
      wsUrl: this.config.wsUrl,
      getToken: () => this.tokenManager.getToken(),
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      webSocketFactory: options.webSocketFactory,
    });

    this.tokenManager.onRenew((newToken) => {
      if (this.wsTransport.status === "running") {
        this.wsTransport.sendAuth(newToken);
      }
    });

    this.gateway = new GatewayClient({
      gatewayUrl: this.config.gatewayUrl,
      getToken: () => this.tokenManager.getToken(),
    });

    this.directory = new DirectoryBatcher({
      identityUrl: this.config.identityUrl,
      getToken: () => this.tokenManager.getToken(),
    });
  }

  get status(): ConnectionStatus {
    return this.wsTransport.status;
  }

  connect() {
    this.wsTransport.connect();
  }

  close() {
    this.tokenManager.destroy();
    this.wsTransport.close();
  }

  getToken(): Promise<string> {
    return this.tokenManager.getToken();
  }

  onStatusChange(handler: (status: ConnectionStatus) => void) {
    return this.wsTransport.onStatusChange(handler);
  }

  onFrame(handler: (frame: ServerFrame) => void) {
    return this.wsTransport.onFrame(handler);
  }

  sendMessage(roomId: string, text: string, cid = crypto.randomUUID()) {
    const reqId = this.nextRequestId++;
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "request",
        value: create(ClientRequestSchema, {
          id: BigInt(reqId),
          request: {
            case: "sendMessage",
            value: create(SendMessageRequestSchema, {
              roomId,
              text,
              cid,
            }),
          },
        }),
      },
    });
    this.wsTransport.send(frame);
  }

  sendTyping(roomId: string, stopped = false) {
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "typing",
        value: create(TypingFrameSchema, {
          roomId,
          stopped,
        }),
      },
    });
    this.wsTransport.send(frame);
  }

  openRoom(roomId: string) {
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "openRoom",
        value: create(OpenRoomFrameSchema, { roomId }),
      },
    });
    this.wsTransport.send(frame);
  }

  closeRoom(roomId: string) {
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "closeRoom",
        value: create(CloseRoomFrameSchema, { roomId }),
      },
    });
    this.wsTransport.send(frame);
  }

  watchPresence(userIds: string[]) {
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "watchPresence",
        value: create(WatchPresenceFrameSchema, { userIds }),
      },
    });
    this.wsTransport.send(frame);
  }

  listMyRooms() {
    return this.gateway.listMyRooms();
  }

  getHistory(roomId: string, limit?: number) {
    return this.gateway.getHistory(roomId, limit);
  }

  getUser(userId: string): Promise<UserProfile | null> {
    return this.directory.getUser(userId);
  }

  getMyProfile(): Promise<UserProfile> {
    return this.directory.getMyProfile();
  }
}

export function createChatimClient(options: ChatimClientOptions): ChatimClient {
  return new ChatimClient(options);
}
