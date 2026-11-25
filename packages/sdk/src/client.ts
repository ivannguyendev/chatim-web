import { create } from "@bufbuild/protobuf";
import { timestampMs } from "@bufbuild/protobuf/wkt";
import { TokenManager } from "./auth/token";
import {
  type ClientConfig,
  DEFAULT_CLIENT_CONFIG,
  validateClientConfig,
} from "./config/validator";
import { DirectoryBatcher, type UserProfile } from "./directory/batcher";
import { SendMessageRequestSchema } from "./gen/chatim/v1/chat_pb";
import { MarkReadRequestSchema } from "./gen/chatim/v1/members_pb";
import {
  ClientFrameSchema,
  type ClientRequest,
  ClientRequestSchema,
  CloseRoomFrameSchema,
  OpenRoomFrameSchema,
  type ServerFrame,
  type ServerResponse,
  TypingFrameSchema,
  WatchPresenceFrameSchema,
} from "./gen/chatim/v1/ws_pb";
import { MarkReadThrottle } from "./reads/mark-read-throttle";
import {
  ChatimCommandError,
  CommandTracker,
} from "./transport/command-tracker";
import { GatewayClient } from "./transport/http";
import {
  type ConnectionStatus,
  WebSocketTransport,
  type WebSocketTransportOptions,
} from "./transport/ws";

export const MAX_PRESENCE_WATCH = 200;

export interface ChatimClientOptions extends Partial<ClientConfig> {
  getSubjectToken: () => Promise<string>;
  webSocketFactory?: WebSocketTransportOptions["webSocketFactory"];
}

export interface SentMessage {
  cid: string;
  seq: number;
  createdAtMs: number | null;
}

type RequestPayload = Exclude<ClientRequest["request"], { case: undefined }>;

export class ChatimClient {
  private readonly config: ClientConfig;
  private readonly tokenManager: TokenManager;
  private readonly wsTransport: WebSocketTransport;
  private readonly gateway: GatewayClient;
  private readonly directory: DirectoryBatcher;
  private readonly commands: CommandTracker;
  private readonly reads: MarkReadThrottle;
  private readonly openRooms = new Set<string>();
  private watchedUserIds: string[] = [];

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
      refreshToken: () => this.tokenManager.refreshToken(),
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
      webSocketFactory: options.webSocketFactory,
    });

    this.commands = new CommandTracker(this.config.commandTimeoutMs);
    this.reads = new MarkReadThrottle(
      this.config.markReadIntervalMs,
      (roomId, seq) =>
        this.request({
          case: "markRead",
          value: create(MarkReadRequestSchema, { roomId, seq: BigInt(seq) }),
        }),
    );

    this.tokenManager.onRenew((newToken) => {
      if (this.wsTransport.status === "running") {
        this.wsTransport.sendAuth(newToken);
      }
    });
    this.wsTransport.onFrame((frame) => {
      if (frame.frame.case === "response") {
        this.commands.settle(frame.frame.value);
      }
    });
    this.wsTransport.onStatusChange((status) => {
      if (status === "disconnected") {
        this.commands.failAll("connection_lost");
      }
    });
    this.wsTransport.onReady(() => {
      this.replayOpenRooms();
      if (this.watchedUserIds.length > 0) {
        this.sendWatchPresence();
      }
    });
    this.wsTransport.onResync(() => this.replayOpenRooms());

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
    this.reads.dispose();
    this.tokenManager.destroy();
    this.wsTransport.close();
    this.openRooms.clear();
    this.watchedUserIds = [];
  }

  getToken(): Promise<string> {
    return this.tokenManager.getToken();
  }

  getMyUserId(): Promise<string> {
    return this.tokenManager.getMyUserId();
  }

  onStatusChange(handler: (status: ConnectionStatus) => void) {
    return this.wsTransport.onStatusChange(handler);
  }

  onFrame(handler: (frame: ServerFrame) => void) {
    return this.wsTransport.onFrame(handler);
  }

  sendMessage(
    roomId: string,
    text: string,
    cid: string = crypto.randomUUID(),
  ): Promise<SentMessage> {
    return this.request({
      case: "sendMessage",
      value: create(SendMessageRequestSchema, { roomId, text, cid }),
    }).then((response) => toSentMessage(cid, response));
  }

  sendTyping(roomId: string, stopped = false) {
    if (this.wsTransport.status !== "running") {
      return;
    }
    this.wsTransport.send(
      create(ClientFrameSchema, {
        frame: {
          case: "typing",
          value: create(TypingFrameSchema, { roomId, stopped }),
        },
      }),
    );
  }

  openRoom(roomId: string) {
    this.openRooms.add(roomId);
    if (this.wsTransport.status === "running") {
      this.sendOpenRoom(roomId);
    }
  }

  closeRoom(roomId: string) {
    this.reads.flush(roomId);
    this.openRooms.delete(roomId);
    if (this.wsTransport.status !== "running") {
      return;
    }
    this.wsTransport.send(
      create(ClientFrameSchema, {
        frame: {
          case: "closeRoom",
          value: create(CloseRoomFrameSchema, { roomId }),
        },
      }),
    );
  }

  watchPresence(userIds: string[]) {
    this.watchedUserIds = Array.from(new Set(userIds)).slice(
      0,
      MAX_PRESENCE_WATCH,
    );
    if (this.wsTransport.status === "running") {
      this.sendWatchPresence();
    }
  }

  markRead(roomId: string, seq: number): void {
    this.reads.mark(roomId, seq);
  }

  async listMyRooms() {
    await this.reads.settled();
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

  private request(payload: RequestPayload): Promise<ServerResponse> {
    if (this.wsTransport.status !== "running") {
      return Promise.reject(new ChatimCommandError("not_connected"));
    }
    const { id, response } = this.commands.start();
    this.wsTransport.send(
      create(ClientFrameSchema, {
        frame: {
          case: "request",
          value: create(ClientRequestSchema, { id, request: payload }),
        },
      }),
    );
    return response;
  }

  private replayOpenRooms() {
    for (const roomId of this.openRooms) {
      this.sendOpenRoom(roomId);
    }
  }

  private sendOpenRoom(roomId: string) {
    this.wsTransport.send(
      create(ClientFrameSchema, {
        frame: {
          case: "openRoom",
          value: create(OpenRoomFrameSchema, { roomId }),
        },
      }),
    );
  }

  private sendWatchPresence() {
    this.wsTransport.send(
      create(ClientFrameSchema, {
        frame: {
          case: "watchPresence",
          value: create(WatchPresenceFrameSchema, {
            userIds: this.watchedUserIds,
          }),
        },
      }),
    );
  }
}

function toSentMessage(cid: string, response: ServerResponse): SentMessage {
  const result =
    response.result.case === "sendMessage" ? response.result.value : undefined;
  return {
    cid,
    seq: Number(result?.seq ?? 0n),
    createdAtMs: result?.createdAt ? timestampMs(result.createdAt) : null,
  };
}

export function createChatimClient(options: ChatimClientOptions): ChatimClient {
  return new ChatimClient(options);
}
