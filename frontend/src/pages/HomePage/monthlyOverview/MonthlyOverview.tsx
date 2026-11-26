import { useLayoutEffect, useRef } from "react";
import { currentMonth, nextMonth, previousMonth } from "../../../features/projects/monthSelection";
import { formatSignedYen, formatYen } from "../../../utils/formatMoney";
import { comparisonLabel, monthLabel } from "./monthlyOverviewPresentation";
import type { MonthlyComparison, MonthlyOverviewState } from "./monthlyOverviewPresentation";
import styles from "./MonthlyOverview.module.css";

// Only visual proportions are interpolated; financial text never uses frame values.
export function compositionBarMotion(track: HTMLElement, fill: HTMLElement, continuous: HTMLElement, event: HTMLElement, initial: number | null) {
  const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let target = initial, share = initial ?? 0, reveal = 1;
  let entered = false, visible = false, disposed = false, frame = 0;
  const observable = typeof IntersectionObserver !== "undefined";
  const paint = () => {
    continuous.style.flexGrow = String(share);
    event.style.flexGrow = String(1 - share);
    fill.style.transform = `scaleX(${target === null ? 0 : reveal})`;
  };
  const stop = () => { cancelAnimationFrame(frame); frame = 0; };
  const sync = () => {
    stop();
    if (!preference || preference.matches || !observable) {
      entered = true; share = target ?? 0; reveal = 1; paint(); return;
    }
    if (!visible) {
      share = target ?? 0; reveal = entered ? 1 : 0; paint(); return;
    }
    if (target === null) { reveal = 1; paint(); return; }
    const first = !entered;
    entered = true;
    if (first) { share = target; reveal = 0; }
    const fromShare = share, fromReveal = reveal, destination = target;
    if (share === destination && reveal === 1) { paint(); return; }
    const start = performance.now();
    paint();
    const tick = (now: number) => {
      if (disposed) return;
      const progress = Math.min(1, Math.max(0, (now - start) / 550));
      const eased = 1 - (1 - progress) ** 3;
      share = fromShare + (destination - fromShare) * eased;
      reveal = fromReveal + (1 - fromReveal) * eased;
      paint();
      frame = progress < 1 ? requestAnimationFrame(tick) : 0;
    };
    frame = requestAnimationFrame(tick);
  };
  const observer = observable ? new IntersectionObserver(entries => {
    if (disposed) return;
    const next = entries.some(entry => entry.isIntersecting);
    if (next !== visible) { visible = next; sync(); }
  }, { threshold: 0 }) : null;
  sync();
  observer?.observe(track);
  preference?.addEventListener("change", sync);
  return {
    update(next: number | null) { if (next !== target) { target = next; sync(); } },
    dispose() { disposed = true; stop(); observer?.disconnect(); preference?.removeEventListener("change", sync); },
  };
}

function CompositionBar({ continuous, event }: { continuous: number; event: number }) {
  const track = useRef<HTMLDivElement>(null), fill = useRef<HTMLDivElement>(null);
  const continuousPart = useRef<HTMLSpanElement>(null), eventPart = useRef<HTMLSpanElement>(null);
  const motion = useRef<ReturnType<typeof compositionBarMotion> | null>(null);
  const total = continuous + event;
  const target = total === 0 ? null : continuous / total;
  useLayoutEffect(() => {
    const controller = compositionBarMotion(track.current!, fill.current!, continuousPart.current!, eventPart.current!, target);
    motion.current = controller;
    return () => { controller.dispose(); motion.current = null; };
  }, []);
  useLayoutEffect(() => { motion.current?.update(target); }, [target]);
  // Stable initial styles leave React out of per-frame writes and preserve SSR.
  const initial = useRef({ continuous, event, empty: total === 0 }).current;
  return <div ref={track} className={styles.bar} aria-hidden="true">
    <div ref={fill} className={styles.barFill} style={{ transform: initial.empty ? "scaleX(0)" : undefined }}>
      <span ref={continuousPart} className={styles.continuousBar} style={{ flexGrow: initial.continuous }} />
      <span ref={eventPart} className={styles.eventBar} style={{ flexGrow: initial.event }} />
    </div>
  </div>;
}

