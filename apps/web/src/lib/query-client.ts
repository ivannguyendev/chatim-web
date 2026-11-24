import { QueryClient } from "@tanstack/react-query";

export const queryKeys = {
  profile: (userId: string) => ["profile", userId] as const,
  user: (userId: string, targetUserId: string) =>
    ["user", userId, targetUserId] as const,
  rooms: (userId: string) => ["rooms", userId] as const,
  messages: (userId: string, roomId: string) =>
    ["messages", userId, roomId] as const,
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
    },
  });
}
