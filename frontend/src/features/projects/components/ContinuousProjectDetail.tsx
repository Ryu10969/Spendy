import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CreateExpenseRequest, UpdateExpenseRequest } from "../../../api/expenseApi";
import type { SettlementResponse, SettlementStrategy } from "../../../api/settlementApi";
import type { AnalyticsPresentation } from "../../analytics/analyticsPresentation";
import { AnalyticsAnalysis, AnalyticsSummary } from "../../analytics/ProjectAnalytics";
import { AddExpenseModal } from "../../expenses/components/AddExpenseModal";
import { ExpenseDetailDialog } from "../../expenses/components/ExpenseDetailDialog";
import type { ExpenseNotFoundState } from "../../expenses/expenseQueries";
import type { ContinuousProjectDetail as ContinuousData, ProjectExpenseItem } from "../../../types/project";
import { continuousExpenseDate, currentMonth, nextMonth, previousMonth } from "../monthSelection";
import { formatSignedYen, formatYen } from "../../../utils/formatMoney";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { ProjectExpenseList } from "./ProjectExpenseList";
import { SettlementStrategySelector } from "./SettlementStrategySelector";
import { SettlementExplanation } from "./SettlementExplanation";
import { CollapsibleCard } from "./CollapsibleCard";
import styles from "./ContinuousProjectDetail.module.css";

type Props = {
  quickAddRequestId?: string;
  onQuickAddHandled?: () => void;
  detail: ContinuousData;
  selectedMonth?: string;
  onMonthChange?: (month: string) => void;
  analytics?: AnalyticsPresentation;
  onRetryAnalytics?: () => void;
  settlementStrategy?: SettlementStrategy;
  onSettlementStrategyChange?: (strategy: SettlementStrategy) => void;
  settlementStatus?: "loading" | "error" | "ready";
  onRetrySettlement?: () => void;
  settlementResponse?: SettlementResponse;
  expenseStatus?: "loading" | "error" | "ready";
  onRetryExpenses?: () => void;
  archived?: boolean;
  onCreateExpense?: (request: CreateExpenseRequest) => Promise<void>;
  onUpdateExpense?: (expenseId: string, request: UpdateExpenseRequest) => Promise<void>;
  onDeleteExpense?: (expenseId: string) => Promise<void>;
  onRecoverExpense?: (expenseId: string) => Promise<"found" | "deleted">;
  onExpenseConflict?: (expenseId: string) => void;
  blockedExpenseIds?: ReadonlySet<string>;
  notFoundStates?: Readonly<Record<string, ExpenseNotFoundState>>;
  onExpenseDialogClose?: (expenseId: string) => void;
  expenseListReady?: boolean;
  onAddMember?: (name: string) => Promise<void>;
  onRenameMember?: (memberId: string, name: string) => Promise<void>;
};

