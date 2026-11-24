export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  protocol: string;
  readyState: number = FakeWebSocket.CONNECTING;
  binaryType: string = "arraybuffer";

  sentData: Array<ArrayBuffer | ArrayBufferView | string> = [];

  onopen: ((ev: Event) => any) | null = null;
  onclose: ((ev: CloseEvent) => any) | null = null;
  onmessage: ((ev: MessageEvent) => any) | null = null;
  onerror: ((ev: Event) => any) | null = null;

  private listeners: Map<string, Array<(event: any) => void>> = new Map();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocol = Array.isArray(protocols)
      ? protocols[0] || ""
      : protocols || "";
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const existing = this.listeners.get(type) || [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    const existing = this.listeners.get(type) || [];
    this.listeners.set(
      type,
      existing.filter((l) => l !== listener),
    );
  }

  send(data: ArrayBuffer | ArrayBufferView | string) {
    if (this.readyState !== FakeWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this.sentData.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = FakeWebSocket.CLOSED;
    const event = { code, reason, wasClean: code === 1000 } as CloseEvent;
    if (this.onclose) this.onclose(event);
    this.emit("close", event);
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN;
    const event = new Event("open");
    if (this.onopen) this.onopen(event);
    this.emit("open", event);
  }

  simulateMessage(data: ArrayBuffer | string) {
    const event = { data } as MessageEvent;
    if (this.onmessage) this.onmessage(event);
    this.emit("message", event);
  }

  simulateClose(code = 1000, reason = "") {
    this.close(code, reason);
  }

  private emit(type: string, event: any) {
    const handlers = this.listeners.get(type) || [];
    for (const h of handlers) {
      h(event);
    }
  }
}
