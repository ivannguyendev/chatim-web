import { useSyncExternalStore } from "react";

export type AppRoute =
  | { kind: "login" }
  | { kind: "chat"; roomId: string | null };

const ROUTE_EVENT = "chatim:navigate";

function getServerSnapshot(): string {
  return "/";
}

function getSnapshot(): string {
  if (typeof window === "undefined") {
    return "/";
  }
  return window.location.pathname;
}

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  window.addEventListener("popstate", callback);
  window.addEventListener(ROUTE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(ROUTE_EVENT, callback);
  };
}

export function navigate(
  to: string,
  options: { replace?: boolean } = {},
): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\")) {
    return;
  }
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === to) {
    return;
  }
  if (options.replace) {
    window.history.replaceState(null, "", to);
  } else {
    window.history.pushState(null, "", to);
  }
  window.dispatchEvent(new Event(ROUTE_EVENT));
}

export function usePathname(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function parseAppRoute(pathname: string): AppRoute {
  if (pathname === "/login" || pathname === "/login/") {
    return { kind: "login" };
  }
  if (pathname.startsWith("/chat/")) {
    const rawId = pathname.slice("/chat/".length).split("/")[0] ?? "";
    try {
      const decoded = decodeURIComponent(rawId).trim();
      return { kind: "chat", roomId: decoded.length > 0 ? decoded : null };
    } catch {
      return { kind: "chat", roomId: null };
    }
  }
  return { kind: "chat", roomId: null };
}
