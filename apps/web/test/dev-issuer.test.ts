import { createPublicKey, verify } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEV_AUDIENCE,
  DEV_ISSUER,
  type DevIssuerKey,
  ensureDevIssuerKey,
  isValidDevSubject,
  loadDevIssuerKey,
  signDevSubjectToken,
  toDevDisplayName,
} from "../dev-issuer/dev-issuer-core";
import {
  type AdminResult,
  registerDevIssuer,
} from "../dev-issuer/dev-issuer-registration";

const tempDirs: string[] = [];

function tempKeyDir(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "dev-issuer-")), "dev-issuer");
  tempDirs.push(dir);
  return dir;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

function verifyDevToken(token: string, key: DevIssuerKey) {
  const [header, payload, signature] = token.split(".") as [
    string,
    string,
    string,
  ];
  const validSignature = verify(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    {
      key: createPublicKey({ key: key.publicJwk, format: "jwk" }),
      dsaEncoding: "ieee-p1363",
    },
    Buffer.from(signature, "base64url"),
  );
  return {
    header: decodeSegment(header),
    claims: decodeSegment(payload),
    validSignature,
  };
}

describe("dev issuer key and token", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(join(dir, ".."), { recursive: true, force: true });
    }
  });

  it("creates a private ES256 key once with owner-only permissions and a stable kid", () => {
    const dir = tempKeyDir();

    const first = ensureDevIssuerKey(dir);
    const second = ensureDevIssuerKey(dir);

    expect(second.kid).toBe(first.kid);
    expect(first.kid).toMatch(/^web-[0-9a-f]{12}$/);
    expect(statSync(join(dir, "private.pem")).mode & 0o777).toBe(0o600);
    expect(first.publicJwk).toMatchObject({
      kty: "EC",
      crv: "P-256",
      kid: first.kid,
      alg: "ES256",
      use: "sig",
    });
    expect(first.publicJwk).not.toHaveProperty("d");
  });

  it("signs a subject token identity accepts: kid, issuer, audience, display name, lifetime within 10 minutes", () => {
    const key = ensureDevIssuerKey(tempKeyDir());

    const token = verifyDevToken(
      signDevSubjectToken(key, "lan", 1_000, "Lan Nguyễn"),
      key,
    );

    expect(token.validSignature).toBe(true);
    expect(token.header).toEqual({ alg: "ES256", typ: "JWT", kid: key.kid });
    expect(token.claims).toEqual({
      iss: DEV_ISSUER,
      sub: "lan",
      aud: DEV_AUDIENCE,
      iat: 1_000,
      exp: 1_300,
      name: "Lan Nguyễn",
    });
    expect(
      (token.claims.exp as number) - (token.claims.iat as number),
    ).toBeLessThanOrEqual(600);
    expect(
      verifyDevToken(signDevSubjectToken(key, "lan", 1_000), key).claims,
    ).not.toHaveProperty("name");
  });

  it("tells the developer to run pnpm dev:issuer when the key is missing", () => {
    expect(() => loadDevIssuerKey(tempKeyDir())).toThrow(
      /run `pnpm dev:issuer`/,
    );
  });

  it("accepts only identity-valid subjects", () => {
    expect(isValidDevSubject("lan")).toBe(true);
    expect(isValidDevSubject("auth0|abc")).toBe(true);
    expect(isValidDevSubject("")).toBe(false);
    expect(isValidDevSubject("a b")).toBe(false);
    expect(isValidDevSubject("nguyễn")).toBe(false);
    expect(isValidDevSubject("a".repeat(256))).toBe(false);
  });

  it("keeps a trimmed display name of at most 100 characters", () => {
    expect(toDevDisplayName("  Lan Nguyễn ")).toBe("Lan Nguyễn");
    expect(toDevDisplayName("x".repeat(101))).toBe("");
    expect(toDevDisplayName(null)).toBe("");
  });
});

describe("registerDevIssuer", () => {
  const key = {
    kid: "web-abc123def456",
    publicJwk: {
      kty: "EC",
      crv: "P-256",
      x: "x",
      y: "y",
      kid: "web-abc123def456",
      alg: "ES256" as const,
      use: "sig" as const,
    },
  };

  function fakeAdmin(results: Record<string, AdminResult>) {
    const calls: string[][] = [];
    const admin = (args: string[]): AdminResult => {
      calls.push(args);
      return results[args[0] ?? ""] ?? { ok: true, output: "" };
    };
    return { admin, calls };
  }

  it("does nothing when the key is already active", () => {
    const { admin, calls } = fakeAdmin({
      "issuer-keys": {
        ok: true,
        output: "web-abc123def456  ES256  active  2026-11-24T00:00:00Z\n",
      },
    });

    registerDevIssuer(admin, key);

    expect(calls.map((c) => c[0])).toEqual(["issuer-keys"]);
  });

  it("creates tenant, issuer and key on a fresh cluster", () => {
    const { admin, calls } = fakeAdmin({
      "issuer-keys": { ok: false, output: "issuer chatim-web-dev: not found" },
    });

    registerDevIssuer(admin, key);

    expect(calls.map((c) => c[0])).toEqual([
      "issuer-keys",
      "tenant-create",
      "issuer-add",
      "issuer-key-add",
    ]);
    expect(calls[3]).toEqual([
      "issuer-key-add",
      "-issuer",
      DEV_ISSUER,
      "-kid",
      key.kid,
      "-alg",
      "ES256",
      "-jwk",
      JSON.stringify(key.publicJwk),
    ]);
  });

  it("only adds the key when the issuer exists without it", () => {
    const { admin, calls } = fakeAdmin({
      "issuer-keys": {
        ok: true,
        output: "web-000000000000  ES256  active  2026-11-01T00:00:00Z\n",
      },
    });

    registerDevIssuer(admin, key);

    expect(calls.map((c) => c[0])).toEqual(["issuer-keys", "issuer-key-add"]);
  });

  it("continues when the tenant already exists and fails loudly when issuer-add fails", () => {
    const tenantExists = fakeAdmin({
      "issuer-keys": { ok: false, output: "not found" },
      "tenant-create": { ok: false, output: "tenant dev exists" },
    });
    registerDevIssuer(tenantExists.admin, key);
    expect(tenantExists.calls.map((c) => c[0])).toContain("issuer-key-add");

    const broken = fakeAdmin({
      "issuer-keys": { ok: false, output: "No such container" },
      "tenant-create": { ok: false, output: "No such container" },
      "issuer-add": { ok: false, output: "No such container" },
    });
    expect(() => registerDevIssuer(broken.admin, key)).toThrow(
      "issuer-add failed: No such container",
    );
  });
});
