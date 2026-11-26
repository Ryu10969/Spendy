import { useQuery, useQueryClient, type QueryClient, type QueryFilters } from "@tanstack/react-query";
import { getAnalyticsOverview, getProjectMonthlyAnalytics } from "../../api/analyticsApi";
import { analyticsPresentation } from "./analyticsPresentation";

export const analyticsKeys = {
  localHome: ["local-home-overview"] as const,
  project: (publicToken: string) => ["projects", publicToken, "analytics"] as const,
  month: (publicToken: string, month: string, trendMonths = 6) =>
    [...analyticsKeys.project(publicToken), month, trendMonths] as const,
  overview: (projectTokens: string[], startMonth: string, endMonth: string) =>
    ["analytics", "overview", "CONTINUOUS", [...projectTokens].sort(), startMonth, endMonth] as const,
};

export async function invalidateProjectAnalytics(queryClient: QueryClient, publicToken: string, { deleted = false } = {}) {
  const filters: QueryFilters = {
    predicate: ({ queryKey: [scope, key, type, tokens] }) =>
      scope === analyticsKeys.localHome[0]
      || (scope === "projects" && key === publicToken && type === "analytics")
      || (scope === "analytics" && key === "overview" && Array.isArray(tokens) && tokens.includes(publicToken)),
  };
  // Mark dependent project and overview results unavailable before cancelling an older read.
  void queryClient.invalidateQueries({ ...filters, refetchType: "none" });
  await queryClient.cancelQueries(filters, { revert: false });
  // After deletion only Home can still aggregate successfully without a new selection.
  await queryClient.invalidateQueries(deleted ? { queryKey: analyticsKeys.localHome } : filters);
}

export function useAnalyticsOverviewQuery(projectTokens: string[], startMonth: string, endMonth: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = analyticsKeys.overview(projectTokens, startMonth, endMonth);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getAnalyticsOverview(queryKey[3], startMonth, endMonth, signal),
    enabled,
    ...(globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? { staleTime: 0 } : {}),
    retry: false,
    notifyOnChangeProps: "all",
  });
  return {
    data: !query.isError && !queryClient.getQueryState(queryKey)?.isInvalidated
      && !(globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ && query.isFetching) ? query.data : undefined,
    loading: query.isPending || query.fetchStatus !== "idle",
    error: query.error,
    refetch: query.refetch,
  };
}

export function useProjectAnalyticsQuery(
  publicToken: string | undefined,
  month: string,
  enabled: boolean,
  trendMonths = 6,
) {
  const queryClient = useQueryClient();
  const queryKey = analyticsKeys.month(publicToken ?? "", month, trendMonths);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getProjectMonthlyAnalytics(publicToken!, month, trendMonths, signal),
    enabled: Boolean(publicToken) && enabled,
    retry: false,
    // Invalidation itself must hide figures, even before the replacement read starts.
    notifyOnChangeProps: "all",
  });
  return {
    ...analyticsPresentation(query, publicToken ?? "", month,
      queryClient.getQueryState(queryKey)?.isInvalidated ?? false),
    refetch: query.refetch,
  };
}
