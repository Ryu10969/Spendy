import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../../api/client";
import { analyticsKeys } from "../../../features/analytics/analyticsQueries";
import { currentMonth } from "../../../features/projects/monthSelection";
import { MonthlyOverview } from "./MonthlyOverview";
import type { MonthlyComparison, MonthlyOverviewData, MonthlyOverviewState, MonthlyPeriod } from "./monthlyOverviewPresentation";

type LocalOverviewResponse = Omit<MonthlyOverviewData, "population"> & { projectCount: number };

function validPeriod(period: MonthlyPeriod) {
  return [period?.totalExpense, period?.continuousExpense, period?.eventExpense, period?.eventProjectCount]
    .every(value => Number.isSafeInteger(value) && value >= 0)
    && period.totalExpense === period.continuousExpense + period.eventExpense
    && [period.contribution?.continuousPercentage, period.contribution?.eventPercentage]
      .every(value => value === null || (typeof value === "string" && /^\d{1,3}\.\d{2}$/.test(value)));
}

function validComparison(comparison: MonthlyComparison) {
  switch (comparison?.comparisonState) {
    case "COMPARABLE":
      return Number.isSafeInteger(comparison.difference) && typeof comparison.percentageChange === "string"
        && /^-?\d+\.\d{2}$/.test(comparison.percentageChange);
    case "NO_PREVIOUS_MONTH":
      return comparison.difference === null && comparison.percentageChange === null;
    case "NO_PREVIOUS_DATA":
    case "BOTH_MONTHS_EMPTY":
      return Number.isSafeInteger(comparison.difference) && comparison.percentageChange === null;
    default:
      return false;
  }
}

export default function LocalMonthlyOverview({ smartphone = false }: { smartphone?: boolean }) {
  const [latestMonth] = useState(currentMonth);
  const [month, setMonth] = useState(latestMonth);
  const client = useQueryClient();
  const queryKey = [...analyticsKeys.localHome, month] as const;
  const query = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ month });
      const endpoint = globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? "/api/demo/home" : "/api/local/home";
      const response = await apiRequest<LocalOverviewResponse>(`${endpoint}/monthly-overview?${params}`, { signal });
      if (response?.month !== month) throw new Error("Unexpected month in Home overview.");
      if (globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ && (
        !Number.isSafeInteger(response.projectCount) || response.projectCount < 0
        || !validPeriod(response.selected) || (response.previous !== null && !validPeriod(response.previous))
        || ![response.comparison?.total, response.comparison?.continuous, response.comparison?.event].every(validComparison)
      )) {
        throw new Error("Invalid Home overview.");
      }
      const { projectCount, ...data } = response;
      return { ...data, population: { projectCount } };
    },
    staleTime: 0,
    retry: false,
    networkMode: "always",
    notifyOnChangeProps: "all",
  });

  let state: MonthlyOverviewState;
  if (query.fetchStatus !== "idle" || query.isPending) {
    state = { status: "loading" };
  } else if (query.isError) {
    state = { status: "error", onRetry: () => { void query.refetch(); } };
  } else if (client.getQueryState(queryKey)?.isInvalidated) {
    state = { status: "loading" };
  } else {
    state = { status: "ready", data: query.data };
  }

  return <MonthlyOverview month={month} latestMonth={latestMonth} onMonthChange={setMonth} state={state} smartphone={smartphone} local />;
}
