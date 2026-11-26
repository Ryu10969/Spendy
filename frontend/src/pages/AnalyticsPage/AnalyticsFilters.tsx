import { useEffect, useRef, useState } from "react";
import type { AnalyticsProject, AnalyticsSelection } from "./dedicatedAnalyticsPresentation";
import { AnalyticsIcon } from "./AnalyticsIcons";
import { month } from "./AnalyticsV4Charts";
import { monthIndex } from "./dedicatedAnalyticsPresentation";
import { useAnalyticsDisclosure } from "./useAnalyticsDisclosure";

const months = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));

function MonthField({ label, id, value, invalid, onChange }: {
  label: string; id: string; value: string; invalid: boolean; onChange: (value: string) => void;
}) {
  const separator = value.lastIndexOf("-");
  const year = value.slice(0, separator);
  const selectedMonth = value.slice(separator + 1);
  return <fieldset className="month-field">
    <legend>{label}</legend>
    <div className="month-field-controls">
      <input id={`${id}-year`} type="text" inputMode="numeric" placeholder="西暦4桁" value={year}
        aria-label={`${label}の年（西暦4桁）`} aria-invalid={invalid} aria-describedby="filterError"
        onChange={event => onChange(`${event.target.value}-${selectedMonth}`)} />
      <select id={`${id}-month`} value={selectedMonth} aria-label={`${label}の月`}
        aria-invalid={invalid} aria-describedby="filterError"
        onChange={event => onChange(`${year}-${event.target.value}`)}>
        {months.map(item => <option key={item} value={item}>{Number(item)}月</option>)}
      </select>
    </div>
  </fieldset>;
}

type Props = { selection: AnalyticsSelection; applied?: AnalyticsSelection | null; projects: AnalyticsProject[]; error?: string; onChange:(v:AnalyticsSelection) => void; onApply:() => void; reselect?: number; live?: boolean };
export function AnalyticsFilters({ selection, applied = selection, projects, error, onChange, onApply, reselect = 0, live = false }: Props) {
  const disclosure = useAnalyticsDisclosure();
  const [open,setOpen]=useState(false), trigger=useRef<HTMLButtonElement>(null), picker=useRef<HTMLDivElement>(null), first=useRef<HTMLInputElement>(null);
  const count=selection.projectTokens.length;
  const pending = applied !== null && (selection.startMonth !== applied.startMonth || selection.endMonth !== applied.endMonth || selection.projectTokens.length !== applied.projectTokens.length || selection.projectTokens.some(token => !applied.projectTokens.includes(token)));
  const appliedPeriod = applied ? `${applied.startMonth.replace("-","/")}〜${applied.endMonth.replace("-","/")}` : "未適用";
  useEffect(() => { if(reselect) { disclosure.expand(); setOpen(true); } },[reselect]);
  useEffect(() => { if(open) picker.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(); },[open]);
  useEffect(() => { function outside(e: MouseEvent) { if(e.target instanceof Node && !picker.current?.contains(e.target))setOpen(false); } document.addEventListener("click",outside);return () => document.removeEventListener("click",outside); },[]);
  function close() {setOpen(false);trigger.current?.focus();}
  return <section ref={disclosure.container} className="card filters" aria-label="分析条件"><div className="filters-top"><div className="section-label">{disclosure.compact ? <button type="button" className="analytics-disclosure" ref={disclosure.trigger} aria-expanded={disclosure.expanded} aria-controls={disclosure.contentId} onClick={() => { disclosure.toggle(); setOpen(false); }}><AnalyticsIcon name="sliders" />分析条件<span aria-hidden="true">{disclosure.expanded ? "⌃" : "⌄"}</span></button> : <><AnalyticsIcon name="sliders" />分析条件</>}</div>{!disclosure.compact ? <span className="filter-hint">{live ? "支払日から集計" : "支払日から集計する架空データ"}</span> : null}</div>
    <p className="analytics-filter-summary" hidden={disclosure.expanded}>{applied ? `${applied.projectTokens.length}プロジェクト · ${appliedPeriod}` : "分析条件は未適用です"}{pending ? <span className="analytics-filter-pending">未適用の変更あり</span> : null}{error ? <span className="analytics-filter-error" role="alert">{error}</span> : null}</p>
    <div className="analytics-filter-body" id={disclosure.contentId} hidden={!disclosure.expanded}>
    <div className="filter-row"><div><div className="field-title"><span id="analytics-project-label">対象プロジェクト</span><span>1〜20件</span></div><div className="project-picker" ref={picker} onKeyDown={e => {if(e.key === "Escape" && open){e.preventDefault();close();}}}>
      <button className="project-select" id="projectSelect" ref={trigger} aria-labelledby="analytics-project-label analytics-selected-projects" aria-expanded={open} aria-controls="analytics-project-options" onClick={() => setOpen(!open)}><span className="project-selection-label" id="analytics-selected-projects">{count ? `${count}件選択中` : "プロジェクトを選択"}</span><AnalyticsIcon name="down" className="chevron" /></button>
      <div className="popover" id="analytics-project-options" hidden={!open}><fieldset><legend>継続Projectを選択（1〜20件）</legend>{projects.map((p,i) => {const checked=selection.projectTokens.includes(p.publicToken);return <label className="project-option" key={p.publicToken}><input ref={i === 0 ? first : undefined} type="checkbox" checked={checked} disabled={checked ? !live && count === 1 : count >= 20} onChange={() => onChange({...selection,projectTokens:checked ? selection.projectTokens.filter(t => t !== p.publicToken) : [...selection.projectTokens,p.publicToken]})} /><span>{p.name}</span><small>継続</small></label>;})}</fieldset><p className="popover-bottom">選択したProjectだけを集計します。最大20件・最低1件。</p><button className="outline-button" onClick={close}>選択を完了</button></div>
    </div></div><div><div className="field-title"><span>集計期間</span><span>最大24か月</span></div><div className="months">
      <MonthField label="開始年月" id="analytics-start" value={selection.startMonth} invalid={Boolean(error)}
        onChange={startMonth => onChange({...selection,startMonth})} />
      <span className="date-arrow" aria-hidden="true">→</span>
      <MonthField label="終了年月" id="analytics-end" value={selection.endMonth} invalid={Boolean(error)}
        onChange={endMonth => onChange({...selection,endMonth})} />
      <div className="analytics-filter-apply"><button className="outline-button" onClick={() => {setOpen(false);onApply();}}>適用</button></div></div></div></div>
    <p id="filterError" role="alert" hidden={!error}>{error}</p><div className={disclosure.compact && applied && !pending ? "analytics-filter-status" : "filter-bottom"}>{disclosure.compact ? <span className="period-caption" role="status">{!applied ? "未適用" : pending ? `適用中：${appliedPeriod} · 未適用の変更あり` : "分析条件を適用しました"}</span> : <span className="period-caption">{!applied ? "分析条件は未適用です" : `適用中：${month(applied.startMonth)}〜${month(applied.endMonth)} · ${monthIndex(applied.endMonth)-monthIndex(applied.startMonth)+1}か月間`}</span>}</div>
    </div></section>;
}
