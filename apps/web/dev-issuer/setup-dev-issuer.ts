import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { devIssuerDir, ensureDevIssuerKey } from "./dev-issuer-core.ts";
import {
  type AdminResult,
  registerDevIssuer,
} from "./dev-issuer-registration.ts";

const IDENTITY_CONTAINER =
  process.env.CHATIM_IDENTITY_CONTAINER ?? "chatim-identity-1";
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function identityAdmin(args: string[]): AdminResult {
  try {
    const output = execFileSync(
      "docker",
      ["exec", IDENTITY_CONTAINER, "/app", ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { ok: true, output };
  } catch (error) {
    const failure = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    const output = `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
    return {
      ok: false,
      output: output || (failure.message ?? "unknown error"),
    };
  }
}

try {
  const key = ensureDevIssuerKey(devIssuerDir(repoRoot));
  for (const line of registerDevIssuer(identityAdmin, key)) {
    console.log(`dev:issuer: ${line}`);
  }
  console.log("dev:issuer: ready, run pnpm dev and pick a dev account");
} catch (error) {
  console.error(
    `dev:issuer: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
