import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AnalyticsComparisonResponse } from "../../api/analyticsApi";
import { Card, CategoryCard, Chart, Rank, rankCategoryKey, rankFoot, type Analysis, type RankRow, type ChartSeries, type RankInteraction, type DonutReplay } from "./AnalyticsV4Charts";
import type { DemoExpense } from "./dedicatedAnalyticsDemoData";
import "./analyticsLinkedCategories.css";

type CategorySeries = RankRow & { values: number[]; counts: number[] };
export type LinkedCategoryData = Analysis & (
  { utilities: RankRow[]; records: (DemoExpense & { utility?: string })[] }
  | { categorySeries: CategorySeries[] | null }
);
type Dimension = "category" | "utility";

// Presentation-only grouping of already Project/paidOn-filtered source records.
// No synthetic monthly allocation and no change to the canonical aggregation.
export function linkedCategorySeries(data: LinkedCategoryData, dimension: Dimension = "category") {
  if ("categorySeries" in data) return data.categorySeries;
  const rows = dimension === "utility" ? data.utilities : data.categories;
  const months = new Map(data.labels.map((label,index) => [label,index]));
  const bins = new Map(rows.map(row => [rankCategoryKey(row.id), { amounts: data.labels.map(() => 0n), counts: data.labels.map(() => 0) }]));
  for (const record of data.records) {
    const index = months.get(record.paidOn.slice(0,7));
    const bin = bins.get(rankCategoryKey(dimension === "utility" ? record.utility ?? null : record.category));
    if (index === undefined || !bin) continue;
    bin.amounts[index] += BigInt(record.amount); bin.counts[index]++;
  }
  return rows.map(row => {
    const bin = bins.get(rankCategoryKey(row.id))!;
    return { ...row, values: bin.amounts.map(value => {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("Category monthly amount exceeds safe integer JPY");
      return Number(value);
    }), counts: bin.counts };
  });
}

export function AnalyticsLinkedCategories({ data: a, scope, dimension = "category", title = "月次支出推移", totalName = "支出合計", sub, current = false, singleMonthComparison, donutReplay }: { data: LinkedCategoryData; scope: string; dimension?: Dimension; title?: string; totalName?: string; sub: string; current?: boolean; singleMonthComparison?: AnalyticsComparisonResponse; donutReplay?: DonutReplay }) {
  const monthly = useMemo(() => linkedCategorySeries(a,dimension), [a,dimension]);
  const rows = monthly ?? a.categories;
  const dataKey = JSON.stringify([scope, dimension, a.labels,
    monthly?.map(row => [row.id, row.name, row.values, row.counts]) ?? a.categories]);
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [hover,setHover] = useState<{ key: string; id: string } | null>(null);
  const [reduced,setReduced] = useState(() => typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== false);
  const selectionId = useId();
  const selected = rows.find(row => rankCategoryKey(row.id) === selectedId);
  const selectedSeries = monthly?.find(row => rankCategoryKey(row.id) === selectedId);
  const hovered = hover?.key === dataKey && rows.some(row => rankCategoryKey(row.id) === hover.id) ? hover.id : null;
  const clear = () => { setSelectedId(null); setHover(null); };
  const container = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ id: string; button: HTMLButtonElement } | null>(null);
  const clearFromKeyboard = (button: HTMLButtonElement) => {
    if (button.ownerDocument.activeElement === button) pendingFocus.current = {id:selected?.id ?? "unclassified",button};
    clear();
  };
  useLayoutEffect(() => {
    const request = pendingFocus.current;
    pendingFocus.current = null;
    if (!request || !container.current) return;
    const active = request.button.ownerDocument.activeElement;
    // Restore after the button is removed, but never override another focus move.
    if (active !== request.button && active !== request.button.ownerDocument.body) return;
    const controls = Array.from(container.current.querySelectorAll<HTMLElement>('.f-rank-row[role="button"][tabindex="0"]'));
    const target = controls.find(control => control.getAttribute("data-key") === request.id)
      ?? controls[0] ?? container.current.querySelector<HTMLElement>("summary");
    target?.focus({preventScroll:true});
  });
  useLayoutEffect(() => {
    setSelectedId(id => rows.some(row => rankCategoryKey(row.id) === id) ? id : null);
    setHover(value => value?.key === dataKey ? value : null);
  }, [dataKey]);
  useLayoutEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference?.matches !== false);
    preference?.addEventListener("change",sync); sync();
    return () => preference?.removeEventListener("change",sync);
  }, []);
  const interaction: RankInteraction = {
    highlighted: hovered ?? (selected ? selectedId : null), selected: selected ? selectedId : null, reduced, selectionId, donutReplay,
    selectionLabel: monthly ? undefined : "カテゴリを選択・解除",
    onHover: id => setHover(id === null ? null : {key:dataKey,id}),
    onSelect: id => { setHover(null); setSelectedId(value => value === id ? null : id); }, onClear: clear,
  };
  const series: ChartSeries[] = [{
    id: selectedSeries ? `${dimension}:${rankCategoryKey(selectedSeries.id)}` : `${dimension}:total`,
    name: selectedSeries?.name ?? totalName,
    values: selectedSeries?.values ?? a.trend.map(row => row.amount),
    color: selectedSeries?.color,
    singleMonthComparison: selectedSeries && singleMonthComparison?.previousMonth != null
      ? "CATEGORY_HISTORY_UNAVAILABLE" : singleMonthComparison,
  }];
  const clearButton = selected ? <button type="button" className="outline-button" onClick={event => { if (event.detail === 0) clearFromKeyboard(event.currentTarget); else clear(); }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); clearFromKeyboard(event.currentTarget); } }}>選択解除</button> : undefined;
  const category = dimension === "category" || !("utilities" in a) ? <CategoryCard data={a} view="donut" onChange={() => {}} combined interaction={interaction} extra={!monthly ? clearButton : undefined} /> : <Card title="費目別支出比較" sub="光熱・通信費の期間総額を100%として表示" foot={rankFoot}><Rank rows={a.utilities} total={a.total} donut combined interaction={interaction} /></Card>;
  const trend = <Card title={title} sub={<span role="status">{selectedSeries ? `選択中：${selectedSeries.name} · ${sub}` : sub}</span>} extra={monthly ? clearButton : undefined}>
      <Chart readable={!current} series={series} labels={a.labels} linked={monthly ? {key:dataKey,geometryValues:a.trend.map(row => row.amount)} : undefined} />
    </Card>;
  return <div ref={container} data-linked-categories={dimension} onKeyDown={event => { if (event.key === "Escape") clear(); }}>{category}{trend}</div>;
}
