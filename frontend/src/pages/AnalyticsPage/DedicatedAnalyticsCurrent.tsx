import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AnalyticsOverviewResponse } from "../../api/analyticsApi";
import { ApiError, demoAnalyticsSelectionKey } from "../../api/client";
import { getProjects } from "../../api/projectApi";
import { analyticsKeys, useAnalyticsOverviewQuery } from "../../features/analytics/analyticsQueries";
import { currentMonth } from "../../features/projects/monthSelection";
import { projectKeys } from "../../features/projects/projectQueries";
import { AnalyticsFilters } from "./AnalyticsFilters";
import { AnalyticsHeading } from "./AnalyticsPage";
import { DedicatedAnalytics } from "./DedicatedAnalytics";
import { selectionMonths, type AnalyticsProject, type AnalyticsSelection, type DedicatedAnalyticsState } from "./dedicatedAnalyticsPresentation";
import "./analyticsResponsiveContent.css";

const selectionKey = globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__
  ? demoAnalyticsSelectionKey : "spendingmate.dev.analytics.selection";

function readSelection(): AnalyticsSelection | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(selectionKey) ?? "null");
    if (typeof value?.startMonth !== "string" || typeof value?.endMonth !== "string"
      || !Array.isArray(value.projectTokens)
      || !value.projectTokens.every((token: unknown) => typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token))) return null;
    return { projectTokens: value.projectTokens, startMonth: value.startMonth, endMonth: value.endMonth };
  } catch {
    return null;
  }
}

function saveSelection(selection: AnalyticsSelection | null) {
  try {
    if (selection) window.sessionStorage.setItem(selectionKey, JSON.stringify(selection));
    else window.sessionStorage.removeItem(selectionKey);
  } catch {
    // Storage can be disabled or full. Analysis still works with in-memory state.
  }
}

function matchesSelection(data: AnalyticsOverviewResponse, selection: AnalyticsSelection) {
  const selected = new Set(selection.projectTokens);
  const returned = [...data.includedProjectTokens, ...data.excludedProjects.map(project => project.publicToken)];
  return data.projectType === "CONTINUOUS" && data.period.startMonth === selection.startMonth
    && data.period.endMonth === selection.endMonth && returned.length === selected.size
    && new Set(returned).size === selected.size && returned.every(token => selected.has(token));
}

