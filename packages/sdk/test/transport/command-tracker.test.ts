import { create } from "@bufbuild/protobuf";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServerResponseSchema } from "../../src/gen/chatim/v1/ws_pb";
import {
  ChatimCommandError,
  CommandTracker,
} from "../../src/transport/command-tracker";

const response = (id: bigint, code = 0, message = "") =>
  create(ServerResponseSchema, { id, code, message });

describe("CommandTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("assigns increasing ids and resolves the matching command on code 0", async () => {
    const tracker = new CommandTracker(10000);
    const first = tracker.start();
    const second = tracker.start();
    expect([first.id, second.id]).toEqual([1n, 2n]);

    tracker.settle(response(2n));
    await expect(second.response).resolves.toMatchObject({ id: 2n, code: 0 });
    expect(tracker.inFlight).toBe(1);

    tracker.failAll("connection_lost");
    await expect(first.response).rejects.toMatchObject({
      reason: "connection_lost",
    });
    expect(tracker.inFlight).toBe(0);
  });

  it("rejects with server_error carrying the gRPC code and message", async () => {
    const tracker = new CommandTracker(10000);
    const { response: pending } = tracker.start();

    tracker.settle(response(1n, 8, "slow down"));

    await expect(pending).rejects.toMatchObject({
      reason: "server_error",
      code: 8,
      message: "server_error (code 8): slow down",
    });
  });

  it("rejects with timeout once the configured time passes", async () => {
    const tracker = new CommandTracker(10000);
    const { response: pending } = tracker.start();
    const assertion = expect(pending).rejects.toMatchObject({
      reason: "timeout",
    });

    vi.advanceTimersByTime(9999);
    expect(tracker.inFlight).toBe(1);
    vi.advanceTimersByTime(1);

    await assertion;
    expect(tracker.inFlight).toBe(0);
  });

  it("ignores responses for unknown ids", () => {
    const tracker = new CommandTracker(10000);
    const { response: pending } = tracker.start();
    pending.catch(() => undefined);

    tracker.settle(response(99n));

    expect(tracker.inFlight).toBe(1);
    tracker.failAll("connection_lost");
  });

  it("exposes a named error type", () => {
    const error = new ChatimCommandError("not_connected");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ChatimCommandError");
    expect(error.message).toBe("not_connected");
  });
});
