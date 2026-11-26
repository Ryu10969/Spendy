import type { ReactNode } from "react";
import type { AnalyticsComparisonResponse, ProjectMonthlyAnalyticsResponse } from "../../api/analyticsApi";
import { ApiError } from "../../api/client";
import { expenseCategoryLabels } from "../expenses/expenseCategories";
import { CollapsibleCard } from "../projects/components/CollapsibleCard";
import { analyticsMonthLabel, comparisonText, type AnalyticsPresentation } from "./analyticsPresentation";
import { formatSignedYen, formatYen } from "../../utils/formatMoney";
import styles from "./ProjectAnalytics.module.css";

type Props = { analytics: AnalyticsPresentation; month: string; onRetry: () => void };

function AnalyticsNotice({ analytics, onRetry }: Pick<Props, "analytics" | "onRetry">) {
  if (analytics.status === "error") {
    const code = analytics.error instanceof ApiError ? analytics.error.code : undefined;
    const ledgerError = code === "ANALYTICS_AMOUNT_OUT_OF_RANGE" || code === "ANALYTICS_CALCULATION_INVALID";
    const unsupported = code === "ANALYTICS_SCOPE_UNSUPPORTED";
    return <div role="alert" className={styles.error}>
      <p>{analytics.data ? "分析の更新に失敗しました。以前に取得したデータを表示しています。" : "分析を取得できませんでした"}</p>
      {ledgerError ? <p>金額の範囲または保存データの整合性により、分析を表示できません。支出履歴を確認してください。</p>
        : unsupported ? <p>このプロジェクトは月次分析の対象ではありません。</p>
          : <button type="button" onClick={onRetry}>再試行</button>}
    </div>;
  }
  if (!analytics.data) return <div role="status">
    <p>分析を読み込んでいます</p><div className={styles.skeleton} aria-hidden="true" />
  </div>;
  return <p role="status" className={analytics.refreshing ? styles.notice : styles.srOnly}>
    {analytics.refreshing ? "更新中 · 以前に取得したデータを表示しています。" : "選択月の分析を取得しました。"}
  </p>;
}

function Average({ data }: { data: ProjectMonthlyAnalyticsResponse }) {
  return <div className={styles.average}>
    <span>参加者1人あたりの平均負担（参考）</span>
    <strong>{data.averagePerPerson === null ? "—（対象参加者なし）" : formatYen(data.averagePerPerson)}</strong>
    <span>対象参加者 {data.participantCount}人</span>
  </div>;
}

function Comparison({ comparison }: { comparison: AnalyticsComparisonResponse }) {
  const { difference, percentageChange, previousMonth, previousTotalExpense, comparisonState } = comparison;
  if (difference === null || comparisonState === "BOTH_MONTHS_EMPTY") return <p>{comparisonText(comparison)}</p>;
  return <>
    <p className={difference < 0 ? styles.decrease : difference > 0 ? styles.increase : styles.neutral}>
      <strong className={styles.number} tabIndex={0}><span aria-hidden="true">{difference < 0 ? "↓ " : difference > 0 ? "↑ " : ""}</span>{formatSignedYen(difference)}</strong>{" "}
      <span>{difference < 0 ? "減少" : difference > 0 ? "増加" : "変化なし"}</span>{" "}
      <span className={styles.number}>（{percentageChange === null ? "割合 —" : `${difference > 0 ? "+" : ""}${percentageChange}%`}）</span>
    </p>
    <small>{comparisonState === "NO_PREVIOUS_DATA" ? "前月の支出なし · " : ""}
      {analyticsMonthLabel(previousMonth!)} <span className={styles.number}>{formatYen(previousTotalExpense!)}</span></small>
  </>;
}

function MemberBalance({ balance }: { balance: number }) {
  return <div className={styles.balance} data-direction={balance > 0 ? "receivable" : balance < 0 ? "payable" : "neutral"}>
    <strong>{formatSignedYen(balance)}</strong>
    <small>{balance > 0 ? "受け取る" : balance < 0 ? "支払う" : "差額なし"}</small>
  </div>;
}

export function AnalyticsSummary({ analytics, month, onRetry }: Props) {
  const data = analytics.data;
  return <section className={styles.summary} aria-label={`${analyticsMonthLabel(month)}の支出概要`}>
    <AnalyticsNotice analytics={analytics} onRetry={onRetry} />
    {data ? <>
      <div className={styles.summaryFigures}>
        <div className={styles.total} tabIndex={0}>
          <span>{analyticsMonthLabel(month)}の支出総額</span>
          <strong>{formatYen(data.totalExpense)}</strong>
          <span>支出件数 {data.expenseCount}件 · JPY</span>
        </div>
        <div className={styles.comparison}><span>前月比</span><Comparison comparison={data.previousMonthComparison} />
        </div>
        <Average data={data} />
      </div>
      {data.expenseCount === 0 ? <p>この月の支出はありません</p> : null}
    </> : <p>選択月の支出総額・件数・前月比・平均負担は未確認です。</p>}
    <details className={styles.metricNotes}>
      <summary>集計・参考値について</summary>
      <p>平均は、この月の保存済み参加者の重複を除いた人数を母数とします（非アクティブ・負担0円を含む／支払いのみは除外）。個人の実際の負担額・精算額ではありません。</p>
      <p>現在月は、この月に記録された支出すべてを含みます（月内の未来日付を含む）。前月比は前の暦月全体の記録済み支出と比較しています。</p>
    </details>
  </section>;
}

