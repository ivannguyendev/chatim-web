import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { DEV_SUBJECT_TOKEN_PATH } from "../src/features/auth/dev-subject-token.ts";
import {
  type DevIssuerKey,
  isValidDevSubject,
  loadDevIssuerKey,
  signDevSubjectToken,
  toDevDisplayName,
} from "./dev-issuer-core.ts";

const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function isLocalHostHeader(host: string | undefined): boolean {
  try {
    return LOCAL_HOSTNAMES.has(new URL(`http://${host ?? ""}`).hostname);
  } catch {
    return false;
  }
}

export function createDevSubjectTokenHandler(
  loadKey: () => DevIssuerKey,
  nowSec: () => number = () => Math.floor(Date.now() / 1000),
) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const reply = (status: number, body: string) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(body);
    };
    if (req.method !== "GET") {
      reply(405, "method not allowed");
      return;
    }
    if (
      !LOOPBACK_ADDRESSES.has(req.socket.remoteAddress ?? "") ||
      !isLocalHostHeader(req.headers.host)
    ) {
      reply(403, "dev subject tokens are served to localhost only");
      return;
    }
    const params = new URL(req.url ?? "/", "http://localhost").searchParams;
    const user = params.get("user") ?? "";
    if (!isValidDevSubject(user)) {
      reply(400, "user must be 1-255 printable ASCII characters");
      return;
    }
    try {
      reply(
        200,
        signDevSubjectToken(
          loadKey(),
          user,
          nowSec(),
          toDevDisplayName(params.get("name")),
        ),
      );
    } catch (error) {
      reply(
        503,
        error instanceof Error ? error.message : "dev issuer unavailable",
      );
    }
  };
}

export function devIssuerPlugin(keyDir: string): Plugin {
  return {
    name: "chatim-dev-issuer",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(
        DEV_SUBJECT_TOKEN_PATH,
        createDevSubjectTokenHandler(() => loadDevIssuerKey(keyDir)),
      );
    },
  };
}
