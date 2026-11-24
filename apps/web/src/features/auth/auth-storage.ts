export const AUTH_STORAGE_KEY = "chatim.dev.session";

export interface AuthSession {
  userId: string;
  displayName: string;
}

export interface DevAccount {
  userId: string;
  displayName: string;
}

export const DEV_ACCOUNTS: readonly DevAccount[] = [
  { userId: "lan", displayName: "Lan Nguyễn" },
  { userId: "alice", displayName: "Alice Trần" },
  { userId: "bob", displayName: "Bob Lê" },
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function readStoredSession(): AuthSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) {
      return null;
    }

    if (typeof parsed.userId !== "string") {
      return null;
    }

    const userId = parsed.userId.trim();
    if (!userId) {
      return null;
    }

    const displayName =
      typeof parsed.displayName === "string" &&
      parsed.displayName.trim().length > 0
        ? parsed.displayName.trim()
        : userId;

    return { userId, displayName };
  } catch {
    return null;
  }
}

export function writeStoredSession(session: AuthSession): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const payload: AuthSession = {
      userId: session.userId,
      displayName: session.displayName,
    };
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    return;
  }
}

export function clearStoredSession(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    return;
  }
}

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

export function buildDevSubjectToken(userId: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = encodeBase64Url(
    JSON.stringify({
      sub: userId,
      aud: "chatim",
      iat: nowSec,
      exp: nowSec + 600,
    }),
  );
  return `${header}.${payload}.dev`;
}
