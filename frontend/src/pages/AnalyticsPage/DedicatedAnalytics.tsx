import { AnalyticsLinkedCategories } from "./AnalyticsLinkedCategories";
import type { DemoExpense } from "./dedicatedAnalyticsDemoData";
import type { DedicatedAnalyticsData, DedicatedAnalyticsState } from "./dedicatedAnalyticsPresentation";
import { AllAnalysis, chartAxis } from "./AnalyticsV4Charts";
import type { Analysis, DonutReplay } from "./AnalyticsV4Charts";

export type CategoryView = "bars" | "donut";
const categoryColors = { FOOD:"--c1", UTILITIES:"--c3", TRANSPORTATION:"--c5", ACCOMMODATION:"--c2", DAILY_NECESSITIES:"--c4", ENTERTAINMENT:"--c6", OTHER:"--c7" };
const categoryNames = { FOOD:"食費", UTILITIES:"光熱費", TRANSPORTATION:"交通費", ACCOMMODATION:"宿泊費", DAILY_NECESSITIES:"日用品", ENTERTAINMENT:"娯楽費", OTHER:"その他" };
export function currentAnalysis(data: DedicatedAnalyticsData): Analysis {
  const c=data.endMonthComparison;
  return { total:data.totalExpense,count:data.expenseCount,labels:data.monthlyTrend.map(t => t.month),previousMonth:c.previousMonth ?? data.period.endMonth,
    comparison:{current:c.totalExpense,previous:c.previousTotalExpense,difference:c.difference,rate:c.percentageChange,noPreviousMonth:c.comparisonState === "NO_PREVIOUS_MONTH"},
    trend:data.monthlyTrend.map(t => ({month:t.month,amount:t.totalExpense,count:t.expenseCount})),
    categories:data.categoryBreakdown.map(c => ({id:c.category,name:c.category ? categoryNames[c.category] : "未分類",color:c.category ? categoryColors[c.category] : "--c8",amount:c.totalExpense})),
    projects:data.projectComparison.map(p => ({id:p.publicToken,name:p.name,amount:p.totalExpense})),
  };
}
export function monthlyChartAxis(maximum: number) { const max=chartAxis(maximum);return {maximum:max,ticks:[0,max/3,max*2/3,max]}; }
export function DedicatedAnalytics({ state, categoryView, onCategoryViewChange, onFinishLoading, onReselect, records, donutReplay }: { state: DedicatedAnalyticsState; categoryView: CategoryView; onCategoryViewChange: (v: CategoryView) => void; onFinishLoading?: () => void; onReselect?: () => void; records?: DemoExpense[]; donutReplay?: DonutReplay }) {
  if (state.status === "ready") {
    const { data, live } = state;
    const analysis = currentAnalysis(data);
    const linked = records ? { ...analysis, utilities: [], records }
      : live ? { ...analysis, categorySeries: data.monthlyTrend.length === 1 ? data.categoryBreakdown.map((bucket, index) => ({
        ...analysis.categories[index], values: [bucket.totalExpense], counts: [bucket.expenseCount],
      })) : null } : undefined;
    return <>{data.excludedProjects.length ? <p role="status">選択からイベントProjectを{data.excludedProjects.length}件除外しました。</p> : null}
    <AllAnalysis data={analysis} current
      categoryAnalysis={linked ? <AnalyticsLinkedCategories current data={linked} scope={JSON.stringify([data.includedProjectTokens,data.period])}
        donutReplay={live ? donutReplay ?? { revision: 0, waiting: false } : undefined}
        singleMonthComparison={live && data.monthlyTrend.length === 1 ? data.endMonthComparison : undefined}
        sub={`選択した${data.includedProjectTokens.length}Projectの月別合計`} /> : undefined}
      view={categoryView} onChange={v => onCategoryViewChange(v as CategoryView)} /></>;
  }
  return <div role={state.status === "loading" ? "status" : "alert"} aria-busy={state.status === "loading"}><section className="card state-card">
    {state.status === "loading" ? <><h2>支出データを読み込み中です</h2><p>取得完了まで集計結果は表示しません。</p><div className="skeletons" aria-hidden="true"><span /><span /><span /></div>{onFinishLoading ? <button className="outline-button" onClick={onFinishLoading}>読み込み完了を確認</button> : null}</> : state.status === "error" ? <><h2>支出データを取得できませんでした</h2><p>集計結果は表示していません。再試行してください。</p><button className="outline-button" onClick={state.onRetry}>再試行</button></> : <><h2>選択したProjectのアクセスを確認してください</h2><p>以前の選択と集計結果を非表示にしました。権限のないProjectを除外した再集計は行いません。</p><button className="outline-button" onClick={event => { event.stopPropagation(); onReselect?.(); }}>Projectを再選択</button></>}
  </section></div>;
}
