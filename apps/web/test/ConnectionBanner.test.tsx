import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UI_COPY } from "../src/constants/ui-copy";
import { ConnectionBanner } from "../src/features/shell/components/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("renders connecting message when status is connecting", () => {
    render(<ConnectionBanner status="connecting" />);
    expect(screen.getByText(UI_COPY.CONNECTION.CONNECTING)).toBeDefined();
  });

  it("renders disconnected banner when disconnected", () => {
    render(<ConnectionBanner status="disconnected" />);
    expect(screen.getByText(UI_COPY.CONNECTION.DISCONNECTED)).toBeDefined();
  });
});
