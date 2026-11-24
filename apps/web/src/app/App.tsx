import { SDK_VERSION } from "@chatim/sdk";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";
import { UI_COPY } from "../constants/ui-copy";
import {
  ConnectionBanner,
  type ConnectionStatus,
} from "../features/shell/components/ConnectionBanner";

const queryClient = new QueryClient();

export const App: React.FC = () => {
  const [status] = useState<ConnectionStatus>("connecting");

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col bg-gray-50">
        <ConnectionBanner status={status} />
        <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            {UI_COPY.APP_TITLE}
          </h1>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
            SDK v{SDK_VERSION}
          </span>
        </header>
        <main className="flex-1 p-6 max-w-4xl mx-auto w-full">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Chào mừng bạn đến với chatim
            </h2>
            <p className="text-sm text-gray-600">
              Hệ thống đã sẵn sàng cho Phase 2 (Luồng Chat & Kết nối Realtime).
            </p>
          </div>
        </main>
      </div>
    </QueryClientProvider>
  );
};
