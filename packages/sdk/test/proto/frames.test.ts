import { describe, expect, it } from "vitest";
import { fromBinary, toBinary, create } from "@bufbuild/protobuf";
import {
  ClientFrameSchema,
  ServerFrameSchema,
} from "../../src/gen/chatim/v1/ws_pb";

describe("Protobuf WebSocket Frames Serialization", () => {
  it("should serialize and deserialize ClientFrame with heartbeat", () => {
    const frame = create(ClientFrameSchema, {
      frame: {
        case: "heartbeat",
        value: {},
      },
    });

    const bytes = toBinary(ClientFrameSchema, frame);
    expect(bytes.length).toBeGreaterThan(0);

    const decoded = fromBinary(ClientFrameSchema, bytes);
    expect(decoded.frame.case).toBe("heartbeat");
  });

  it("should serialize and deserialize ServerFrame with ready", () => {
    const frame = create(ServerFrameSchema, {
      frame: {
        case: "ready",
        value: {},
      },
    });

    const bytes = toBinary(ServerFrameSchema, frame);
    expect(bytes.length).toBeGreaterThan(0);

    const decoded = fromBinary(ServerFrameSchema, bytes);
    expect(decoded.frame.case).toBe("ready");
  });
});
