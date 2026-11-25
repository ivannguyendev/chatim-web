type SendMarkRead = (roomId: string, seq: number) => Promise<unknown>;

interface RoomSlot {
  timer: ReturnType<typeof setTimeout>;
  pendingSeq: number | null;
}

export class MarkReadThrottle {
  private readonly intervalMs: number;
  private readonly sendMarkRead: SendMarkRead;
  private readonly slots = new Map<string, RoomSlot>();
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(intervalMs: number, sendMarkRead: SendMarkRead) {
    this.intervalMs = intervalMs;
    this.sendMarkRead = sendMarkRead;
  }

  mark(roomId: string, seq: number): void {
    const slot = this.slots.get(roomId);
    if (slot) {
      slot.pendingSeq = Math.max(slot.pendingSeq ?? seq, seq);
      return;
    }
    this.dispatch(roomId, seq);
    this.slots.set(roomId, {
      timer: this.startWindow(roomId),
      pendingSeq: null,
    });
  }

  flush(roomId: string): void {
    const slot = this.slots.get(roomId);
    if (!slot) {
      return;
    }
    clearTimeout(slot.timer);
    this.slots.delete(roomId);
    if (slot.pendingSeq !== null) {
      this.dispatch(roomId, slot.pendingSeq);
    }
  }

  async settled(): Promise<void> {
    await Promise.allSettled(Array.from(this.inFlight));
  }

  dispose(): void {
    for (const slot of this.slots.values()) {
      clearTimeout(slot.timer);
    }
    this.slots.clear();
  }

  private startWindow(roomId: string): ReturnType<typeof setTimeout> {
    return setTimeout(() => this.closeWindow(roomId), this.intervalMs);
  }

  private closeWindow(roomId: string): void {
    const slot = this.slots.get(roomId);
    if (!slot) {
      return;
    }
    if (slot.pendingSeq === null) {
      this.slots.delete(roomId);
      return;
    }
    const seq = slot.pendingSeq;
    slot.pendingSeq = null;
    this.dispatch(roomId, seq);
    slot.timer = this.startWindow(roomId);
  }

  private dispatch(roomId: string, seq: number): void {
    let sent: Promise<unknown>;
    try {
      sent = this.sendMarkRead(roomId, seq);
    } catch (error) {
      sent = Promise.reject(error);
    }
    const request = sent.catch(() => undefined);
    this.inFlight.add(request);
    void request.finally(() => this.inFlight.delete(request));
  }
}
