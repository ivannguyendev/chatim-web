import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type AuthSession,
  DEV_ACCOUNTS,
  type DevAccount,
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./auth-storage";
import { fetchDevSubjectToken } from "./dev-subject-token";

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid_user" | "token_required" };

export interface AuthContextValue {
  session: AuthSession | null;
  isProduction: boolean;
  loginAsDev: (account: DevAccount) => void;
  loginWithInput: (
    rawUserId: string,
    customSubjectToken?: string,
  ) => LoginResult;
  logout: () => void;
  getSubjectToken: () => Promise<string>;
}

export interface AuthProviderProps {
  children: ReactNode;
  onSessionCleared?: () => void;
  onLoginSuccess?: (session: AuthSession) => void;
  isProduction?: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  onSessionCleared,
  onLoginSuccess,
  isProduction = Boolean(import.meta.env.PROD),
}: AuthProviderProps) {
  const [session, setSession] = useState<AuthSession | null>(() =>
    isProduction ? null : readStoredSession(),
  );

  const sessionRef = useRef<AuthSession | null>(session);
  const customTokenRef = useRef<string | null>(null);
  const onSessionClearedRef = useRef(onSessionCleared);
  const onLoginSuccessRef = useRef(onLoginSuccess);

  onSessionClearedRef.current = onSessionCleared;
  onLoginSuccessRef.current = onLoginSuccess;

  useEffect(() => {
    if (isProduction) {
      clearStoredSession();
      if (!customTokenRef.current && sessionRef.current) {
        sessionRef.current = null;
        setSession(null);
      }
    }
  }, [isProduction]);

  const applySession = useCallback(
    (nextSession: AuthSession, nextCustomToken: string | null) => {
      const previousSession = sessionRef.current;
      if (previousSession && previousSession.userId !== nextSession.userId) {
        onSessionClearedRef.current?.();
      }

      customTokenRef.current = nextCustomToken;
      sessionRef.current = nextSession;
      setSession(nextSession);

      if (isProduction) {
        clearStoredSession();
      } else {
        writeStoredSession(nextSession);
      }

      onLoginSuccessRef.current?.(nextSession);
    },
    [isProduction],
  );

  const loginAsDev = useCallback(
    (account: DevAccount) => {
      if (isProduction) {
        return;
      }
      const userId = account.userId.trim();
      if (!userId) {
        return;
      }
      const displayName = account.displayName.trim() || userId;
      applySession({ userId, displayName }, null);
    },
    [applySession, isProduction],
  );

  const loginWithInput = useCallback(
    (rawUserId: string, customSubjectToken?: string): LoginResult => {
      const userId = rawUserId.trim();
      if (!userId) {
        return { ok: false, reason: "invalid_user" };
      }

      const trimmedToken = customSubjectToken?.trim() ?? "";
      if (isProduction && !trimmedToken) {
        return { ok: false, reason: "token_required" };
      }

      const matchedDevAccount = DEV_ACCOUNTS.find(
        (account) => account.userId === userId,
      );
      const displayName = matchedDevAccount
        ? matchedDevAccount.displayName
        : userId;

      applySession(
        { userId, displayName },
        trimmedToken.length > 0 ? trimmedToken : null,
      );
      return { ok: true };
    },
    [applySession, isProduction],
  );

  const logout = useCallback(() => {
    customTokenRef.current = null;
    sessionRef.current = null;
    setSession(null);
    clearStoredSession();
    onSessionClearedRef.current?.();
  }, []);

  const getSubjectToken = useCallback(async (): Promise<string> => {
    if (customTokenRef.current) {
      return customTokenRef.current;
    }
    if (import.meta.env.DEV && !isProduction && sessionRef.current) {
      return fetchDevSubjectToken(
        sessionRef.current.userId,
        sessionRef.current.displayName,
      );
    }
    throw new Error("No active subject token");
  }, [isProduction]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isProduction,
      loginAsDev,
      loginWithInput,
      logout,
      getSubjectToken,
    }),
    [
      session,
      isProduction,
      loginAsDev,
      loginWithInput,
      logout,
      getSubjectToken,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
