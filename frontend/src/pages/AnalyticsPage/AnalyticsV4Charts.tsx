import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { animate, inView, motion, useMotionValue, useTransform, type MotionValue, type MotionStyle } from "motion/react";
import { ChartBadge, chartPreviousValue, useChartInteraction, type ChartInteraction } from "./AnalyticsChartInteraction";
import { useAnalyticsDisclosure } from "./useAnalyticsDisclosure";
import { overviewChartLayout, useAnalyticsChartViewport } from "./useAnalyticsChartViewport";
import { AnalyticsMonthPicker } from "./AnalyticsMonthPicker";
import { AnalyticsMonthComparison, chartMonthPointComparison, type SingleMonthComparison } from "./AnalyticsMonthComparison";

export const yen = (value: number) => `¥${Math.round(value).toLocaleString("ja-JP")}`;
export const number = (value: number) => value.toLocaleString("ja-JP");
export const signed = (value: number) => `${value < 0 ? "−" : value > 0 ? "+" : ""}${yen(Math.abs(value))}`;
export const month = (value: string) => `${Number(value.slice(0,4))}年${Number(value.slice(5))}月`;
export type RankRow = { id: string | null; name: string; amount: number; color?: string };
export type Comparison = { current: number; previous: number | null; difference: number | null; rate: string | null; noPreviousMonth?: boolean };
export type Analysis = { total: number; count: number; labels: string[]; previousMonth: string; comparison: Comparison; trend: { month: string; amount: number; count: number }[]; categories: RankRow[]; projects: RankRow[] };

