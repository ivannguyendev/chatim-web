import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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
        typingThrottleMs: 3000,
        typingExpireMs: 2500,
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
        maxPresenceWatch: 0,
      }),
    ).toThrow(/maxPresenceWatch/);

    expect(() =>
      validateChatTimers({
        ...CHAT_TIMERS,
        maxPresenceWatch: 250,
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

    expect(parseAppRoute("/chat/")).toEqual({
      kind: "chat",
      roomId: null,
    });

    expect(parseAppRoute("/chat/%E0%A4%A")).toEqual({
      kind: "chat",
      roomId: null,
    });
  });
});
