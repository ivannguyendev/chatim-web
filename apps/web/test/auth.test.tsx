import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UI_COPY } from "../src/constants/ui-copy";
import {
  AUTH_STORAGE_KEY,
  type AuthContextValue,
  AuthProvider,
  DEV_ACCOUNTS,
  LoginScreen,
  useAuth,
} from "../src/features/auth";

const DEV_TOKEN = "signed.dev.jwt";

const devTokenUrl = (user: string, name: string) =>
  `/__dev/subject-token?${new URLSearchParams({ user, name })}`;

function stubDevTokenEndpoint(
  reply: { ok: boolean; status: number; body: string } = {
    ok: true,
    status: 200,
    body: DEV_TOKEN,
  },
) {
  const fetchMock = vi.fn(async () => ({
    ok: reply.ok,
    status: reply.status,
    text: async () => reply.body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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
    stubDevTokenEndpoint();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs in via Dev Account Switcher, persists only user identity, fetches a signed dev subject token, and clears session on logout", async () => {
    const fetchMock = stubDevTokenEndpoint();
    const onSessionCleared = vi.fn();
    let latestAuth: AuthContextValue | null = null;

    const onLoginSuccess = vi.fn();

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

    await expect(latestAuth!.getSubjectToken()).resolves.toBe(DEV_TOKEN);
    expect(fetchMock).toHaveBeenCalledWith(devTokenUrl("lan", "Lan Nguyễn"), {
      cache: "no-store",
    });

    fireEvent.click(screen.getByRole("button", { name: UI_COPY.AUTH.LOGOUT }));

    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
    expect(onSessionCleared).toHaveBeenCalledTimes(1);
    await expect(latestAuth!.getSubjectToken()).rejects.toThrow(
      "No active subject token",
    );
    expect(
      screen.getByRole("heading", { name: UI_COPY.AUTH.HEADING }),
    ).toBeDefined();
  });

  it("purges previous session cache via onSessionCleared and resets custom token when switching accounts directly", async () => {
    const fetchMock = stubDevTokenEndpoint();
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
    await expect(latestAuth!.getSubjectToken()).resolves.toBe("lan.custom.jwt");
    expect(onSessionCleared).not.toHaveBeenCalled();

    act(() => {
      latestAuth!.loginAsDev({ userId: "alice", displayName: "Alice Trần" });
    });

    expect(onSessionCleared).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("active-user-id").textContent).toBe("alice");
    expect(screen.getByTestId("active-display-name").textContent).toBe(
      "Alice Trần",
    );

    await expect(latestAuth!.getSubjectToken()).resolves.toBe(DEV_TOKEN);
    expect(fetchMock).toHaveBeenLastCalledWith(
      devTokenUrl("alice", "Alice Trần"),
      { cache: "no-store" },
    );
  });

  it("validates blank manual userId and keeps custom subjectToken strictly in memory", async () => {
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
    await expect(latestAuth!.getSubjectToken()).resolves.toBe(
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

  it("enforces production mode by ignoring dev sessionStorage, hiding dev switcher, and requiring subjectToken in memory", async () => {
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
    await expect(latestAuth!.getSubjectToken()).resolves.toBe(
      "prod.signed.jwt",
    );
    expect(window.sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it("hydrates valid dev session while stripping unknown properties and tolerating corrupted or blocked sessionStorage", async () => {
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
    await expect(latestAuth!.getSubjectToken()).resolves.toBe(DEV_TOKEN);
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

  it("surfaces the dev issuer setup hint when the dev token endpoint fails", async () => {
    stubDevTokenEndpoint({
      ok: false,
      status: 503,
      body: "Dev issuer key missing in /repo/.local/dev-issuer: run `pnpm dev:issuer`",
    });
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
    fireEvent.click(screen.getByRole("button", { name: "Lan Nguyễn" }));

    await expect(latestAuth!.getSubjectToken()).rejects.toThrow(
      /\(503\).*pnpm dev:issuer/,
    );
  });

  it("rejects a dev token fetched for a session that changed before the fetch resolved", async () => {
    let resolveFetch: (body: string) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = (body) =>
              resolve({ ok: true, status: 200, text: async () => body });
          }),
      ),
    );
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
    fireEvent.click(screen.getByRole("button", { name: "Lan Nguyễn" }));

    const pending = latestAuth!.getSubjectToken();
    act(() => {
      latestAuth!.loginAsDev({ userId: "alice", displayName: "Alice Trần" });
    });
    resolveFetch("lan.signed.jwt");

    await expect(pending).rejects.toThrow("Session changed during token fetch");
  });
});