export function Card({ title, sub, extra, foot, children }: { title: string; sub: ReactNode; extra?: ReactNode; foot?: ReactNode; children: ReactNode }) {
  const disclosure = useAnalyticsDisclosure();
  return <section ref={disclosure.container} className="card f-card" data-analysis-expanded={disclosure.expanded}><div className="card-head"><div><h2 className="card-title">{disclosure.compact ? <button type="button" className="analytics-disclosure" ref={disclosure.trigger} aria-expanded={disclosure.expanded} aria-controls={disclosure.contentId} onClick={disclosure.toggle}>{title}<span aria-hidden="true">{disclosure.expanded ? "⌃" : "⌄"}</span></button> : title}</h2><p className="card-subtitle" hidden={!disclosure.expanded}>{sub}</p></div><div className="analytics-card-extra" hidden={!disclosure.expanded}>{extra}</div></div><div className="analytics-card-body" id={disclosure.contentId} hidden={!disclosure.expanded}>{children}{foot ? <div className="f-card-foot">{foot}</div> : null}</div></section>;
}
export function Metric({ label, value, note, className = "" }: { label: string; value: ReactNode; note: ReactNode; className?: string }) {
  return <article className={`card f-kpi ${className}`} data-kpi={label}><div className="f-kpi-label">{label}</div><div className="f-kpi-value">{value}</div><div className="f-kpi-note">{note}</div></article>;
}
export function ComparisonMetric({ comparison: c, end, prior, label = "終了月の前月比", compact = false }: { comparison: Comparison; end: string; prior: string; label?: string; compact?: boolean }) {
  if (c.noPreviousMonth) return <Metric label={label} value="比較不可" className="comparison-kpi" note={`${month(end)}には比較できる前月がありません。`} />;
  const difference = c.difference ?? 0;
  const rateSign = c.rate?.startsWith("-") ? "−" : c.rate !== "0.00" && difference > 0 ? "+" : "";
  const value = c.previous === null ? "比較不可" : <>{difference > 0 ? compact ? "↑" : "↑ 増加" : difference < 0 ? compact ? "↓" : "↓ 減少" : compact ? "→" : "→ 変化なし"}{" "}{c.rate === null ? c.current === 0 ? null : <span>比較率 —</span> : <span>{`${rateSign}${c.rate.replace(/^-/, "")}%`}</span>}</>;
  return <Metric label={label} value={value} className={`comparison-kpi ${c.previous !== null && difference > 0 ? "increase" : c.previous !== null && difference < 0 ? "decrease" : ""}`} note={<>{`${month(end)}と${month(prior)}を比較`}<br />{c.previous === null ? "比較元未取得・差額と比較率は算出不可" : <>{`差額 ${signed(difference)} · ${yen(c.current)} / ${yen(c.previous)}`}{c.rate === null ? <><br />{c.current === 0 ? "両月の支出なし" : "前月の支出なし"}・比較率は算出不可</> : null}</>}</>} />;
}
export function Segmented({ label, options, value, onChange }: { label: string; options: [string,string][]; value: string; onChange: (value: string) => void }) {
  return <div className="segmented" role="group" aria-label={label}>{options.map(([key,name]) => <button type="button" key={key} aria-pressed={key === value} onClick={() => onChange(key)}>{name}</button>)}</div>;
}
export function DataTable({ headers, rows, columnRoles = [] }: { headers: string[]; rows: ReactNode[][]; columnRoles?: ("amount" | "percentage" | undefined)[] }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={`${headers.join("・")}の表`}><table className="f-table"><thead><tr>{headers.map((h,i) => <th key={i} scope="col" className={i ? "num" : ""}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i) => <tr key={i}>{row.map((cell,j) => <td key={j} className={`${j ? "num" : ""}${columnRoles[j] ? ` table-${columnRoles[j]}` : ""}`}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

// These are the v4 SVG coordinates. Currency arithmetic stays in the aggregation adapter.
export function chartAxis(maxValue: number) {
  const step = 10 ** Math.floor(Math.log10(Math.max(maxValue / 3, 1)));
  const tick = ([1,1.5,2,2.5,3,4,5,6,8,10].find(n => n * step >= maxValue / 3) ?? 10) * step;
  return Math.max(3, tick * 3);
}
export type ChartSeries = { id: string; name: string; values: number[]; color?: string; singleMonthComparison?: SingleMonthComparison };
type ChartMonthSelection = { month: string; onChange: (month: string) => void };
// Conservative SVG text bounds at the existing numeric typography. Derive from
// displayed coordinates so labels stay synchronized with interrupted Motion.
export function chartValueLabelLayout(points: string, texts: string[], bounds: { axisRight: number; width: number }) {
  const vertices = points.split(" ").map(pair => pair.split(",").map(Number));
  const placed: { x: number; y: number; width: number }[] = [];
  return texts.map((text,index) => {
    const [cx,cy] = vertices[index], width = text.length * 10;
    const ideal = index === 0 && texts.length > 1 ? cx : index === texts.length-1 && texts.length > 1 ? cx-width : cx-width/2;
    const x = Math.max(bounds.axisRight+12,Math.min(bounds.width-width-12,ideal));
    const base = Math.max(18,Math.min(242,cy-14));
    const candidates = [base,...Array.from({length:10},(_,lane) => [base-24*(lane+1),base+40+24*lane]).flat()];
    const y = candidates.find(y => y >= 18 && y <= 242
      && placed.every(other => x+width+8 <= other.x || x >= other.x+other.width+8 || Math.abs(y-other.y) >= 24)
      && vertices.every(([px,py]) => px < x-8 || px > x+width+8 || py < y-24 || py > y+8)) ?? base;
    const result = {x,y,width}; placed.push(result); return result;
  });
}
function ChartPoint({ points, progress, index, title, label, labelLayout, color, interaction, pointId, selected, onSelect }: { points: MotionValue<string>; progress: MotionValue<number>; index: number; title: string; color: string; label?: string; labelLayout: MotionValue<{ x: number; y: number; width: number }[]>; interaction: ChartInteraction; pointId: string; selected?: boolean; onSelect?: () => void }) {
  const cx = useTransform(() => Number(points.get().split(" ")[index].split(",")[0]));
  const cy = useTransform(() => Number(points.get().split(" ")[index].split(",")[1]));
  const labelX = useTransform(() => labelLayout.get()[index].x);
  const labelY = useTransform(() => labelLayout.get()[index].y);
  const opacity = useTransform(() => {
    const vertices = points.get().split(" ").map(pair => pair.split(",").map(Number));
    const distances = vertices.map((v,i) => i ? Math.hypot(v[0]-vertices[i-1][0],v[1]-vertices[i-1][1]) : 0);
    const length = distances.reduce((a,b) => a+b,0);
    const fraction = length ? distances.slice(0,index+1).reduce((a,b) => a+b,0)/length : 0;
    // Finish the line at 92% so the last point can fade in before 650ms ends.
    const reveal = progress.get();
    return reveal >= 1 ? 1 : Math.min(1,Math.max(0,(reveal-fraction*0.92)/0.08));
  });
  const radius = useMotionValue(4);
  const hitX = useTransform(() => cx.get() - 16), hitY = useTransform(() => cy.get() - 16);
  const active = interaction.current?.open && interaction.current.id === pointId;
  const emphasized = active || selected;
  const activate: ChartInteraction["select"] = (...args) => { onSelect?.(); interaction.select(...args); };
  useLayoutEffect(() => {
    const target = emphasized ? 7 : 4;
    radius.stop();
    if (interaction.reduced) radius.jump(target);
    else if (radius.get() !== target) animate(radius, target, { type: "tween", duration: 0.18, ease: "easeOut" });
    return () => radius.stop();
  }, [emphasized, interaction.reduced, radius]);
  return <g><motion.circle cx={cx} cy={cy} r={radius} fill="var(--card)" stroke={color} strokeWidth="2" style={{opacity, pointerEvents:"none"}}><title>{title}</title></motion.circle>{label !== undefined ? <motion.text className="number-label" x={labelX} y={labelY} textAnchor="start" style={{pointerEvents:"none"}}>{label}</motion.text> : null}
    <motion.rect className="chart-point-hit" x={hitX} y={hitY} width="32" height="32" rx="8" fill="transparent" role="button" tabIndex={0} aria-label={title} aria-describedby={active ? interaction.tooltipId : undefined} aria-pressed={selected ?? !!active}
      onPointerEnter={event => { if (event.pointerType !== "touch") activate(pointId, event.currentTarget, "pointer", event); }}
      onPointerMove={event => { if (event.pointerType !== "touch") interaction.move(event.currentTarget, event); }}
      onPointerLeave={() => { if (interaction.current?.mode === "pointer") interaction.clear(); }}
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => { if (event.pointerType === "touch") activate(pointId, event.currentTarget, "touch"); }}
      onClick={event => { if (event.detail === 0) activate(pointId, event.currentTarget, "focus"); }}
      onFocus={event => activate(pointId, event.currentTarget, "focus")}
      onBlur={interaction.clear}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); interaction.clear(); }
        else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(pointId, event.currentTarget, "focus"); }
      }} />
  </g>;
}
function ChartArea({ positions, progress, baseline, index, color, gradient }: { positions: MotionValue<string>; progress: MotionValue<number>; baseline: MotionValue<number>; index: number; color: string; gradient: string }) {
  const points = useTransform(() => positions.get().split("|")[index]);
  const area = useTransform(() => {
    const vertices = points.get().split(" ");
    return `${vertices[0].split(",")[0]},${baseline.get()} ${points.get()} ${vertices[vertices.length-1].split(",")[0]},${baseline.get()}`;
  });
  const opacity = useTransform(() => progress.get());
  return <g aria-hidden="true">
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} style={{stopOpacity:"var(--chart-area-opacity)"}} /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <motion.polygon points={area} fill={`url(#${gradient})`} style={{opacity,pointerEvents:"none"}} />
  </g>;
}
function ChartSeriesDrawing({ positions, progress, series, index, labels, counts, single, drawing, interaction, labelBounds, monthSelection }: { positions: MotionValue<string>; progress: MotionValue<number>; series: ChartSeries; index: number; labels: string[]; counts: boolean; single: boolean; labelBounds: { axisRight: number; width: number }; drawing?: RefObject<SVGGElement | null>; interaction: ChartInteraction; monthSelection?: ChartMonthSelection }) {
  const points = useTransform(() => positions.get().split("|")[index]);
  const pathLength = useTransform(() => Math.min(1,progress.get()/0.92));
  const texts = series.values.map(v => counts ? number(v) : yen(v));
  const labelLayout = useTransform(() => chartValueLabelLayout(points.get(),texts,labelBounds));
  return <g ref={drawing}>
    <motion.polyline points={points} pathLength={pathLength} fill="none" stroke={`var(${series.color ?? "--bright"})`} strokeWidth="2.5" />{series.values.map((v,i) => {
      const previous = chartPreviousValue(series.values, labels, i);
      const comparison = chartMonthPointComparison(v, previous, series.singleMonthComparison);
      return <ChartPoint key={labels[i]} points={points} progress={progress} index={i} title={`${series.name}・${month(labels[i])} ${counts ? `${number(v)}件` : yen(v)}・前月比 ${comparison.arrow} ${comparison.rate} ${comparison.text}`} color={`var(${series.color ?? "--bright"})`} label={single ? counts ? number(v) : yen(v) : undefined} labelLayout={labelLayout} interaction={interaction} pointId={JSON.stringify([series.id,labels[i]])} selected={monthSelection ? monthSelection.month === labels[i] : undefined} onSelect={monthSelection ? () => monthSelection.onChange(labels[i]) : undefined} />;
    })}</g>;
}
function ChartDrawing({ target, drawing, entered, series, labels, counts, interaction, labelBounds, showValues = true, baselineTarget = 232, monthSelection }: { target: string; labelBounds: { axisRight: number; width: number }; drawing: RefObject<SVGGElement | null>; entered: RefObject<boolean>; series: ChartSeries[]; labels: string[]; counts: boolean; interaction: ChartInteraction; showValues?: boolean; baselineTarget?: number; monthSelection?: ChartMonthSelection }) {
  // CSR must render the hidden entrance state before any effects/observer callbacks.
  // SSR and reduced/unsupported environments retain the completed graphic.
  const prepareEntrance = !entered.current && typeof window !== "undefined" && typeof IntersectionObserver !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === false;
  const positions = useMotionValue(target), progress = useMotionValue(prepareEntrance ? 0 : 1);
  const baseline = useMotionValue(baselineTarget), latestBaseline = useRef(baselineTarget);
  const latest = useRef(target), update = useRef(() => {});
  useLayoutEffect(() => { latest.current = target; latestBaseline.current = baselineTarget; update.current(); }, [target, baselineTarget]);
  useLayoutEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    // A descendant's layout effect precedes ancestor host refs. This own SVG ref
    // is attached first; its DOM ancestors already exist without their React refs.
    const viewport = drawing.current?.ownerSVGElement?.parentElement;
    const observable = typeof IntersectionObserver !== "undefined" && viewport != null;
    let visible = false;
    const sync = () => {
      positions.stop();
      baseline.stop();
      if (!preference || preference.matches || !observable) {
        entered.current = true; positions.jump(latest.current); baseline.jump(latestBaseline.current); progress.jump(1);
      } else if (!visible) {
        positions.jump(latest.current); baseline.jump(latestBaseline.current); progress.jump(entered.current ? 1 : 0);
      } else if (!entered.current) {
        entered.current = true; positions.jump(latest.current); baseline.jump(latestBaseline.current); progress.jump(0);
        animate(progress,1,{type:"tween",duration:0.65,ease:"linear"});
      } else if (positions.get() !== latest.current) {
        animate(positions,latest.current,{type:"tween",duration:0.3,ease:"easeOut"});
      }
      if (visible && baseline.get() !== latestBaseline.current) animate(baseline,latestBaseline.current,{type:"tween",duration:0.3,ease:"easeOut"});
    };
    update.current = sync; sync();
    // Same viewport policy as RankBar; keep its established animation unchanged.
    const stopObserving = observable ? inView(viewport!,() => {
      visible = true; sync(); return () => { visible = false; sync(); };
    },{amount:"some"}) : undefined;
    preference?.addEventListener("change",sync);
    return () => {
      stopObserving?.(); preference?.removeEventListener("change",sync);
      positions.stop(); baseline.stop(); progress.stop(); update.current = () => {};
    };
  }, [positions, progress, baseline, drawing, entered]);
  return <>{series.map((s,i) => <ChartArea key={s.id} positions={positions} progress={progress} baseline={baseline} index={i} color={`var(${s.color ?? "--bright"})`} gradient={`chart-area-${interaction.tooltipId}-${i}`} />)}{series.map((s,i) => <ChartSeriesDrawing key={s.id} drawing={i === 0 ? drawing : undefined} positions={positions} progress={progress} series={s} index={i} single={showValues && series.length === 1} labels={labels} counts={counts} interaction={interaction} labelBounds={labelBounds} monthSelection={monthSelection} />)}</>;
}
export function Chart({ series, labels, counts = false, readable = false, linked }: { series: ChartSeries[]; labels: string[]; counts?: boolean; readable?: boolean; linked?: { key: string; geometryValues: number[] } }) {
  const drawing = useRef<SVGGElement>(null), entered = useRef(false);
  const viewport = useAnalyticsChartViewport();
  const [mode, setMode] = useState("overview");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const overview = viewport.compact && mode === "overview";
  const max = chartAxis(Math.max(0, ...series.flatMap(s => s.values)));
  // Future edge labels face inward, clear of the Y axis; reserve only the actual intervals.
  const geometryValues = linked?.geometryValues ?? series.flatMap(s => s.values);
  const geometryMax = linked ? chartAxis(Math.max(0,...geometryValues)) : max;
  const valueWidth = Math.max(...geometryValues.map(v => (counts ? number(v) : yen(v)).length), 1) * 10;
  const layout = overview ? overviewChartLayout(viewport.width || 240, labels, geometryMax, viewport.fontSize) : null;
  const left = layout?.left ?? (readable ? Math.max(90, number(geometryMax).length * 9 + 20, valueWidth / 2 + 12) : 80);
  const right = layout?.right ?? (readable ? 50 : 60);
  const spacing = Math.max(124, valueWidth * (labels.length === 2 ? 2 : 1.5) + 8);
  const width = overview ? viewport.width || 240 : readable ? Math.max(740, (labels.length - 1) * spacing + left + right) : Math.max(640, labels.length * 105 + 110);
  const x = (i: number) => labels.length === 1 ? left + (width-left-right)/2 : left + i * (width-left-right)/(labels.length-1);
  const y = (v: number) => layout ? layout.top + (layout.bottom-layout.top) * (1-v/max) : 36 + 196 * (1-v/max);
  // Remount only the drawing when identity/domain/geometry changes: never morph different months.
  // Only the linked category owner can authorize a semantic/scale change. Its key
  // includes the applied scope and full monthly data, but excludes the selection.
  const structure = JSON.stringify([labels,linked ? [linked.key,series.map(s => s.values.length)] : series.map(s => [s.id,s.name,s.values.length]),linked ? null : max,left,right,width,280,counts,readable]);
  // Responsive geometry/mode updates retarget the mounted Motion values.
  const drawingKey = viewport.compact ? JSON.stringify([labels, linked ? [linked.key,series.map(s => s.values.length)] : series.map(s => [s.id,s.name,s.values.length]), counts]) : structure;
  const target = series.map(s => s.values.map((v,i) => `${x(i)},${y(v)}`).join(" ")).join("|");
  const interaction = useChartInteraction(JSON.stringify([structure,target,series.map(s => [s.id,s.name,s.singleMonthComparison])]));
  const selected = series.flatMap(s => s.values.map((value,i) => ({ series:s, value, i, id:JSON.stringify([s.id,labels[i]]) }))).find(p => p.id === interaction.current?.id);
  const prior = selected ? chartPreviousValue(selected.series.values, labels, selected.i) : null;
  const comparison = selected ? chartMonthPointComparison(selected.value,prior,selected.series.singleMonthComparison) : null;
  const monthIndex = selectedMonth && labels.includes(selectedMonth) ? labels.indexOf(selectedMonth) : labels.length-1;
  function chooseMonth(value: string) { if (labels.includes(value)) { setSelectedMonth(value); interaction.clear(); } }
  function moveMonth(offset: number) {
    interaction.clear();
    setSelectedMonth(value => {
      const index = value && labels.includes(value) ? labels.indexOf(value) : labels.length-1;
      return labels[Math.max(0, Math.min(labels.length-1, index+offset))];
    });
  }
  return <><div className="f-chart" ref={interaction.container} onPointerDown={interaction.clear} onKeyDown={event => { if (event.key === "Escape") interaction.clear(); }}><div className="chart-unit">{counts ? "支出件数（件）" : "支出額（円）"} · 縦軸は0から</div>
    {viewport.compact ? <div className="chart-mode"><Segmented label="月次グラフの表示" options={[["overview","全体表示"],["detail","詳細表示"]]} value={mode} onChange={setMode} /></div> : null}
    {series.length > 1 ? <div className="f-line-legend">{series.map(s => <span key={s.name}><i style={{background:`var(${s.color})`}} />{s.name}</span>)}</div> : null}
    <div className="chart-scroll" ref={viewport.viewport} data-chart-mode={viewport.compact ? mode : undefined} tabIndex={0} role="region" aria-label={overview ? "月次グラフ。全期間を表示" : "月次グラフ。長期間は横にスクロール"}><svg style={overview ? undefined : {minWidth:width}} viewBox={`0 0 ${width} ${layout?.height ?? 280}`} role="group" aria-label={series.map(s => `${s.name}: ${s.values.map((v,i) => `${month(labels[i])} ${counts ? `${number(v)}件` : yen(v)}`).join("、")}`).join("。")}>
      {[0,1,2,3].map(i => { const text=number(Math.round(max*i/3)); const lines=layout?.axisLines(text); return <g key={i}><line className="f-grid" x1={left} x2={width-right} y1={y(max*i/3)} y2={y(max*i/3)} /><text x={left-15} y={y(max*i/3)+4} textAnchor="end" aria-label={overview ? text : undefined}>{lines ? lines.map((line,j) => <tspan key={j} x={left-15} dy={j ? layout!.fontSize : -(lines.length-1)*layout!.fontSize} aria-hidden="true">{line}</tspan>) : text}</text></g>; })}
      <ChartDrawing key={drawingKey} target={target} drawing={drawing} entered={entered} series={series} labels={labels} counts={counts} interaction={interaction} labelBounds={{axisRight:left-15,width}} showValues={!overview} baselineTarget={layout?.bottom ?? 232} monthSelection={viewport.compact ? {month:labels[monthIndex],onChange:setSelectedMonth} : undefined} />
      {labels.map((m,i) => !layout || layout.indices.includes(i) ? <text key={m} x={layout?.labelX(i) ?? x(i)} y={layout?.labelY(i) ?? 267} textAnchor="middle">{layout ? m.replace("-","/") : month(m)}</text> : null)}
    </svg></div><ChartBadge interaction={interaction}>{selected && comparison ? <>
      <small>{month(labels[selected.i])} · {selected.series.name}</small><strong>{counts ? `${number(selected.value)}件` : yen(selected.value)}</strong>
      <div className="chart-point-change" data-direction={comparison.rate === "—" ? "unavailable" : comparison.direction}><span>前月比</span><b>{comparison.arrow} {comparison.rate}</b><span>{comparison.text}</span></div>
    </> : null}</ChartBadge>
    {viewport.compact ? <div className="chart-month-selection"><AnalyticsMonthPicker months={labels.map(value => ({value,label:month(value)}))} value={labels[monthIndex]} onChange={chooseMonth} onMove={moveMonth} /><div className="chart-month-details" role="status" aria-live="polite" aria-atomic="true"><strong>{month(labels[monthIndex])}</strong>{series.map(s => <div key={s.id}><span>{s.name}</span><b>{counts ? `${number(s.values[monthIndex])}件` : yen(s.values[monthIndex])}</b><AnalyticsMonthComparison current={s.values[monthIndex]} previous={chartPreviousValue(s.values,labels,monthIndex)} counts={counts} comparison={s.singleMonthComparison} /></div>)}</div></div> : null}
    </div><details className="chart-data"><summary>グラフの数値を見る</summary>{viewport.compact ? <ol className="chart-month-list" role="list">{labels.map((m,i) => <li key={m}><h3><time dateTime={m}>{month(m)}</time></h3><dl>{series.map(s => <div key={s.id}><dt>{s.name}</dt><dd>{counts ? `${number(s.values[i])}件` : yen(s.values[i])}</dd></div>)}</dl></li>)}</ol> : <DataTable columnRoles={readable && !counts ? [undefined, ...series.map(() => "amount" as const)] : undefined} headers={["年月", ...series.map(s => s.name)]} rows={labels.map((m,i) => [month(m), ...series.map(s => counts ? `${number(s.values[i])}件` : yen(s.values[i]))])} />}</details></>;
}
export const rankFoot = "棒の全幅は対応する期間総額の100%。割合は小数第1位に四捨五入。";
export function RankBar({ target, color, className = "f-track" }: { target: string; color: string; className?: string }) {
  const track = useRef<HTMLDivElement>(null), latest = useRef(target), entered = useRef(false);
  const update = useRef(() => {}), width = useMotionValue(target);
  useLayoutEffect(() => { latest.current = target; update.current(); }, [target]);
  useLayoutEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const observable = typeof IntersectionObserver !== "undefined" && track.current !== null;
    let visible = false;
    const sync = () => {
      width.stop();
      if (!preference || preference.matches || !observable) {
        entered.current = true;
        width.jump(latest.current);
      } else if (!visible) {
        width.jump(entered.current ? latest.current : "0%");
      } else {
        const first = !entered.current;
        entered.current = true;
        if (first) width.jump("0%");
        if (width.get() !== latest.current) {
          animate(width, latest.current, { type: "tween", duration: first ? 0.55 : 0.25, ease: "easeOut" });
        }
      }
    };
    update.current = sync;
    sync();
    // Observe the full track, not its initially empty fill or a potentially tall card.
    const stopObserving = observable ? inView(track.current!, () => {
      visible = true; sync();
      return () => { visible = false; sync(); };
    }, { amount: "some" }) : undefined;
    // Listen directly: useReducedMotion does not subscribe to changes in Motion 14.
    preference?.addEventListener("change", sync);
    return () => {
      stopObserving?.(); preference?.removeEventListener("change", sync); width.stop();
      update.current = () => {};
    };
  }, [width]);
  return <div className={className} aria-hidden="true" ref={track}><motion.span style={{ width, background: color }} /></div>;
}
// Ring order follows category identity, independently of the amount-sorted legend.
const donutCircumference = 2 * Math.PI * 64;
const categoryId = (row: RankRow) => row.id ?? "unclassified";
type DonutRow = RankRow & { active: boolean };
export type DonutReplay = { revision: number; waiting: boolean };
export type RankInteraction = {
  highlighted: string | null; selected: string | null; reduced: boolean; selectionId: string;
  donutReplay?: DonutReplay; selectionLabel?: string;
  onHover: (id: string | null) => void; onSelect: (id: string) => void; onClear: () => void;
};
export const rankCategoryKey = (id: string | null) => JSON.stringify(id);
function categoryControl(row: RankRow, total: number, interaction?: RankInteraction) {
  if (!interaction) return {};
  const id = rankCategoryKey(row.id);
  return {
    role: "button", tabIndex: 0, "aria-pressed": interaction.selected === id,
    "aria-label": `${row.name}・支出金額 ${yen(row.amount)}・構成比 ${(row.amount/total*100).toFixed(1)}%。${interaction.selectionLabel ?? "月次推移を選択・解除"}`,
    onPointerEnter: (event: { pointerType: string }) => { if (event.pointerType !== "touch") interaction.onHover(id); },
    onPointerLeave: () => interaction.onHover(null), onFocus: () => interaction.onHover(id), onBlur: () => interaction.onHover(null),
    onClick: () => interaction.onSelect(id),
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (event.key === "Escape") { event.preventDefault(); interaction.onClear(); }
      else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); interaction.onSelect(id); }
    },
  };
}
function useCategoryOpacity(row: RankRow, interaction?: RankInteraction) {
  const target = interaction?.highlighted && interaction.highlighted !== rankCategoryKey(row.id) ? 0.45 : 1;
  const opacity = useMotionValue(target);
  useLayoutEffect(() => {
    opacity.stop();
    if (!interaction || interaction.reduced) opacity.jump(target);
    else if (opacity.get() !== target) animate(opacity,target,{type:"tween",duration:0.16,ease:"easeOut"});
    return () => opacity.stop();
  }, [target, interaction?.reduced, opacity]);
  return opacity;
}
function InteractiveRankRow({ row, total, interaction, children }: { row: RankRow; total: number; interaction: RankInteraction; children: ReactNode }) {
  const opacity = useCategoryOpacity(row,interaction);
  return <motion.div className="f-rank-row" data-key={categoryId(row)} data-amount={row.amount} {...categoryControl(row,total,interaction)} style={{"--linked-category-opacity":opacity} as MotionStyle}>{children}{interaction.selected === rankCategoryKey(row.id) ? interaction.reduced ? <span className="linked-category-selection" aria-hidden="true" /> : <motion.span className="linked-category-selection" aria-hidden="true" layoutId={interaction.selectionId} transition={{type:"tween",duration:0.18,ease:"easeOut"}} /> : null}</motion.div>;
}