export default function DedicatedAnalyticsCurrent() {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(readSelection);
  const [needsReselection, setNeedsReselection] = useState(false);
  const [initialMonth] = useState(() => currentMonth());
  const [draft, setDraft] = useState<AnalyticsSelection>({ projectTokens: [], startMonth: initialMonth, endMonth: initialMonth });
  const [applied, setApplied] = useState<AnalyticsSelection | null>(null);
  const [revealRevision, setRevealRevision] = useState(0);
  const [error, setError] = useState<string>();
  const catalog = useQuery({
    queryKey: projectKeys.analyticsCatalog,
    queryFn: ({ signal }) => getProjects(signal),
    select: (projects): AnalyticsProject[] => projects.filter(project => project.type === "CONTINUOUS")
      .map(({ publicToken, name, type }) => ({ publicToken, name, projectType: type })),
    ...(globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? { staleTime: 0 } : {}),
    retry: false,
    refetchOnMount: saved ? "always" : true,
  });
  const projects = catalog.data ?? [];
  const selectedTokens = draft.projectTokens.filter(token => projects.some(project => project.publicToken === token));
  const selection = { ...draft, projectTokens: selectedTokens };
  const available = applied && applied.projectTokens.every(token => projects.some(project => project.publicToken === token));
  const analytics = useAnalyticsOverviewQuery(applied?.projectTokens ?? [], applied?.startMonth ?? "", applied?.endMonth ?? "",
    !catalog.isError && Boolean(available));
  const missingProject = analytics.error instanceof ApiError && analytics.error.code === "PROJECT_NOT_FOUND";
  const inaccessible = missingProject || (analytics.error instanceof ApiError && [401, 403].includes(analytics.error.status));
  const rejected = Boolean(applied && (missingProject || (catalog.isSuccess && !available)));

  useEffect(() => {
    if (!applied || !rejected) return;
    setApplied(null);
    setDraft(current => ({ ...current, projectTokens: [] }));
    setNeedsReselection(true);
    setError(undefined);
    saveSelection(null);
    queryClient.removeQueries({
      queryKey: analyticsKeys.overview(applied.projectTokens, applied.startMonth, applied.endMonth),
      exact: true,
    });
    if (missingProject) void catalog.refetch();
  }, [applied, rejected, missingProject, catalog.refetch, queryClient]);

  useEffect(() => {
    if (!saved || !catalog.isSuccess || !catalog.isFetchedAfterMount || catalog.isFetching) return;
    setSaved(null);
    const candidates = catalog.data;
    try {
      selectionMonths(saved, candidates);
    } catch {
      setNeedsReselection(saved.projectTokens.some(token => !candidates.some(project => project.publicToken === token)));
      saveSelection(null);
      return;
    }
    void queryClient.invalidateQueries({
      queryKey: analyticsKeys.overview(saved.projectTokens, saved.startMonth, saved.endMonth),
      exact: true,
      refetchType: "none",
    });
    setDraft(saved);
    setApplied(saved);
  }, [saved, catalog.data, catalog.isSuccess, catalog.isFetchedAfterMount, catalog.isFetching, queryClient]);

  function apply(selection: AnalyticsSelection, replay = false) {
    try {
      selectionMonths(selection, projects);
      setApplied(selection);
      saveSelection(selection);
      setNeedsReselection(false);
      if (replay) setRevealRevision(value => value + 1);
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "分析条件を確認してください。");
    }
  }

  function changeSelection(selection: AnalyticsSelection) {
    setDraft(selection);
    if (selection.projectTokens.length !== selectedTokens.length
      || selection.projectTokens.some(token => !selectedTokens.includes(token))) {
      if (selection.projectTokens.length === 0) {
        setApplied(null);
        saveSelection(null);
        setError(undefined);
        return;
      }
      if (applied || (selection.startMonth === initialMonth && selection.endMonth === initialMonth)) {
        apply({ ...(applied ?? selection), projectTokens: selection.projectTokens });
      }
    }
  }

  let state: DedicatedAnalyticsState | undefined;
  if (applied && available && !inaccessible) {
    if (analytics.data && matchesSelection(analytics.data, applied)) state = { status: "ready", data: analytics.data, live: true };
    else if (analytics.loading) state = { status: "loading" };
    else state = { status: "error", onRetry: () => { void analytics.refetch(); } };
  }

  return <div className="current-analytics-content" data-current-analytics={true}>
    <AnalyticsHeading demo={false} />
    {catalog.isPending || (catalog.isFetching && (catalog.isError || saved || needsReselection)) ? <section className="card state-card" role="status" aria-busy="true">
      <h2>Project一覧を読み込み中です</h2>
    </section> : catalog.isError ? <section className="card state-card" role="alert">
      <h2>Project一覧を取得できませんでした</h2>
      <button type="button" className="outline-button" onClick={() => { void catalog.refetch(); }}>再試行</button>
    </section> : projects.length === 0 ? <section className="card state-card" role="status">
      <h2>{needsReselection ? "保存したProjectは利用できません。選択できる継続Projectはありません" : "選択できる継続Projectはありません"}</h2>
    </section> : <>
      <AnalyticsFilters live selection={rejected ? { ...selection, projectTokens: [] } : selection} applied={rejected ? null : applied} projects={projects}
        error={error} onChange={changeSelection} onApply={() => apply(selection, true)} />
      {state ? <DedicatedAnalytics state={state} categoryView="donut" onCategoryViewChange={() => {}}
        donutReplay={{ revision: revealRevision, waiting: analytics.loading }} />
        : <section className="card state-card" role="status">
          <h2>{rejected || inaccessible || needsReselection
            ? "選択したProjectを利用できません。Projectを再選択してください" : "集計する継続Projectを選択してください"}</h2>
        </section>}
    </>}
  </div>;
}