export function ContinuousProjectDetail({
  quickAddRequestId,
  onQuickAddHandled,
  detail, selectedMonth, onMonthChange, settlementStrategy, onSettlementStrategyChange,
  analytics, onRetryAnalytics, settlementStatus, onRetrySettlement, settlementResponse,
  expenseStatus = "ready", onRetryExpenses,
  archived = false, onCreateExpense, onUpdateExpense, onDeleteExpense,
  onRecoverExpense, onExpenseConflict, blockedExpenseIds, notFoundStates,
  onExpenseDialogClose, expenseListReady = false, onAddMember, onRenameMember,
}: Props) {
  const [adding, setAdding] = useState(false);
  const openedRequest = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!quickAddRequestId || openedRequest.current === quickAddRequestId || archived || !onCreateExpense) return;
    openedRequest.current = quickAddRequestId;
    setAdding(true);
    onQuickAddHandled?.();
  }, [quickAddRequestId, archived, onCreateExpense, onQuickAddHandled]);
  const [selectedExpense, setSelectedExpense] = useState<ProjectExpenseItem | null>(null);
  const currentExpense = selectedExpense
    ? detail.expenses.find((expense) => expense.id === selectedExpense.id) ?? selectedExpense
    : null;
  const selectedExpenseMissing = Boolean(selectedExpense && expenseListReady
    && !detail.expenses.some((expense) => expense.id === selectedExpense.id));
  const [year, month] = selectedMonth?.split("-").map(Number) ?? [];
  const previous = selectedMonth ? previousMonth(selectedMonth) : null;
  const next = selectedMonth ? nextMonth(selectedMonth, currentMonth()) : null;
  const [explanationContext, setExplanationContext] = useState<string | null>(null);
  const explanationId = useId();
  const explanationTrigger = useRef<HTMLButtonElement>(null);
  const explanationHadFocus = useRef(false);
  const expenseHistory = useRef<HTMLDivElement>(null);
  const context = selectedMonth && settlementStatus === "ready" && settlementResponse
    ? `${selectedMonth}:${settlementStrategy}:${settlementResponse.runId}` : null;
  const explanationOpen = context !== null && explanationContext === context;
  useEffect(() => {
    setExplanationContext(null);
  }, [context]);
  useLayoutEffect(() => {
    if (explanationOpen || !explanationHadFocus.current) return;
    // Focus events remember ownership before conditional children are removed.
    explanationHadFocus.current = false;
    const trigger = explanationTrigger.current;
    const target = trigger && !trigger.disabled && trigger.getAttribute("aria-disabled") !== "true"
      && trigger.getClientRects().length ? trigger : expenseHistory.current;
    if (target?.getClientRects().length) target.focus();
  }, [context, explanationOpen]);
  const history = <div ref={expenseHistory} className={styles.history} role="region" aria-label="選択月の支出履歴" tabIndex={0}>
    {expenseStatus === "loading" ? <p role="status">選択した月の支出履歴を読み込んでいます。</p>
      : expenseStatus === "error" ? <div role="alert" className={styles.error}>
        <p>支出履歴を読み込めませんでした。</p><button type="button" onClick={onRetryExpenses}>再試行</button>
      </div> : <ProjectExpenseList id="continuous-expense-list-title" expenses={detail.expenses}
        members={detail.members} adaptToWidth onSelect={(id) => setSelectedExpense(detail.expenses.find((expense) => expense.id === id) ?? null)} />}
  </div>;
  const settlement = selectedMonth ? <section className={`${styles.settlement} ${explanationOpen ? styles.settlementExpanded : ""}`} aria-labelledby="continuous-settlement-title">
        <h2 id="continuous-settlement-title">{year}年{month}月の精算結果</h2>
        <CollapsibleCard title="精算結果" expandOnDesktop>
        <div className={styles.settlementBody}>
        <div>
        <p className={styles.monthNote}>送金回数 {settlementStatus === "ready" ? detail.kpi.settlementTransactionCount : "—"}件</p>
        {settlementStrategy && onSettlementStrategyChange ? (
          <SettlementStrategySelector name="continuous-settlement-strategy"
            value={settlementStrategy} onChange={onSettlementStrategyChange} />
        ) : null}
        {settlementStatus === "loading" ? <p role="status" className={styles.empty}>精算結果を読み込んでいます。</p>
          : settlementStatus === "error" ? <div role="alert" className={styles.error}>
            <p>精算結果を確認できませんでした。</p>
            {onRetrySettlement ? <button type="button" onClick={onRetrySettlement}>再試行</button> : null}
          </div>
          : detail.settlementTransfers.length ? <ul className={`${styles.list} ${styles.transfers}`} tabIndex={0} aria-label="精算結果の送金案">
            {detail.settlementTransfers.map((transfer) => {
              const completedAt = settlementResponse?.transfers.find((item) => item.id === transfer.id)?.completedAt;
              return <li key={transfer.id}>
              <span>{transfer.fromMemberName} から {transfer.toMemberName} へ</span>
              <strong>{formatYen(transfer.amountYen)}</strong>
              {transfer.completed ? <span className={styles.completionRecord}>送金完了（記録済み）
                {completedAt ? <> · <time dateTime={completedAt}>{completedAt}</time></> : null}
              </span> : null}
            </li>;
            })}
          </ul> : <p className={styles.empty}>精算が必要な取引はありません。</p>}
        </div>
        {settlementStatus === "ready" && detail.memberBalances.length && (explanationOpen || !analytics?.data) ? <div className={styles.settlementBalances}
          role="region" aria-label="精算結果のメンバー別収支" tabIndex={0}>
          <h3>保存された支出の負担額と差額</h3>
          <ul className={styles.balanceCards}>{detail.memberBalances.map((balance) => <li key={balance.id}>
            <h4>{balance.name}</h4>
            <dl>
              <div><dt>支払額</dt><dd>{formatYen(balance.paidYen)}</dd></div>
              <div><dt>負担額</dt><dd>{formatYen(balance.burdenYen)}</dd></div>
              <div className={styles.difference}><dt>差額</dt>
                <dd data-balance={Math.sign(balance.balanceYen)}><strong>{formatSignedYen(balance.balanceYen)}</strong>
                  <span>{balance.balanceYen > 0 ? "受け取る" : balance.balanceYen < 0 ? "支払う" : "差額なし"}</span>
                </dd>
              </div>
            </dl>
          </li>)}</ul>
        </div> : null}
        </div>
        <p className={styles.monthNote}>選択月の計算結果です。実際の送金完了を意味しません。</p>
        <button ref={explanationTrigger} type="button" className={styles.disclosure}
          aria-expanded={explanationOpen} aria-controls={explanationId} aria-disabled={!context}
          onClick={() => context && setExplanationContext(explanationOpen ? null : context)}>
          {explanationOpen ? "計算過程を閉じる" : "計算過程を見る"}
        </button>
        <div id={explanationId} hidden={!explanationOpen} className={styles.explanationLayout}
          onFocusCapture={() => { explanationHadFocus.current = true; }}
          onBlurCapture={(event) => {
            explanationHadFocus.current = event.currentTarget.contains(event.relatedTarget as Node | null);
          }}
          role="region" aria-label="選択月の精算計算過程" tabIndex={0}>
          {explanationOpen && settlementResponse ? <SettlementExplanation result={settlementResponse} members={detail.members} showBalanceColors /> : null}
        </div>
        </CollapsibleCard>
      </section> : null;
  return (
    <div className={styles.page}>
      <ProjectDetailHeader name={detail.name} type={detail.type} description={detail.description}
        members={detail.members} totalExpenseYen={detail.kpi.totalExpenseYen}
        summaryLabel={selectedMonth ? `${year}年${month}月の合計支出` : undefined}
        summary={analytics && selectedMonth ? <AnalyticsSummary analytics={analytics} month={selectedMonth}
          onRetry={onRetryAnalytics ?? (() => {})} /> : undefined}
        summaryControls={selectedMonth && onMonthChange ? (
          <div><nav className={styles.monthNavigation} aria-label="支出・分析・精算の対象月">
            <button type="button" disabled={!previous}
              onClick={() => previous && onMonthChange(previous)}>← 前の月</button>
            <strong aria-live="polite">{year}年{month}月</strong>
            <button type="button" disabled={!next}
              onClick={() => next && onMonthChange(next)}>次の月 →</button>
          </nav>
          {selectedMonth === currentMonth() ? <p className={styles.monthNote}>
            <strong>進行中</strong>{analytics ? null : " · この月に記録された支出すべてを含みます（月内の未来日付を含む）。"}
          </p> : null}</div>
        ) : undefined}
        expenseCount={detail.kpi.expenseCount} archived={archived}
        onAddExpense={archived ? undefined : () => setAdding(true)}
        onAddMember={onAddMember} onRenameMember={onRenameMember} />
      {analytics && selectedMonth ? <AnalyticsAnalysis analytics={analytics} month={selectedMonth}
        settlement={settlement} explanationOpen={explanationOpen}>{history}</AnalyticsAnalysis> : <>{settlement}{history}</>}
      {!archived && adding ? <AddExpenseModal projectName={detail.name} currencyLabel={detail.currencyLabel} members={detail.members}
        initialDate={selectedMonth ? continuousExpenseDate(selectedMonth) : undefined}
        onSubmit={onCreateExpense} onClose={() => setAdding(false)} /> : null}
      {currentExpense ? <ExpenseDetailDialog projectName={detail.name} expense={currentExpense} members={detail.members} useChoiceCards
        onUpdate={onUpdateExpense ? async (request) => {
          await onUpdateExpense(currentExpense.id, request);
          if (selectedMonth && !request.paidOn.startsWith(`${selectedMonth}-`)) {
            setSelectedExpense(null);
            window.requestAnimationFrame(() =>
              document.getElementById("continuous-expense-list-title")?.focus());
          }
        } : undefined}
        onDelete={onDeleteExpense ? () => onDeleteExpense(currentExpense.id) : undefined}
        onRecover={onRecoverExpense ? () => onRecoverExpense(currentExpense.id) : undefined}
        onConflict={onExpenseConflict ? () => onExpenseConflict(currentExpense.id) : undefined}
        recoveryRequired={blockedExpenseIds?.has(currentExpense.id)}
        notFoundState={notFoundStates?.[currentExpense.id]}
        missing={selectedExpenseMissing}
        focusFallbackId="continuous-expense-list-title"
        onClose={() => {
          onExpenseDialogClose?.(currentExpense.id);
          setSelectedExpense(null);
        }} /> : null}
    </div>
  );
}
