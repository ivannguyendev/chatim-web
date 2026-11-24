import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UI_COPY } from "../src/constants/ui-copy";
import { ConnectionBanner } from "../src/features/shell/components/ConnectionBanner";

describe("ConnectionBanner", () => {
  it("renders null when status is connected", () => {
    const { container } = render(<ConnectionBanner status="connected" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders connecting message when status is connecting", () => {
    render(<ConnectionBanner status="connecting" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(UI_COPY.CONNECTION.CONNECTING);
    expect(banner.className).toContain("bg-amber-100");
    expect(banner.className).toContain("text-amber-900");
  });

  it("renders disconnected banner when status is disconnected", () => {
    render(<ConnectionBanner status="disconnected" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(UI_COPY.CONNECTION.DISCONNECTED);
    expect(banner.className).toContain("bg-red-100");
    expect(banner.className).toContain("text-red-900");
  });

  it("renders reauth required banner when status is reauth_required", () => {
    render(<ConnectionBanner status="reauth_required" />);
    const banner = screen.getByRole("status");
    expect(banner.textContent).toBe(UI_COPY.CONNECTION.REAUTH_REQUIRED);
    expect(banner.className).toContain("bg-red-100");
    expect(banner.className).toContain("text-red-900");
  });
});
