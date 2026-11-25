import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkReadThrottle } from "../../src/reads/mark-read-throttle";

const KHO_HCM = "3cSuFSuZYdY";
const GENERAL = "8Kp2mQzR4tA";

describe("MarkReadThrottle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the first mark at once, then the highest pending seq once per interval", () => {
    const send = vi.fn(async () => undefined);
    const throttle = new MarkReadThrottle(1000, send);

    throttle.mark(KHO_HCM, 144);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 144);

    vi.advanceTimersByTime(300);
    throttle.mark(KHO_HCM, 145);
    throttle.mark(KHO_HCM, 146);
    expect(send).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(700);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 146);

    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(2);

    throttle.mark(KHO_HCM, 150);
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 150);
    throttle.dispose();
  });

  it("keeps rooms independent", () => {
    const send = vi.fn(async () => undefined);
    const throttle = new MarkReadThrottle(1000, send);

    throttle.mark(KHO_HCM, 144);
    throttle.mark(GENERAL, 5);

    expect(send.mock.calls).toEqual([
      [KHO_HCM, 144],
      [GENERAL, 5],
    ]);
    throttle.dispose();
  });

  it("flush sends the pending seq at once and closes the window", () => {
    const send = vi.fn(async () => undefined);
    const throttle = new MarkReadThrottle(1000, send);

    throttle.mark(KHO_HCM, 144);
    throttle.mark(KHO_HCM, 146);
    throttle.flush(KHO_HCM);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 146);

    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenCalledTimes(2);

    throttle.mark(KHO_HCM, 147);
    expect(send).toHaveBeenCalledTimes(3);
    throttle.dispose();
  });

  it("flush without a pending seq sends nothing", () => {
    const send = vi.fn(async () => undefined);
    const throttle = new MarkReadThrottle(1000, send);

    throttle.mark(KHO_HCM, 144);
    throttle.flush(KHO_HCM);
    throttle.flush(GENERAL);

    expect(send).toHaveBeenCalledTimes(1);
    throttle.dispose();
  });

  it("settled waits for in-flight sends and ignores failed ones", async () => {
    let release: () => void = () => undefined;
    const send = vi
      .fn<(roomId: string, seq: number) => Promise<unknown>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      )
      .mockImplementationOnce(async () => {
        throw new Error("not_connected");
      });
    const throttle = new MarkReadThrottle(1000, send);
    throttle.mark(KHO_HCM, 144);
    throttle.mark(GENERAL, 5);

    let settled = false;
    const waiting = throttle.settled().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    release();
    await waiting;
    expect(settled).toBe(true);
    throttle.dispose();
  });

  it("keeps a room alive when send throws synchronously on the timer path", () => {
    const send = vi
      .fn<(roomId: string, seq: number) => Promise<unknown>>()
      .mockImplementation(async () => undefined)
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(() => {
        throw new Error("not_connected");
      });
    const throttle = new MarkReadThrottle(1000, send);

    throttle.mark(KHO_HCM, 144);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 144);
    throttle.mark(KHO_HCM, 146);

    vi.advanceTimersByTime(1000);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 146);

    vi.advanceTimersByTime(1000);
    throttle.mark(KHO_HCM, 150);

    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(KHO_HCM, 150);
    throttle.dispose();
  });

  it("dispose clears every timer", () => {
    const throttle = new MarkReadThrottle(1000, async () => undefined);
    throttle.mark(KHO_HCM, 144);
    throttle.mark(GENERAL, 5);

    throttle.dispose();

    expect(vi.getTimerCount()).toBe(0);
  });
});
