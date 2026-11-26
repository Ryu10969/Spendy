import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";

export function createQueryClient(demo = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status < 500) {
            return false;
          }

          return failureCount < 1;
        },
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
        // A write started offline must not wait for a later authentication generation.
        ...(demo ? { networkMode: "always" as const } : {}),
      },
    },
  });

  client.setQueryDefaults(["expense-conflicts"], { gcTime: Infinity });
  client.setQueryDefaults(["expense-not-found"], { gcTime: Infinity });
  return client;
}

export const queryClient = createQueryClient();
