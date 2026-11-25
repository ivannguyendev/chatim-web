export interface TokenManagerOptions {
  identityUrl: string;
  getSubjectToken: () => Promise<string>;
}

export type TokenRenewListener = (token: string) => void;

export class TokenManager {
  private identityUrl: string;
  private getSubjectToken: () => Promise<string>;
  private currentToken: string | null = null;
  private inFlightPromise: Promise<string> | null = null;
  private renewTimer: any = null;
  private renewListeners: Set<TokenRenewListener> = new Set();

  constructor(options: TokenManagerOptions) {
    this.identityUrl = options.identityUrl.replace(/\/$/, "");
    this.getSubjectToken = options.getSubjectToken;
  }

  onRenew(listener: TokenRenewListener) {
    this.renewListeners.add(listener);
    return () => this.renewListeners.delete(listener);
  }

  async getToken(): Promise<string> {
    if (this.currentToken) {
      return this.currentToken;
    }
    return this.refreshToken();
  }

  async getMyUserId(): Promise<string> {
    return readTokenSubject(await this.getToken());
  }

  async refreshToken(): Promise<string> {
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = (async () => {
      try {
        const subjectToken = await this.getSubjectToken();
        const body = new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
          subject_token: subjectToken,
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
        });

        const response = await fetch(`${this.identityUrl}/v1/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        if (!response.ok) {
          throw new Error(
            `Token exchange failed with status ${response.status}`,
          );
        }

        const data = await response.json();
        const token = data.access_token as string;
        const expiresIn = (data.expires_in as number) || 300;

        this.currentToken = token;
        this.scheduleRenew(expiresIn);

        for (const listener of this.renewListeners) {
          listener(token);
        }

        return token;
      } finally {
        this.inFlightPromise = null;
      }
    })();

    return this.inFlightPromise;
  }

  private scheduleRenew(expiresInSeconds: number) {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }

    const ratio = 0.7 + Math.random() * 0.15;
    const renewDelayMs = Math.floor(expiresInSeconds * ratio * 1000);

    this.renewTimer = setTimeout(() => {
      this.refreshToken().catch(() => {});
    }, renewDelayMs);
  }

  destroy() {
    if (this.renewTimer) {
      clearTimeout(this.renewTimer);
      this.renewTimer = null;
    }
    this.renewListeners.clear();
    this.currentToken = null;
  }
}

export function readTokenSubject(token: string): string {
  const encodedClaims = token.split(".")[1];
  if (!encodedClaims) {
    throw new Error("Chat token is not a JWT");
  }
  const base64 = encodedClaims.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
  const subject =
    typeof claims === "object" && claims !== null
      ? (claims as { sub?: unknown }).sub
      : undefined;
  if (typeof subject !== "string" || subject.length === 0) {
    throw new Error("Chat token has no sub claim");
  }
  return subject;
}
