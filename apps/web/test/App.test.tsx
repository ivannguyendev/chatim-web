import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../src/app/App";
import { UI_COPY } from "../src/constants/ui-copy";
import { FakeChatimClient } from "./helpers/fake-chatim-client";

describe("App login to realtime connection", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("connects after a dev login, hides the banner on ready and returns to login on logout", () => {
    const fakeClient = new FakeChatimClient();
    render(<App clientFactory={() => fakeClient} />);

    fireEvent.click(screen.getByRole("button", { name: "Lan Nguyễn" }));
    expect(fakeClient.connect).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe(
      UI_COPY.CONNECTION.CONNECTING,
    );

    act(() => {
      fakeClient.emitReady();
    });
    expect(screen.queryByRole("status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.LOGOUT }));
    expect(
      screen.getByRole("heading", { name: UI_COPY.AUTH.HEADING }),
    ).toBeDefined();
    expect(fakeClient.close).toHaveBeenCalled();
  });
});
