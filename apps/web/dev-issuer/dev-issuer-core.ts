import {
  type KeyObject,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const DEV_ISSUER = "chatim-web-dev";
export const DEV_TENANT = "dev";
export const DEV_TENANT_NAME = "chatim-web dev";
export const DEV_AUDIENCE = "chatim";
export const DEV_TOKEN_LIFETIME_SEC = 300;
export const DEV_NAME_MAX_LENGTH = 100;
const PRIVATE_KEY_FILE = "private.pem";

export interface DevIssuerPublicJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
  kid: string;
  alg: "ES256";
  use: "sig";
}

export interface DevIssuerKey {
  privateKey: KeyObject;
  kid: string;
  publicJwk: DevIssuerPublicJwk;
}

export function devIssuerDir(repoRoot: string): string {
  return join(repoRoot, ".local", "dev-issuer");
}

export function ensureDevIssuerKey(dir: string): DevIssuerKey {
  const file = join(dir, PRIVATE_KEY_FILE);
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), {
      mode: 0o600,
    });
  }
  return loadDevIssuerKey(dir);
}

export function loadDevIssuerKey(dir: string): DevIssuerKey {
  const file = join(dir, PRIVATE_KEY_FILE);
  if (!existsSync(file)) {
    throw new Error(
      `Dev issuer key missing in ${dir}: run \`pnpm dev:issuer\``,
    );
  }
  const privateKey = createPrivateKey(readFileSync(file, "utf8"));
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y) {
    throw new Error(
      `Dev issuer key in ${dir} is not a P-256 key: delete it and run \`pnpm dev:issuer\``,
    );
  }
  const kid = `web-${createHash("sha256")
    .update(`${jwk.x}.${jwk.y}`)
    .digest("hex")
    .slice(0, 12)}`;
  return {
    privateKey,
    kid,
    publicJwk: {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
      kid,
      alg: "ES256",
      use: "sig",
    },
  };
}

export function isValidDevSubject(value: string): boolean {
  return /^[\x21-\x7e]{1,255}$/.test(value);
}

export function toDevDisplayName(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed.length <= DEV_NAME_MAX_LENGTH ? trimmed : "";
}

export function signDevSubjectToken(
  key: DevIssuerKey,
  subject: string,
  nowSec: number,
  name = "",
): string {
  const header = toBase64Url(
    JSON.stringify({ alg: "ES256", typ: "JWT", kid: key.kid }),
  );
  const payload = toBase64Url(
    JSON.stringify({
      iss: DEV_ISSUER,
      sub: subject,
      aud: DEV_AUDIENCE,
      iat: nowSec,
      exp: nowSec + DEV_TOKEN_LIFETIME_SEC,
      ...(name ? { name } : {}),
    }),
  );
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: key.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${header}.${payload}.${signature.toString("base64url")}`;
}

function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}
