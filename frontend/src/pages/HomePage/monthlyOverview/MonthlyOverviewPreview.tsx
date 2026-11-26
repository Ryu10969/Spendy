import { useState } from "react";
import { currentMonth } from "../../../features/projects/monthSelection";
import { MonthlyOverview } from "./MonthlyOverview";
import { previewScenarios, previewState } from "./monthlyOverviewPreviewData";
import type { PreviewScenario } from "./monthlyOverviewPreviewData";
import styles from "./MonthlyOverviewPreview.module.css";

export default function MonthlyOverviewPreview({ showControls = false, smartphone = false }: { showControls?: boolean; smartphone?: boolean }) {
  const [latestMonth] = useState(currentMonth);
  const [month, setMonth] = useState(latestMonth);
  const [scenario, setScenario] = useState<PreviewScenario>("normal");
  const state = previewState(month, scenario);
  return <>
    <aside className={styles.controls} aria-label={showControls ? "開発用プレビュー設定" : "開発用サンプルデータ"}>
      <strong>開発用データ — 実際の支出ではありません</strong>
      {showControls ? <>
        <label>表示状態 <select value={scenario} onChange={(event) => setScenario(event.target.value as PreviewScenario)}>
          {Object.entries(previewScenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button type="button" onClick={() => { setMonth("0001-01"); setScenario("normal"); }}>比較不可（0001年1月）</button>
        <button type="button" onClick={() => setMonth(latestMonth)}>今月に戻る</button>
      </> : null}
      <span>月を切り替えても同じサンプル値を使用します。</span>
    </aside>
    <MonthlyOverview month={month} latestMonth={latestMonth} onMonthChange={setMonth} smartphone={smartphone}
      state={state.status === "error" ? { status: "error", onRetry: () => setScenario("normal") } : state} />
  </>;
}
