import type { ChatimClientOptions } from "@chatim/sdk";
import { QueryClientProvider } from "@tanstack/react-query";
import { type FC, useState } from "react";
import { UI_COPY } from "../constants/ui-copy";
import { AuthProvider, LoginScreen, useAuth } from "../features/auth";
import { ConnectionBanner } from "../features/shell/components/ConnectionBanner";
import {
  type ChatimClientAdapter,
  ChatimProvider,
  useConnectionStatus,
} from "../lib/chatim-provider";
import { createAppQueryClient } from "../lib/query-client";

export interface AppProps {
  clientFactory?: (options: ChatimClientOptions) => ChatimClientAdapter;
}

const Workspace: FC = () => {
  const { session, logout } = useAuth();
  const status = useConnectionStatus();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <ConnectionBanner status={status} />
      <header className="flex items-center justify-between border-b bg-white px-6 py-4">
        <h1 className="text-xl font-bold tracking-tight text-gray-900">
          {UI_COPY.APP_TITLE}
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-700">
          <span>{session?.displayName}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            {UI_COPY.AUTH.LOGOUT}
          </button>
        </div>
      </header>
    </div>
  );
};

const AuthGate: FC<AppProps> = ({ clientFactory }) => {
  const { session, getSubjectToken } = useAuth();

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <ChatimProvider
      userId={session.userId}
      activeRoomId={null}
      getSubjectToken={getSubjectToken}
      clientFactory={clientFactory}
    >
      <Workspace />
    </ChatimProvider>
  );
};

export const App: FC<AppProps> = ({ clientFactory }) => {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider onSessionCleared={() => queryClient.clear()}>
        <AuthGate clientFactory={clientFactory} />
      </AuthProvider>
    </QueryClientProvider>
  );
};
