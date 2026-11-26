import { demoExpenses } from "./dedicatedAnalyticsDemoExpenses";
import { useEffect, useState, type ReactNode } from "react";
import "./analyticsFutureTypography.css";
import { AnalyticsFilters } from "./AnalyticsFilters";
import { AnalyticsHeading } from "./AnalyticsPage";
import { DedicatedAnalytics } from "./DedicatedAnalytics";
import { demoCoverage, demoProjects, demoResult, initialSelection } from "./dedicatedAnalyticsDemoData";
import { selectionMonths } from "./dedicatedAnalyticsPresentation";
import type { AnalyticsSelection, DedicatedAnalyticsState } from "./dedicatedAnalyticsPresentation";
import { Segmented } from "./AnalyticsV4Charts";
import { AnalyticsFuturePreview } from "./AnalyticsFuturePreview";
import type { FutureTab } from "./analyticsFuturePreviewData";
import "./analyticsResponsiveContent.css";

const scenarios = { normal:"通常",loading:"Loading",empty:"Empty",unavailable:"比較不可：前月データ未取得","previous-zero":"比較不可：前月0円",error:"Error",access:"Access Invalidated" };
type Scenario = keyof typeof scenarios;
export default function DedicatedAnalyticsDemo({ showControls = false, current }: { showControls?: boolean; current?: ReactNode } = {}) {
  const [query] = useState(() => showControls && typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams());
  const initialScenario: Scenario = Object.hasOwn(scenarios,query.get("state") ?? "") ? query.get("state") as Scenario : "normal";
  const [draft,setDraft]=useState<AnalyticsSelection>(() => initialScenario === "access" ? {...initialSelection,projectTokens:[]} : initialSelection);
  const [applied,setApplied]=useState<AnalyticsSelection | null>(() => initialScenario === "access" ? null : initialSelection);
  const [scenario,setScenario]=useState<Scenario>(initialScenario),[invalidated,setInvalidated]=useState<string[]>(() => initialScenario === "access" ? initialSelection.projectTokens : []);
  const [error,setError]=useState<string>();
  const [mode,setMode]=useState(query.get("view") === "future" ? "future" : "current"),[plan,setPlan]=useState(query.get("plan") === "pro" ? "pro" : "basic");
  const [tab,setTab]=useState<FutureTab>(["all","utilities","living","subscriptions"].includes(query.get("tab") ?? "") ? query.get("tab") as FutureTab : "all");
  const [reselect,setReselect]=useState(0),projects=demoProjects.filter(p => !invalidated.includes(p.publicToken));
  const [previewViews,setPreviewViews]=useState({year:query.get("yearView") === "items" ? "items" : "total",member:"p1"});
  useEffect(() => {
    if(!showControls)return;
    const url=new URL(window.location.href);
    if(mode === "future")url.searchParams.set("view",mode);else url.searchParams.delete("view");
    for(const [key,value] of Object.entries({plan,tab})) {if(mode === "future")url.searchParams.set(key,value);else url.searchParams.delete(key);}
    if(scenario !== "normal")url.searchParams.set("state",scenario);else url.searchParams.delete("state");
    window.history.replaceState(null,"",url);
  },[showControls,mode,plan,tab,scenario]);
  function validate(selection: AnalyticsSelection) {selectionMonths(selection,projects);if(selection.startMonth < demoCoverage.startMonth || selection.endMonth > demoCoverage.endMonth)throw new Error("デモ収録範囲の2024年10月〜2026年10月を選択してください");}
  function apply() {try{validate(draft);setApplied({...draft,projectTokens:[...draft.projectTokens]});setError(undefined);}catch(cause){setError(cause instanceof Error ? cause.message : "分析条件を確認してください。");}}
  function changeSelection(next: AnalyticsSelection) {
    setDraft(next);
    if(next.projectTokens !== draft.projectTokens) {
      try {const selection={...(applied ?? initialSelection),projectTokens:next.projectTokens};validate(selection);setApplied(selection);setError(undefined);if(!applied)setScenario("normal");} catch(cause) {setError(cause instanceof Error ? cause.message : "分析条件を確認してください。");}
    }
  }
  function changeScenario(value: Scenario) {
    setScenario(value);setError(undefined);
    if(value === "access") {setInvalidated([...new Set([...invalidated,...(applied?.projectTokens ?? []),...draft.projectTokens])]);setDraft({...draft,projectTokens:[]});setApplied(null);}
  }
  function finish() {setScenario("normal");document.querySelector<HTMLDetailsElement>(".state-preview summary")?.focus();}
  const liveCurrent = mode === "current" && current;
  let state: DedicatedAnalyticsState;
  if(liveCurrent)state={status:"loading"};
  else if(!applied)state={status:"accessInvalidated"};
  else if(scenario === "loading")state={status:"loading"};
  else if(scenario === "error")state={status:"error",onRetry:finish};
  else {
    const data=demoResult(applied,scenario === "previous-zero" ? "previousZero" : scenario === "empty" ? "empty" : "normal");
    if(scenario === "unavailable")data.endMonthComparison={...data.endMonthComparison,previousTotalExpense:null,difference:null,percentageChange:null,comparisonState:"UNAVAILABLE"};
    state={status:"ready",data};
  }
  return <>
    {showControls ? <section className="design-console" aria-label="モック検証コントロール"><div className="console-title"><span className="console-dot" />DESIGN PREVIEW <span>v4</span></div><div className="console-controls"><div className="console-group"><span>画面案</span><Segmented label="画面案" options={[["current","Current"],["future","Future / Pro"]]} value={mode} onChange={setMode} /></div>{mode === "future" ? <div className="console-group"><span>プラン案</span><Segmented label="プラン案" options={[["basic","Basic"],["pro","Pro"]]} value={plan} onChange={setPlan} /></div> : null}</div><div className="console-status">{mode === "current" ? liveCurrent ? "Current：ローカル開発の実データ" : "Current：承認済みAnalytics契約に沿ったデモ・本番未実装" : "Future / Pro：将来構想・未承認。Proは商用化候補で、機能区分・価格・提供時期は未確定。追加のデータ設計が必要です。"}</div></section> : null}
    {liveCurrent || <>
    <AnalyticsHeading current={mode === "current" || !showControls} future={mode === "future" && showControls} />
    <AnalyticsFilters selection={draft} applied={applied} projects={projects} error={error} onChange={changeSelection} onApply={apply} reselect={reselect} />
    {showControls ? <details className="state-preview"><summary>モックの表示状態を確認</summary><label>表示状態 <select value={scenario} onChange={e => changeScenario(e.target.value as Scenario)}>{Object.entries(scenarios).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><p>操作検証専用。実際の通信・認可状態ではありません。未取得は比較情報を未取得に、前月0円は前月の支出を0件にして再集計します。</p></details> : null}
    {state.status !== "ready" || mode === "current" || !showControls ? <DedicatedAnalytics records={state.status === "ready" ? demoExpenses.filter(record => scenario !== "empty" && state.data.includedProjectTokens.includes(record.projectToken) && record.paidOn.slice(0,7) >= state.data.period.startMonth && record.paidOn.slice(0,7) <= state.data.period.endMonth && (scenario !== "previous-zero" || record.paidOn.slice(0,7) !== state.data.endMonthComparison.previousMonth)) : undefined} state={state} categoryView="donut" onCategoryViewChange={() => {}} onFinishLoading={finish} onReselect={() => setReselect(reselect+1)} /> : <AnalyticsFuturePreview selection={applied!} scenario={scenario} tab={tab} onTab={setTab} pro={plan === "pro"} onPro={() => {setPlan("pro");document.querySelector<HTMLButtonElement>('[aria-label="プラン案"] button:last-child')?.focus();}} views={previewViews} onViews={setPreviewViews} />}
    </>}
  </>;
}
