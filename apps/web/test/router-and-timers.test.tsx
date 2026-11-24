import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { navigate, parseAppRoute, usePathname } from "../src/lib/router";
import { CHAT_TIMERS, validateChatTimers } from "../src/lib/timers";

function RouteProbe() {
  const pathname = usePathname();
  const route = parseAppRoute(pathname);
  return (
    <div>
      <span data-testid="path">{pathname}</span>
      <span data-testid="kind">{route.kind}</span>
      <span data-testid="room">
        {route.kind === "chat" ? (route.roomId ?? "none") : "none"}
      </span>
    </div>
  );
}

describe("validateChatTimers", () => {
  it("accepts default CHAT_TIMERS and rejects invalid timer relations", () => {
    expect(validateChatTimers(CHAT_TIMERS)).toEqual(CHAT_TIMERS);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingThrottleMs: 400,
      }),
    ).toThrow(/typingThrottleMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingThrottleMs: Number.NaN,
      }),
    ).toThrow(/typingThrottleMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingThrottleMs: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/typingThrottleMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingThrottleMs: 2_147_483_648,
      }),
    ).toThrow(/typingThrottleMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingThrottleMs: 3000,
        typingExpireMs: 2500,
      }),
    ).toThrow(/typingExpireMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingThrottleMs: 3000,
        typingExpireMs: 3000,
      }),
    ).toThrow(/typingExpireMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingExpireMs: Number.NaN,
      }),
    ).toThrow(/typingExpireMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingExpireMs: Number.POSITIVE_INFINITY,
      }),
    ).toThrow(/typingExpireMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        typingExpireMs: 2_147_483_648,
      }),
    ).toThrow(/typingExpireMs/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        historyPageLimit: 0,
      }),
    ).toThrow(/historyPageLimit/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        historyPageLimit: 101,
      }),
    ).toThrow(/historyPageLimit/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        historyPageLimit: 1.5,
      }),
    ).toThrow(/historyPageLimit/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        historyPageLimit: Number.NaN,
      }),
    ).toThrow(/historyPageLimit/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        maxPresenceWatch: 0,
      }),
    ).toThrow(/maxPresenceWatch/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        maxPresenceWatch: 250,
      }),
    ).toThrow(/maxPresenceWatch/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        maxPresenceWatch: 1.5,
      }),
    ).toThrow(/maxPresenceWatch/);
  });
});

describe("router", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("parses login, chat room and malformed routes and reacts to navigate()", () => {
    render(<RouteProbe />);
    expect(screen.getByTestId("kind").textContent).toBe("chat");
    expect(screen.getByTestId("room").textContent).toBe("none");

    act(() => {
      navigate("/login");
    });
    expect(screen.getByTestId("kind").textContent).toBe("login");

    expect(parseAppRoute("/login/")).toEqual({ kind: "login" });

    act(() => {
      navigate("/chat/r_kho_hcm");
    });
    expect(screen.getByTestId("kind").textContent).toBe("chat");
    expect(screen.getByTestId("room").textContent).toBe("r_kho_hcm");

    act(() => {
      navigate("/chat", { replace: true });
    });
    expect(screen.getByTestId("kind").textContent).toBe("chat");
    expect(screen.getByTestId("room").textContent).toBe("none");

    act(() => {
      navigate("/chat?filter=unread");
    });
    expect(window.location.search).toBe("?filter=unread");

    expect(parseAppRoute("/chat/")).toEqual({
      kind: "chat",
      roomId: null,
    });

    expect(parseAppRoute("/chat/%E0%A4%A")).toEqual({
      kind: "chat",
      roomId: null,
    });
  });

  it("reacts to popstate, rejects open-redirect paths and cleans up listeners on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<RouteProbe />);

    act(() => {
      window.history.pushState(null, "", "/chat/r_pop");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.getByTestId("path").textContent).toBe("/chat/r_pop");
    expect(screen.getByTestId("room").textContent).toBe("r_pop");

    act(() => {
      navigate("//evil.com");
      navigate("/\\evil.com");
      navigate("relative/path");
    });
    expect(window.location.pathname).toBe("/chat/r_pop");
    expect(screen.getByTestId("path").textContent).toBe("/chat/r_pop");

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith(
      "chatim:navigate",
      expect.any(Function),
    );
    removeSpy.mockRestore();
  });
});
