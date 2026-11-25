import {
  DEV_ISSUER,
  DEV_TENANT,
  DEV_TENANT_NAME,
  type DevIssuerKey,
} from "./dev-issuer-core.ts";

export interface AdminResult {
  ok: boolean;
  output: string;
}

export type IdentityAdmin = (args: string[]) => AdminResult;

export function registerDevIssuer(
  admin: IdentityAdmin,
  key: Pick<DevIssuerKey, "kid" | "publicJwk">,
): string[] {
  const log: string[] = [];
  const keys = admin(["issuer-keys", "-issuer", DEV_ISSUER]);
  const activeKey = new RegExp(`^${key.kid}\\s+ES256\\s+active\\b`, "m");
  if (keys.ok && activeKey.test(keys.output)) {
    log.push(`key ${key.kid} already active for issuer ${DEV_ISSUER}`);
    return log;
  }

  if (!keys.ok) {
    const tenant = admin([
      "tenant-create",
      "-id",
      DEV_TENANT,
      "-name",
      DEV_TENANT_NAME,
    ]);
    log.push(
      tenant.ok
        ? `tenant ${DEV_TENANT} created`
        : `tenant-create skipped: ${tenant.output.trim()}`,
    );
    requireOk(
      admin(["issuer-add", "-issuer", DEV_ISSUER, "-tenant", DEV_TENANT]),
      "issuer-add",
    );
    log.push(`issuer ${DEV_ISSUER} added`);
  }

  requireOk(
    admin([
      "issuer-key-add",
      "-issuer",
      DEV_ISSUER,
      "-kid",
      key.kid,
      "-alg",
      "ES256",
      "-jwk",
      JSON.stringify(key.publicJwk),
    ]),
    "issuer-key-add",
  );
  log.push(`key ${key.kid} added`);
  return log;
}

function requireOk(result: AdminResult, step: string): void {
  if (!result.ok) {
    throw new Error(`${step} failed: ${result.output.trim()}`);
  }
}
