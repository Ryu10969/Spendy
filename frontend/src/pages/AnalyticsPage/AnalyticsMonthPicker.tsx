import { useId, useRef, useState } from "react";

export function AnalyticsMonthPicker({ months, value, onChange, onMove }: {
  months: { value: string; label: string }[];
  value: string;
  onChange: (month: string) => void;
  onMove: (offset: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const index = months.findIndex(month => month.value === value);
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  return <div className="chart-month-picker" onKeyDown={event => {
    if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
  }}>
    <div className="chart-month-controls">
      <button type="button" aria-label="前月を表示" disabled={index <= 0} onClick={() => onMove(-1)}><span aria-hidden="true">‹</span></button>
      <div className="chart-month-current"><span>表示する月</span><button type="button" className="chart-month-trigger" ref={trigger} aria-label={`表示する月：${months[index]?.label ?? ""}`} aria-expanded={open} aria-controls={panelId} onClick={() => { if (open) close(); else setOpen(true); }}>{months[index]?.label}<span aria-hidden="true">{open ? "⌃" : "⌄"}</span></button></div>
      <button type="button" aria-label="翌月を表示" disabled={index >= months.length-1} onClick={() => onMove(1)}><span aria-hidden="true">›</span></button>
    </div>
    <div className="chart-month-panel" id={panelId} role="group" aria-label="表示する月の候補" hidden={!open}>
      {months.map(month => <button type="button" key={month.value} value={month.value} aria-pressed={month.value === value} onClick={() => { onChange(month.value); close(); }}><span>{month.label}</span>{month.value === value ? <span aria-hidden="true">✓</span> : null}</button>)}
    </div>
  </div>;
}
