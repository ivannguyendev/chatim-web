import { describe, expect, it } from "vitest";
import { SDK_VERSION } from "../src/index";

describe("SDK Entrypoint", () => {
  it("should export SDK_VERSION matching package version", () => {
    expect(SDK_VERSION).toBe("0.1.0");
  });
});
