export interface GatewayClientOptions {
  gatewayUrl: string;
  getToken: () => Promise<string>;
}

export class GatewayClient {
  private gatewayUrl: string;
  private getToken: () => Promise<string>;

  constructor(options: GatewayClientOptions) {
    this.gatewayUrl = options.gatewayUrl.replace(/\/$/, "");
    this.getToken = options.getToken;
  }

  private async post(
    endpoint: string,
    body: Record<string, any> = {},
  ): Promise<any> {
    const token = await this.getToken();
    const response = await fetch(`${this.gatewayUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Gateway request failed with status ${response.status}`);
    }

    return response.json();
  }

  listMyRooms(): Promise<{ rooms: any[] }> {
    return this.post("/chatim.v1.ChatService/ListMyRooms");
  }

  getHistory(roomId: string, limit = 50): Promise<{ messages: any[] }> {
    return this.post("/chatim.v1.ChatService/GetHistory", { roomId, limit });
  }

  createRoom(name: string, isDirect = false): Promise<any> {
    return this.post("/chatim.v1.ChatService/CreateRoom", { name, isDirect });
  }

  openDirectRoom(targetUserId: string): Promise<any> {
    return this.post("/chatim.v1.ChatService/OpenDirectRoom", { targetUserId });
  }

  getClientConfig(): Promise<any> {
    return this.post("/chatim.v1.ChatService/GetClientConfig");
  }
}
