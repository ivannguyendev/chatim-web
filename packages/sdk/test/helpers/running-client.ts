import {
  type MessageInitShape,
  create,
  fromBinary,
  toBinary,
} from "@bufbuild/protobuf";
import { vi } from "vitest";
import {
  type ClientFrame,
  ClientFrameSchema,
  ServerFrameSchema,
} from "../../src/gen/chatim/v1/ws_pb";
import { type ChatimClientOptions, createChatimClient } from "../../src/index";
import { FakeWebSocket } from "./fake-socket";

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const LAN_CHAT_USER_ID = "409BKeLbOoM";
export const LAN_CHAT_TOKEN = `e30.${toBase64Url(
  JSON.stringify({ sub: LAN_CHAT_USER_ID }),
)}.sig`;

export async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

export function stubServerFetch(gatewayBody: unknown = { items: [] }) {
  const fetchMock = vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.endsWith("/v1/token")
        ? { access_token: LAN_CHAT_TOKEN, expires_in: 300 }
        : gatewayBody,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function createTestClient(overrides: Partial<ChatimClientOptions> = {}) {
  const sockets: FakeWebSocket[] = [];
  const client = createChatimClient({
    gatewayUrl: "http://localhost:8082",
    wsUrl: "ws://localhost:8081/ws",
    identityUrl: "http://localhost:8084",
    getSubjectToken: async () => "subject-jwt",
    webSocketFactory: (url, protocols) => {
      const socket = new FakeWebSocket(url, protocols);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    ...overrides,
  });

  const socket = (): FakeWebSocket => {
    const latest = sockets[sockets.length - 1];
    if (!latest) {
      throw new Error("No socket created yet");
    }
    return latest;
  };

  const sent = (): ClientFrame[] =>
    socket().sentData.map((data) =>
      fromBinary(ClientFrameSchema, data as Uint8Array),
    );

  const receive = (init: MessageInitShape<typeof ServerFrameSchema>): void => {
    socket().simulateMessage(
      toBinary(
        ServerFrameSchema,
        create(ServerFrameSchema, init),
      ) as unknown as ArrayBuffer,
    );
  };

  const readyOnLatest = async (): Promise<void> => {
    socket().simulateOpen();
    await flushMicrotasks();
    receive({ frame: { case: "ready", value: {} } });
  };

  const openAndReady = async (): Promise<void> => {
    client.connect();
    await readyOnLatest();
  };

  return {
    client,
    sockets,
    socket,
    sent,
    receive,
    readyOnLatest,
    openAndReady,
  };
}