function CategoryChart({ data }: { data: ProjectMonthlyAnalyticsResponse }) {
  let cursor = 0;
  const stops = data.categoryBreakdown.map((item, index) => {
    const start = cursor;
    cursor += data.totalExpense > 0 ? item.totalExpense / data.totalExpense * 100 : 0;
    return `var(--analytics-category-${index}) ${start}% ${cursor}%`;
  });
  return <div className={styles.categoryChart}>
    <div className={styles.donut} aria-hidden="true"
      style={stops.length ? { background: `conic-gradient(${stops.join(",")})` } : undefined}>
      <div><strong>{formatYen(data.totalExpense)}</strong><span>{data.expenseCount}件</span></div>
    </div>
    {data.categoryBreakdown.length ? <ul className={styles.legend} aria-label="カテゴリ別支出の正確な値" tabIndex={0}>
      {data.categoryBreakdown.map((item, index) => <li key={item.category ?? "null"}>
        <span className={styles.swatch} aria-hidden="true" style={{ background: `var(--analytics-category-${index})` }} />
        <span>{item.category === null ? "未分類" : expenseCategoryLabels[item.category]}</span>
        <strong>{formatYen(item.totalExpense)}</strong><span>{item.expenseCount}件</span>
      </li>)}
    </ul> : <p>カテゴリ別支出はありません。</p>}
  </div>;
}

export function AnalyticsAnalysis({ analytics, month, children, settlement, explanationOpen = false }: Omit<Props, "onRetry"> & {
  children: ReactNode; settlement?: ReactNode; explanationOpen?: boolean;
}) {
  const data = analytics.data;
  const max = data ? Math.max(...data.monthlyTrend.items.map((item) => item.totalExpense), 1) : 1;
  return <div className={styles.layout}>
    <div className={`${styles.overviewGrid} ${settlement && !explanationOpen ? styles.paired : ""}`}>
    {settlement}
    <section className={styles.analysis} aria-labelledby="continuous-analysis-title">
    <h2 id="continuous-analysis-title">支出の分析 · {analyticsMonthLabel(month)}</h2>
    {analytics.retained ? <p className={styles.notice}>以前に取得した分析データを表示しています。</p> : null}
    {data ? <>
      <div className={styles.charts}>
        <CollapsibleCard title="カテゴリ別の支出内訳" expandOnDesktop>
          <CategoryChart data={data} />
        </CollapsibleCard>
        <CollapsibleCard title="月別の支出推移" defaultOpen={false} expandOnDesktop>
          <p className={styles.period}>{analyticsMonthLabel(data.monthlyTrend.startMonth)}〜{analyticsMonthLabel(data.monthlyTrend.endMonth)}（複数月）</p>
          <div className={styles.bars} aria-hidden="true">
            {data.monthlyTrend.items.map((item) => <div key={item.month} className={styles.column}>
              <span className={styles.bar} style={{ height: `${item.totalExpense / max * 100}%` }} />
              <span>{Number(item.month.slice(5))}月</span>
            </div>)}
          </div>
          <div className={styles.tableScroll} role="region" aria-label="月別の支出推移の値" tabIndex={0}><table className={styles.table}>
            <caption>月別の支出推移の正確な値</caption>
            <thead><tr><th scope="col">年月</th><th scope="col">支出総額</th><th scope="col">件数</th></tr></thead>
            <tbody>{data.monthlyTrend.items.map((item) => <tr key={item.month}>
              <th scope="row">{analyticsMonthLabel(item.month)}</th><td>{formatYen(item.totalExpense)}</td><td>{item.expenseCount}件</td>
            </tr>)}</tbody>
          </table></div>
        </CollapsibleCard>
      </div>
    </> : <p className={styles.notice}>分析データは現在表示できません。</p>}
    </section>
    </div>
    <div className={styles.membersAndExpenses}>
      {data ? <CollapsibleCard title="メンバー別の集計" defaultOpen={false} expandOnDesktop>
        <p className={styles.period}>差額は保存された支出の支払額 − 負担額です。実際の送金後の未払額ではありません。</p>
        {data.members.length ? <>
        <div className={`${styles.tableScroll} ${styles.desktopMembers}`} role="region" aria-label="メンバー別集計の値" tabIndex={0}><table className={`${styles.table} ${styles.memberTable}`}>
          <caption>{analyticsMonthLabel(month)}のメンバー別集計</caption>
          <thead><tr><th scope="col">メンバー</th><th scope="col">支払額</th><th scope="col">負担額</th><th scope="col">差額</th></tr></thead>
          <tbody>{data.members.map((member) => <tr key={member.memberId}>
            <th scope="row">{member.name}{!member.active ? <small>（非アクティブ）</small> : null}</th>
            <td>{formatYen(member.paidAmount)}</td>
            <td>{formatYen(member.burdenAmount)}</td>
            <td><MemberBalance balance={member.exactBalance} /></td>
          </tr>)}</tbody>
        </table></div>
        <ul className={styles.mobileMembers} aria-label={`${analyticsMonthLabel(month)}のメンバー別集計`}>
          {data.members.map((member) => <li key={member.memberId}>
            <h4>{member.name}{!member.active ? <small>（非アクティブ）</small> : null}</h4>
            <dl tabIndex={0} aria-label={`${member.name}の支払額・負担額・差額`}>
              <div><dt>支払額</dt><dd>{formatYen(member.paidAmount)}</dd></div>
              <div><dt>負担額</dt><dd>{formatYen(member.burdenAmount)}</dd></div>
              <div><dt>差額</dt><dd><MemberBalance balance={member.exactBalance} /></dd></div>
            </dl>
          </li>)}
        </ul>
        </> : <p>この月に支出の参照があるメンバーはいません。</p>}
      </CollapsibleCard> : null}
      <div className={styles.expenses}>{children}</div>
    </div>
  </div>;
}