export function Comparison({ value, formatDifference = formatSignedYen }: { value: MonthlyComparison; formatDifference?: (value: number) => string }) {
  const direction = value.difference === null ? "unavailable" : value.difference > 0 ? "increase" : value.difference < 0 ? "decrease" : "unchanged";
  const arrow = { increase: "↑", decrease: "↓", unchanged: "→", unavailable: "" }[direction];
  const amount = value.difference === null ? "—" : formatDifference(value.difference);
  const label = comparisonLabel(value);
  return <p className={styles.comparison} data-direction={direction}>
    {arrow ? <span className={styles.comparisonArrow} aria-hidden="true">{arrow} </span> : null}
    <span className={styles.comparisonText}>前月比 {value.difference === null ? label : <>
      <strong>{amount}{value.comparisonState === "COMPARABLE" ? ` (${label})` : ""}</strong>
      {value.comparisonState !== "COMPARABLE" ? ` ${label}` : null}
    </>}</span>
  </p>;
}

function TypeIcon({ event = false }: { event?: boolean }) {
  return <span className={styles.icon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={event ? "M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4" : "M3 10 12 3l9 7v11h-6v-7H9v7H3Z"} />
  </svg></span>;
}

export function MonthlyOverview({ month, state, onMonthChange, latestMonth = currentMonth(), smartphone = false, local = false }: {
  month: string;
  state: MonthlyOverviewState;
  onMonthChange: (month: string) => void;
  latestMonth?: string;
  smartphone?: boolean;
  local?: boolean;
}) {
  const previous = previousMonth(month);
  const next = nextMonth(month, latestMonth);
  // A late result for an old selection must never render under the new month.
  const data = state.status === "ready" && state.data.month === month ? state.data : null;
  const overview = <>
    <div className={styles.top}>
      <div className={smartphone ? styles.heading : undefined}><h2 id="monthly-overview-title">月次支出概要</h2><p className={styles.subtitle}>{globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? "提出デモの支出" : local ? "開発用DBの支出" : smartphone ? "プロジェクト全体の支出" : "Project全体の支出"}</p></div>
      <nav className={styles.monthNavigation} aria-label="月次支出概要の表示月">
        <button type="button" aria-label="前月" disabled={!previous} onClick={() => previous && onMonthChange(previous)}>‹</button>
        {smartphone ? <div className={styles.monthCaption}>
          <strong aria-live="polite">{monthLabel(month)}</strong>
          {month === latestMonth ? <span className={styles.currentMonth}>今月・集計途中</span> : null}
        </div> : <strong aria-live="polite">{monthLabel(month)}</strong>}
        <button type="button" aria-label="翌月" disabled={!next} onClick={() => next && onMonthChange(next)}>›</button>
      </nav>
      {!smartphone ? <div className={styles.actions}>
        <span className={styles.currentMonth}>{month === latestMonth ? "今月・集計途中" : ""}</span>
      </div> : null}
    </div>
    {data ? <div className={styles.content}>
      {data.population.projectCount === 0 ? <p className={styles.empty}>集計対象のプロジェクトはありません。</p>
        : data.selected.totalExpense === 0 ? <p className={styles.empty}>対象プロジェクトのこの月の支出はありません。</p> : null}
      <div className={styles.summary}>
        <span className={styles.totalIcon} aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="3">
          <ellipse cx="24" cy="13" rx="14" ry="7" /><path d="M10 13v10c0 10 28 10 28 0V13M10 23v10c0 10 28 10 28 0V23" />
        </svg></span>
        <div className={styles.amountGroup}><h3>合計支出</h3><p className={styles.total}>{formatYen(data.selected.totalExpense)}</p>
          <p className={styles.previous}>前月 {data.previous ? formatYen(data.previous.totalExpense) : "—"}</p>
          <Comparison value={data.comparison.total} /></div>
      </div>
      <div className={styles.breakdown}>
        <p className={styles.barTitle}>支出構成比（{monthLabel(month)}）</p>
        <CompositionBar continuous={data.selected.continuousExpense} event={data.selected.eventExpense} />
        <p className={styles.legend}>
          <span><i className={styles.continuousDot} aria-hidden="true" />継続 {data.selected.contribution.continuousPercentage === null ? "—" : `${data.selected.contribution.continuousPercentage}%`}</span>
          <span><i className={styles.eventDot} aria-hidden="true" />イベント {data.selected.contribution.eventPercentage === null ? "—" : `${data.selected.contribution.eventPercentage}%`}</span>
          {data.selected.totalExpense === 0 ? <span>支出0円のため構成比なし</span> : null}
        </p>
        <div className={styles.types}>
          {(["continuous", "event"] as const).map((type) => <div className={styles.type} key={type}>
            {smartphone ? <>
              <div className={styles.typeHeading}>
                <TypeIcon event={type === "event"} /><div className={styles.amountGroup}>
                  <h3>{type === "continuous" ? "継続プロジェクト" : "イベント"}</h3>
                  <p className={styles.typeAmount}>{formatYen(type === "continuous" ? data.selected.continuousExpense : data.selected.eventExpense)}</p>
                </div>
              </div>
              <Comparison value={data.comparison[type]} />
              {type === "event" ? <p className={styles.count}>対象 {data.selected.eventProjectCount}件 · 前月 {data.previous ? `${data.previous.eventProjectCount}件` : "—"}</p> : null}
            </> : <><TypeIcon event={type === "event"} /><div className={styles.amountGroup}>
              <h3>{type === "continuous" ? "継続プロジェクト" : "イベントプロジェクト"}</h3>
              <p className={styles.typeAmount}>{formatYen(type === "continuous" ? data.selected.continuousExpense : data.selected.eventExpense)}</p>
              <p className={styles.previous}>前月 {data.previous ? formatYen(type === "continuous" ? data.previous.continuousExpense : data.previous.eventExpense) : "—"}</p>
              <Comparison value={data.comparison[type]} />
              {type === "event" ? <p className={styles.count}>対象イベント {data.selected.eventProjectCount}件（前月 {data.previous ? `${data.previous.eventProjectCount}件` : "—"}）</p> : null}
            </div></>}
          </div>)}
        </div>
      </div>
      {!smartphone ? <footer className={styles.footer}>
        <p>前月の構成比：継続 {data.previous?.contribution.continuousPercentage == null ? "—" : `${data.previous.contribution.continuousPercentage}%`}
          {" ・ "}イベント {data.previous?.contribution.eventPercentage == null ? "—" : `${data.previous.contribution.eventPercentage}%`}</p>
        <p>{globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? "提出デモの共有台帳にあるプロジェクト全体の支出です。" : local ? "開発用DBにあるプロジェクト全体の支出です。" : "管理中・Homeに保存済みの有効なプロジェクト全体の支出です。"}アーカイブを含み、検索・表示ページにかかわらず集計します。
          支出日が対象月に属する記録を集計します。月内の将来日付の記録も含みます。増減は支出額の変化を示し、良否の評価ではありません。</p>
      </footer> : null}
    </div> : <div className={styles.status} role={state.status === "error" ? "alert" : "status"} aria-busy={state.status === "loading"}>
      <p>{state.status === "preparing" ? "準備中" : state.status === "unavailable" ? "月次支出概要を表示できません。利用可能な認証状態を確認してください。"
        : state.status === "error" ? "月次支出概要を読み込めませんでした。" : "月次支出概要を読み込んでいます。"}</p>
      {state.status === "error" && state.onRetry ? <button type="button" onClick={state.onRetry}>再試行</button> : null}
    </div>}
  </>;
  return smartphone ? <div className={styles.mobileCard} data-monthly-overview-card="">{overview}</div> : overview;
}
