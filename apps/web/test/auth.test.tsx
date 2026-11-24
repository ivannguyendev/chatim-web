import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UI_COPY } from "../src/constants/ui-copy";
import {
  AUTH_STORAGE_KEY,
  type AuthContextValue,
  AuthProvider,
  type AuthSession,
  DEV_ACCOUNTS,
  LoginScreen,
  useAuth,
} from "../src/features/auth";

function decodeBase64UrlJson(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as Record<string, unknown>;
}

function AuthHarness({
  onReady,
}: {
  onReady?: (auth: AuthContextValue) => void;
}) {
  const auth = useAuth();
  onReady?.(auth);

  if (!auth.session) {
    return <LoginScreen />;
  }

  return (
    <div>
      <span data-testid="active-user-id">{auth.session.userId}</span>
      <span data-testid="active-display-name">{auth.session.displayName}</span>
      <button type="button" onClick={auth.logout}>
        {UI_COPY.AUTH.LOGOUT}
      </button>
    </div>
  );
}

describe("features/auth", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  it("logs in via Dev Account Switcher, persists only user identity, generates valid dev JWT, and clears session on logout", () => {
    const onSessionCleared = vi.fn();
    let tokenFromOnLoginSuccess = "";
    let latestAuth: AuthContextValue | null = null;

    const onLoginSuccess = vi.fn((_session: AuthSession) => {
      if (latestAuth) {
        tokenFromOnLoginSuccess = latestAuth.getSubjectToken();
      }
    });

    render(
      <AuthProvider
        isProduction={false}
        onSessionCleared={onSessionCleared}
        onLoginSuccess={onLoginSuccess}
      >
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );

    expect(
      screen.getByRole("heading", { name: UI_COPY.AUTH.HEADING }),
    ).toBeDefined();
    expect(screen.getByText(UI_COPY.DEV_SWITCHER.LABEL)).toBeDefined();
    for (const account of DEV_ACCOUNTS) {
      expect(
        screen.getByRole("button", { name: account.displayName }),
      ).toBeDefined();
    }

    fireEvent.click(screen.getByRole("button", { name: "Lan Nguyễn" }));

    expect(screen.getByTestId("active-user-id").textContent).toBe("lan");
    expect(screen.getByTestId("active-display-name").textContent).toBe(
      "Lan Nguyễn",
    );
    expect(onLoginSuccess).toHaveBeenCalledWith({
      userId: "lan",
      displayName: "Lan Nguyễn",
    });

    const rawStored = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    expect(rawStored).not.toBeNull();
    const parsedStored = JSON.parse(rawStored!) as Record<string, unknown>;
    expect(parsedStored).toEqual({
      userId: "lan",
      displayName: "Lan Nguyễn",
    });
    expect(Object.keys(parsedStored).sort()).toEqual(["displayName", "userId"]);
    expect(window.localStorage.length).toBe(0);

    expect(tokenFromOnLoginSuccess.endsWith(".dev")).toBe(true);
    const token = latestAuth!.getSubjectToken();
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[2]).toBe("dev");

    const header = decodeBase64UrlJson(parts[0]!);
    const payload = decodeBase64UrlJson(parts[1]!);
    expect(header).toEqual({ alg: "none", typ: "JWT" });
    expect(payload.sub).toBe("lan");
    expect(payload.aud).toBe("chatim");
    expect(typeof payload.iat).toBe("number");
    expect(payload.exp).toBe((payload.iat as number) + 600);

    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.LOGOUT }));

    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(onSessionCleared).toHaveBeenCalledTimes(1);
    expect(() => latestAuth!.getSubjectToken()).toThrow(
      "No active subject token",
    );
    expect(
      screen.getByRole("heading", { name: UI_COPY.AUTH.HEADING }),
    ).toBeDefined();
  });

  it("purges previous session cache via onSessionCleared and resets custom token when switching accounts directly", () => {
    const onSessionCleared = vi.fn();
    let latestAuth: AuthContextValue | null = null;

    render(
      <AuthProvider isProduction={false} onSessionCleared={onSessionCleared}>
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );

    act(() => {
      latestAuth!.loginWithInput("lan", "lan.custom.jwt");
    });
    expect(latestAuth!.getSubjectToken()).toBe("lan.custom.jwt");
    expect(onSessionCleared).not.toHaveBeenCalled();

    act(() => {
      latestAuth!.loginAsDev({ userId: "alice", displayName: "Alice Trần" });
    });

    expect(onSessionCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-user-id").textContent).toBe("alice");
    expect(screen.getByTestId("active-display-name").textContent).toBe(
      "Alice Trần",
    );

    const aliceToken = latestAuth!.getSubjectToken();
    expect(aliceToken).not.toBe("lan.custom.jwt");
    const alicePayload = decodeBase64UrlJson(aliceToken.split(".")[1]!);
    expect(alicePayload.sub).toBe("alice");
  });

  it("validates blank manual userId and keeps custom subjectToken strictly in memory", () => {
    let latestAuth: AuthContextValue | null = null;

    render(
      <AuthProvider isProduction={false}>
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );

    const userInput = screen.getByLabelText(UI_COPY.AUTH.USER_ID_LABEL);
    const tokenInput = screen.getByLabelText(UI_COPY.AUTH.TOKEN_LABEL);
    expect(userInput.getAttribute("id")).toBe("login-user-id");
    expect(userInput.getAttribute("autocomplete")).toBe("username");
    expect(tokenInput.getAttribute("id")).toBe("login-subject-token");
    expect(tokenInput.getAttribute("type")).toBe("password");
    expect(tokenInput.getAttribute("autocomplete")).toBe("off");

    fireEvent.change(userInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.SUBMIT }));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(UI_COPY.AUTH.INVALID_USER);
    expect(userInput.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(userInput, { target: { value: "  nguyễn_minh  " } });
    fireEvent.change(tokenInput, {
      target: { value: "  eyJhbGciOiJIUzI1NiJ9.custom.sig  " },
    });
    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.SUBMIT }));

    expect(screen.getByTestId("active-user-id").textContent).toBe(
      "nguyễn_minh",
    );
    expect(latestAuth!.getSubjectToken()).toBe(
      "eyJhbGciOiJIUzI1NiJ9.custom.sig",
    );

    const rawStored = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    expect(rawStored).not.toBeNull();
    expect(rawStored).not.toContain("custom.sig");
    expect(JSON.parse(rawStored!)).toEqual({
      userId: "nguyễn_minh",
      displayName: "nguyễn_minh",
    });
  });

  it("enforces production mode by ignoring dev sessionStorage, hiding dev switcher, and requiring subjectToken in memory", () => {
    window.sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ userId: "lan", displayName: "Lan Nguyễn" }),
    );

    let latestAuth: AuthContextValue | null = null;

    render(
      <AuthProvider isProduction={true}>
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );

    expect(latestAuth!.session).toBeNull();
    expect(screen.queryByText(UI_COPY.DEV_SWITCHER.LABEL)).toBeNull();
    expect(screen.queryByRole("button", { name: "Lan Nguyễn" })).toBeNull();

    act(() => {
      latestAuth!.loginAsDev({ userId: "lan", displayName: "Lan Nguyễn" });
    });
    expect(latestAuth!.session).toBeNull();

    const userInput = screen.getByLabelText(UI_COPY.AUTH.USER_ID_LABEL);
    const tokenInput = screen.getByLabelText(UI_COPY.AUTH.TOKEN_LABEL);

    fireEvent.change(userInput, { target: { value: "lan" } });
    fireEvent.change(tokenInput, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.SUBMIT }));

    expect(screen.getByRole("alert").textContent).toBe(
      UI_COPY.AUTH.TOKEN_REQUIRED_PROD,
    );
    expect(tokenInput.getAttribute("aria-invalid")).toBe("true");
    expect(latestAuth!.session).toBeNull();

    fireEvent.change(tokenInput, { target: { value: "prod.signed.jwt" } });
    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.SUBMIT }));

    expect(screen.getByTestId("active-user-id").textContent).toBe("lan");
    expect(latestAuth!.getSubjectToken()).toBe("prod.signed.jwt");
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("hydrates valid dev session while stripping unknown properties and tolerating corrupted or blocked sessionStorage", () => {
    window.sessionStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        userId: "bob",
        displayName: "Bob Lê",
        subjectToken: "leaked-token",
      }),
    );

    let latestAuth: AuthContextValue | null = null;

    const { unmount } = render(
      <AuthProvider isProduction={false}>
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );

    expect(latestAuth!.session).toEqual({
      userId: "bob",
      displayName: "Bob Lê",
    });
    expect(
      Object.prototype.hasOwnProperty.call(latestAuth!.session, "subjectToken"),
    ).toBe(false);
    expect(latestAuth!.getSubjectToken()).not.toBe("leaked-token");
    unmount();

    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(["bob"]));
    const { unmount: unmountArray } = render(
      <AuthProvider isProduction={false}>
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );
    expect(latestAuth!.session).toBeNull();
    unmountArray();

    const getItemSpy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });
    const setItemSpy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("Blocked", "SecurityError");
      });

    render(
      <AuthProvider isProduction={false}>
        <AuthHarness
          onReady={(auth) => {
            latestAuth = auth;
          }}
        />
      </AuthProvider>,
    );
    expect(latestAuth!.session).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Alice Trần" }));
    expect(screen.getByTestId("active-user-id").textContent).toBe("alice");

    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });
});
