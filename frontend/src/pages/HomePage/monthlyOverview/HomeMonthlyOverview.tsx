import { lazy, Suspense } from "react";
import styles from "../HomePage.module.css";

const Preview = import.meta.env.DEV ? lazy(() => import("./MonthlyOverviewPreview")) : null;
const LocalOverview = import.meta.env.DEV || globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ ? lazy(() => import("./LocalMonthlyOverview")) : null;

export function HomeMonthlyOverview({ smartphone = false }: { smartphone?: boolean } = {}) {
  if (LocalOverview) {
    const preview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("monthlyOverviewPreview") === "1";
    return <Suspense fallback={<><h2 id="monthly-overview-title">月次支出概要</h2><p role="status">月次支出概要を読み込んでいます。</p></>}>
      {preview && Preview ? <Preview showControls smartphone={smartphone} /> : <LocalOverview smartphone={smartphone} />}
    </Suspense>;
  }
  return <><h2 id="monthly-overview-title">月次支出概要</h2><div className={styles.monthlyPreparation}><p>準備中</p></div></>;
}