function DonutArc({ boundaries, reveal, target, index, row, total, interaction, motionEnabled }: { boundaries: MotionValue<number[]>; reveal: MotionValue<number>; target: number[]; index: number; row: DonutRow; total: number; interaction?: RankInteraction; motionEnabled: boolean }) {
  const opacity = useCategoryOpacity(row,interaction), emphasis = useMotionValue(0);
  const anchored = interaction?.donutReplay !== undefined;
  const active = row.active && row.amount > 0 && interaction?.highlighted === rankCategoryKey(row.id);
  useLayoutEffect(() => {
    const target = active ? 1 : 0;
    emphasis.stop();
    if (!interaction || interaction.reduced) emphasis.jump(target);
    else if (emphasis.get() !== target) animate(emphasis,target,{type:"tween",duration:0.18,ease:"easeOut"});
    return () => emphasis.stop();
  }, [active, interaction?.reduced, emphasis]);
  const start = () => boundaries.get()[index] ?? 1;
  const fullLength = () => ((boundaries.get()[index+1] ?? 1)-start())*donutCircumference;
  // 40ms stagger, capped at 230ms; all arcs finish within the 1150ms entrance.
  const length = () => {
    const local = Math.min(1,Math.max(0,(reveal.get()-Math.min(index*0.035,0.2))/0.8));
    return fullLength()*(1-(1-local)**3);
  };
  // Raw CSS values also serialize in Motion's SVG SSR props (MotionValues do not).
  const completeLength = ((target[index+1] ?? 1)-(target[index] ?? 1))*donutCircumference;
  // On Current, normalize against the browser's measured path and leave a full
  // circumference of gap so a segment cannot repeat across the start seam.
  const completeDash = anchored ? `${completeLength / donutCircumference} 1` : `${completeLength} ${donutCircumference-completeLength}`;
  const dash = useTransform(() => `${length()} ${donutCircumference-length()}`);
  const offset = useTransform(() => -start()*donutCircumference);
  const pathLength = useTransform(() => length() / donutCircumference);
  const pathOffset = useTransform(start);
  // A real arc path gives each hit region an unambiguous angular extent instead
  // of relying on hit-testing gaps in overlapping dashed full circles.
  const hit = useTransform(() => {
    const span = fullLength()/donutCircumference;
    if (span <= 0) return "M 80 80";
    const point = (fraction: number) => `${80+64*Math.cos(fraction*2*Math.PI)} ${80+64*Math.sin(fraction*2*Math.PI)}`;
    return `M ${point(start())} A 64 64 0 0 1 ${point(start()+span/2)} A 64 64 0 0 1 ${point(start()+span)}`;
  });
  const width = useTransform(() => 20+4*emphasis.get());
  const focusWidth = useTransform(() => width.get()+4);
  const x = useTransform(() => anchored ? 0 : Math.cos((start()+fullLength()/donutCircumference/2)*2*Math.PI)*2*emphasis.get());
  const y = useTransform(() => anchored ? 0 : Math.sin((start()+fullLength()/donutCircumference/2)*2*Math.PI)*2*emphasis.get());
  const circleStyle = { ...(motionEnabled ? {"--donut-complete-dash":completeDash,"--donut-complete-offset":-(target[index] ?? 1)*(anchored ? 1 : donutCircumference)} : {}), ...(interaction ? {opacity,pointerEvents:"none","--linked-arc-width":width} : {}) };
  const drawing = anchored ? { pathLength, pathOffset, strokeLinecap: "butt" as const } : { strokeDasharray: dash, strokeDashoffset: offset };
  const circle = <motion.circle data-category-id={categoryId(row)} aria-hidden={!row.active || interaction ? true : undefined} cx="80" cy="80" r="64" style={motionEnabled || interaction ? circleStyle as MotionStyle : undefined} stroke={`var(${row.color ?? "--bright"})`} {...drawing}>{row.active ? <title>{`${row.name} ${yen(row.amount)} ${(row.amount/total*100).toFixed(1)}%`}</title> : null}</motion.circle>;
  if (!interaction) return circle;
  return <g className="linked-donut-arc"><motion.g className="linked-donut-visual" style={{x,y,pointerEvents:"none"}}>
    <motion.path className="linked-donut-focus" aria-hidden="true" d={hit} fill="none" stroke="var(--text)" strokeWidth={focusWidth} />{circle}
  </motion.g>{row.active && row.amount > 0 ? <motion.path className="linked-donut-hit" data-category-control={categoryId(row)} d={hit} fill="none" stroke="transparent" strokeWidth="28" style={{pointerEvents:"stroke"}} {...categoryControl(row,total,interaction)} /> : null}</g>;
}
// Static CSS only: noscript must be parsed as text when scripting is enabled,
// otherwise a programmatically inserted fallback <style> would cancel the reveal.
const completedDonutCss = ':where([data-analytics-v4]) svg[data-donut-motion] circle{stroke-dasharray:var(--donut-complete-dash);stroke-dashoffset:var(--donut-complete-offset)}';
function DonutDrawing({ rows, total, target, interaction, motionEnabled }: { rows: DonutRow[]; total: number; target: number[]; interaction?: RankInteraction; motionEnabled: boolean }) {
  const svg = useRef<SVGSVGElement>(null), boundaries = useMotionValue(target), progress = useMotionValue(1);
  // SSR and the first client render agree: no completed ring before hydration.
  // CSS completes reduced-motion/no-script graphics; exact text never depends on reveal.
  const reveal = useMotionValue(motionEnabled ? 0 : 1), entered = useRef(!motionEnabled);
  const replay = interaction?.donutReplay;
  const latest = useRef({ target, replay }), update = useRef(() => {});
  const replayed = useRef(replay?.revision);
  const targetKey = JSON.stringify(target);
  useLayoutEffect(() => { latest.current = { target, replay }; update.current(); }, [targetKey, replay?.revision, replay?.waiting]);
  useLayoutEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const observable = typeof IntersectionObserver !== "undefined" && svg.current !== null;
    let visible = false, revision = 0;
    const sync = () => {
      const generation = ++revision;
      progress.stop();
      const { target: destination, replay } = latest.current;
      if (replay && !replay.waiting && replay.revision !== replayed.current) {
        replayed.current = replay.revision;
        entered.current = false;
        reveal.jump(0);
      }
      const current = boundaries.get();
      const from = destination.map((_,i) => current[i] ?? 1);
      if (!preference || preference.matches || !observable) {
        entered.current = true; reveal.stop(); reveal.jump(1); boundaries.jump(destination); return;
      }
      if (!visible) {
        boundaries.jump(destination);
        if (entered.current) { reveal.stop(); reveal.jump(1); }
        return;
      }
      if (!entered.current) {
        boundaries.jump(destination);
        if (replay?.waiting) return;
        entered.current = true; reveal.jump(0);
        animate(reveal,1,{type:"tween",duration:1.15,ease:"linear"}); return;
      }
      if (from.every((v,i) => v === destination[i])) { boundaries.jump(destination); return; }
      // Retarget the displayed boundaries without restarting an in-flight reveal.
      boundaries.jump(from); progress.jump(0);
      animate(progress,1,{type:"tween",duration:motionEnabled ? 0.75 : 0.6,ease:"easeInOut",onUpdate: value => {
        if (generation !== revision) return;
        boundaries.set(destination.map((end,i) => i === 0 ? 0 : i === destination.length-1 ? 1 : from[i]+(end-from[i])*value));
      }});
    };
    update.current = sync; sync();
    const stopObserving = observable ? inView(svg.current!,() => {
      visible = true; sync(); return () => { visible = false; sync(); };
    },{amount:"some"}) : undefined;
    preference?.addEventListener("change",sync);
    return () => { revision++; stopObserving?.(); preference?.removeEventListener("change",sync); progress.stop(); reveal.stop(); update.current = () => {}; };
  }, [boundaries, progress, reveal, motionEnabled]);
  return <>{motionEnabled ? <noscript dangerouslySetInnerHTML={{__html:`<style>${completedDonutCss}</style>`}} /> : null}<svg ref={svg} data-donut-motion={motionEnabled ? "true" : undefined} viewBox="0 0 160 160" role={interaction ? "group" : "img"} aria-label="カテゴリ別構成比。金額と割合は隣の凡例に表示">{motionEnabled ? <style>{`@media(prefers-reduced-motion:reduce){${completedDonutCss}}`}</style> : null}{rows.map((row,index) => <DonutArc key={categoryId(row)} boundaries={boundaries} reveal={reveal} target={target} index={index} row={row} total={total} interaction={interaction} motionEnabled={motionEnabled} />)}</svg></>;
}
function Donut({ rows, total, interaction, motionEnabled }: { rows: RankRow[]; total: number; interaction?: RankInteraction; motionEnabled: boolean }) {
  const history = useRef<RankRow[]>([]);
  const byId = new Map(rows.map(row => [categoryId(row),row]));
  const valid = byId.size === rows.length;
  const previousIds = new Set(history.current.map(categoryId));
  const ordered: DonutRow[] = [...history.current.map(row => ({...(byId.get(categoryId(row)) ?? {...row,name:"",amount:0}),active:byId.has(categoryId(row))})),...rows.filter(row => !previousIds.has(categoryId(row))).map(row => ({...row,active:true}))];
  useLayoutEffect(() => { history.current = valid ? ordered : []; }, [rows, valid]);
  let cumulative = 0;
  const target = [0,...ordered.map((row,index) => { cumulative += row.amount/total; return index === ordered.length-1 ? 1 : Math.min(1,cumulative); })];
  if (!valid) {
    // Ambiguous duplicate identity cannot be morphed safely. Keep exact static data.
    let offset = 0;
    return <svg viewBox="0 0 160 160" role="img" aria-label="カテゴリ別構成比。金額と割合は隣の凡例に表示">{rows.map((row,index) => { const length=row.amount/total*donutCircumference,start=offset;offset+=length;return <circle key={index} cx="80" cy="80" r="64" stroke={`var(${row.color ?? "--bright"})`} strokeDasharray={`${length} ${donutCircumference-length}`} strokeDashoffset={-start}><title>{`${row.name} ${yen(row.amount)} ${(row.amount/total*100).toFixed(1)}%`}</title></circle>; })}</svg>;
  }
  return <DonutDrawing rows={ordered} total={total} target={target} interaction={interaction} motionEnabled={motionEnabled} />;
}
function DonutCenter({ amount, label }: { amount: number; label: string }) {
  const element = useRef<HTMLElement>(null), latest = useRef(amount), entered = useRef(false), update = useRef(() => {});
  const prepareEntrance = typeof window !== "undefined" && typeof IntersectionObserver !== "undefined"
    && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === false;
  const value = useMotionValue(prepareEntrance ? 0 : amount);
  const display = useTransform(() => yen(value.get()));
  useLayoutEffect(() => { latest.current = amount; update.current(); }, [amount]);
  useLayoutEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const observable = typeof IntersectionObserver !== "undefined" && element.current !== null;
    let visible = false;
    const sync = () => {
      value.stop();
      if (!preference || preference.matches || !observable) {
        entered.current = true; value.jump(latest.current);
      } else if (!visible) {
        value.jump(entered.current ? latest.current : 0);
      } else {
        const first = !entered.current;
        entered.current = true;
        if (first) value.jump(0);
        if (value.get() !== latest.current) animate(value,latest.current,{type:"tween",duration:first ? 0.6 : 0.3,ease:"easeOut"});
      }
    };
    update.current = sync; sync();
    const stopObserving = observable ? inView(element.current!,() => {
      visible = true; sync(); return () => { visible = false; sync(); };
    },{amount:"some"}) : undefined;
    preference?.addEventListener("change",sync);
    return () => { stopObserving?.(); preference?.removeEventListener("change",sync); value.stop(); update.current = () => {}; };
  }, [value]);
  // Only the visual amount animates. Assistive technology always receives the
  // exact target synchronously; no live region announces intermediate frames.
  return <div className="f-donut-center"><span aria-hidden="true">{label}</span><motion.strong ref={element} className="linked-donut-value" aria-hidden="true">{display}</motion.strong><span className="linked-donut-exact">{`${label} ${yen(amount)}`}</span></div>;
}
export function Rank({ rows, total, donut = false, combined = false, interaction }: { rows: RankRow[]; total: number; donut?: boolean; combined?: boolean; interaction?: RankInteraction }) {
  const sorted = [...rows].sort((a,b) => b.amount-a.amount), pct = (n: number) => total ? `${(n/total*100).toFixed(1)}%` : "—";
  const centerRow = interaction ? rows.find(row => rankCategoryKey(row.id) === interaction.highlighted) : undefined;
  const row = (r: RankRow) => {
    const content = <><div className="f-rank-name"><span className="swatch" style={{background:`var(${r.color ?? "--bright"})`}} /><span>{r.name}</span></div>{!donut || combined ? <RankBar target={total ? `${r.amount/total*100}%` : "0%"} color={`var(${r.color ?? "--bright"})`} /> : null}<span className="f-rank-amount">{yen(r.amount)}</span><span className="f-rank-pct">{pct(r.amount)}</span></>;
    return interaction ? <InteractiveRankRow key={rankCategoryKey(r.id)} row={r} total={total} interaction={interaction}>{content}</InteractiveRankRow> : <div className="f-rank-row" role="group" aria-label={`${r.name}・支出金額 ${yen(r.amount)}・構成比 ${pct(r.amount)}`} key={r.id ?? "unclassified"} data-key={r.id ?? "unclassified"} data-amount={r.amount}>{content}</div>;
  };
  if (!total) return <div className="empty-state"><strong>対象期間の支出はありません</strong>合計 ¥0・0件。構成比は算出しません。</div>;
  if (!donut) return <>{sorted.map(row)}</>;
  return <div className={`f-donut-layout${combined ? " current-category-layout" : ""}`}><div className="f-donut"><Donut rows={sorted} total={total} interaction={interaction} motionEnabled={interaction !== undefined} />{interaction ? <DonutCenter amount={centerRow?.amount ?? total} label={centerRow?.name ?? "期間支出総額"} /> : <div className="f-donut-center">期間支出総額<strong>{yen(total)}</strong></div>}</div><div className="f-donut-legend">{sorted.map(row)}</div></div>;
}
export function CategoryCard({ data, view, onChange, current = false, combined = false, interaction, extra }: { data: Analysis; view: string; onChange: (v: string) => void; current?: boolean; combined?: boolean; interaction?: RankInteraction; extra?: ReactNode }) {
  return <Card title="カテゴリ別支出" sub="期間全体の内訳と構成比" extra={extra ?? (current || combined ? null : <Segmented label="カテゴリの表示形式" options={[["bars","横棒"],["donut","ドーナツ"]]} value={view} onChange={onChange} />)} foot={rankFoot}><Rank rows={data.categories} total={data.total} donut={current || combined || view === "donut"} combined={current || combined} interaction={interaction} /></Card>;
}
export function AllAnalysis({ data: a, current, view, onChange, children, compactComparison = false, combinedCategories = false, categoryAnalysis }: { data: Analysis; current: boolean; view: string; onChange: (v: string) => void; children?: ReactNode; compactComparison?: boolean; combinedCategories?: boolean; categoryAnalysis?: ReactNode }) {
  const end=a.labels[a.labels.length-1];
  const categories = <CategoryCard data={a} view={view} onChange={onChange} current={current} combined={combinedCategories} />;
  return <><div className="results-meta"><span><strong>分析結果</strong>{` · ${a.projects.length}プロジェクト`}</span><span>{`${month(a.labels[0])} — ${month(end)} · JPY`}</span></div>
    <section className={`f-kpis ${current ? "current-kpis" : ""}`} aria-label="分析サマリー"><Metric label="期間支出総額" value={yen(a.total)} note={`${a.projects.length}Project・${a.labels.length}か月間`} /><Metric label="支出件数" value={<>{number(a.count)}<span className="f-unit">件</span></>} note="支払日が対象期間内の支出件数" /><ComparisonMetric comparison={a.comparison} end={end} prior={a.previousMonth} compact={current || compactComparison} />{!current ? <Metric label="1件あたり平均支出" value={a.count ? yen(a.total/a.count) : "—"} note="期間支出総額 ÷ 支出件数・円単位で四捨五入" /> : null}</section>
    {categoryAnalysis ?? <>{current ? categories : null}
    <Card title="月次支出推移" sub={`選択した${a.projects.length}Projectの月別合計`} foot="支払日（paidOn）を基準に、各支出を一度ずつ集計。"><Chart readable={!current} series={[{id:"expense-total",name:"支出合計",values:a.trend.map(t => t.amount)}]} labels={a.labels} /></Card>
    {current ? null : categories}</>}<Card title="プロジェクト別支出" sub="選択した継続Projectの期間合計" foot={rankFoot}><Rank rows={a.projects.map((p,i) => ({...p,color:["--c1","--c2","--c3"][i%3]}))} total={a.total} /></Card>{children}
    </>;
}
