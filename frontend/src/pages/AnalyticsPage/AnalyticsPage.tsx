import { lazy, Suspense } from "react";
import { useTheme } from "../../app/ThemeProvider";
import { Link } from "react-router-dom";
import { AnalyticsIcon, AnalyticsIcons } from "./AnalyticsIcons";
import "./analyticsV4.css";

const Demo = import.meta.env.DEV ? lazy(() => import("./DedicatedAnalyticsDemo")) : null;
const Current = import.meta.env.DEV || globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? lazy(() => import("./DedicatedAnalyticsCurrent")) : null;

export function AnalyticsPage() {
  const preview = import.meta.env.DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("analyticsPreview") === "1";
  const { theme } = useTheme();
  return <div data-analytics-v4="" data-theme={theme}>
    <AnalyticsIcons />
    <div className="main">
      {Current ? <Suspense fallback={<p role="status">支出分析を読み込んでいます。</p>}>{preview && Demo ? <Demo showControls current={<Current />} /> : <Current />}</Suspense> : <><AnalyticsHeading demo={false} /><section className="card state-card"><h2>準備中</h2><p>専用Analyticsはまだ利用できません。</p><p>正式APIと認可機構の完成後に提供予定です。</p></section></>}
    </div>
  </div>;
}

export function AnalyticsHeading({ demo = true, current = false, future = false }: { demo?: boolean; current?: boolean; future?: boolean }) {
  return <><nav className="breadcrumb" aria-label="パンくず"><Link to="/" aria-label="Homeへ戻る"><AnalyticsIcon name="arrow" />ホーム</Link><span className="slash">/</span><span>支出分析</span></nav>
    <div className="page-head" data-current-analytics={current || undefined} data-future-analytics={future || undefined}><div><div className="eyebrow">ANALYTICS</div><h1>支出分析</h1><p className="head-description">プロジェクトを横断して、日々の支出の流れを見渡す。</p><div className="scope-tag"><AnalyticsIcon name="info" />継続プロジェクトのみ・イベントは含みません</div></div>{demo ? <div className="demo-badge"><span className="demo-dot" />デモデータ</div> : null}</div></>;
}
