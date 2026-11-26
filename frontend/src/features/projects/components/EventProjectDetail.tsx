import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../../api/client";
import type { CreateExpenseRequest, UpdateExpenseRequest } from "../../../api/expenseApi";
import {
  SETTLEMENT_STRATEGY_LABELS,
  type SettlementResponse,
  type SettlementStrategy,
} from "../../../api/settlementApi";
import { AddExpenseModal } from "../../expenses/components/AddExpenseModal";
import { ExpenseDetailDialog } from "../../expenses/components/ExpenseDetailDialog";
import type { ExpenseNotFoundState } from "../../expenses/expenseQueries";
import type { EventProjectDetail as EventData, ProjectExpenseItem } from "../../../types/project";
import { formatSignedYen, formatYen } from "../../../utils/formatMoney";
import {
  SettlementSourceChangedError,
  type SettlementComparison as Comparison,
} from "../../settlements/settlementQueries";
import { ProjectDetailHeader } from "./ProjectDetailHeader";
import { ProjectExpenseList } from "./ProjectExpenseList";
import { SettlementComparison } from "./SettlementComparison";
import { SettlementCompletionDialog } from "./SettlementCompletionDialog";
import { SettlementExplanation } from "./SettlementExplanation";
import { SettlementStrategySelector } from "./SettlementStrategySelector";
import styles from "./EventProjectDetail.module.css";

type Props = {
  quickAddRequestId?: string;
  onQuickAddHandled?: () => void;
  detail: EventData;
  settlementStrategy?: SettlementStrategy;
  onSettlementStrategyChange?: (strategy: SettlementStrategy) => void;
  settlementResponse?: SettlementResponse;
  comparison?: Comparison;
  comparisonStatus?: "loading" | "error" | "ready";
  comparisonError?: unknown;
  onRetryComparison?: () => void;
  settlementStatus?: "loading" | "error" | "ready";
  settlementError?: unknown;
  onRetrySettlement?: () => void;
  expenseSafetyBlocked?: boolean;
  onCreateExpense?: (request: CreateExpenseRequest) => Promise<void>;
  onUpdateExpense?: (expenseId: string, request: UpdateExpenseRequest) => Promise<void>;
  onDeleteExpense?: (expenseId: string) => Promise<void>;
  onRecoverExpense?: (expenseId: string) => Promise<"found" | "deleted">;
  onExpenseConflict?: (expenseId: string) => void;
  blockedExpenseIds?: ReadonlySet<string>;
  notFoundStates?: Readonly<Record<string, ExpenseNotFoundState>>;
  onExpenseDialogClose?: (expenseId: string) => void;
  expenseListReady?: boolean;
  onArchive?: () => Promise<void>;
  onAddMember?: (name: string) => Promise<void>;
  onRenameMember?: (memberId: string, name: string) => Promise<void>;
};

function settlementErrorDescription(error: unknown): string {
  if (error instanceof SettlementSourceChangedError) {
    return "支出と精算結果を同じ状態として確認できませんでした。再試行してください。";
  }
  if (error instanceof ApiError) {
    switch (error.code) {
      case "SETTLEMENT_RUN_UNAVAILABLE": return "このイベントの現在の精算結果はありません。";
      case "SETTLEMENT_CALCULATION_INVALID": return "精算結果を表示できません。";
      case "PROJECT_NOT_FOUND": return "プロジェクトが見つかりません。";
      case "SETTLEMENT_SCOPE_UNSUPPORTED": return "このプロジェクトではイベント精算を利用できません。";
      default: break;
    }
  }
  return "通信状況を確認して、もう一度お試しください。";
}

function comparisonErrorDescription(error: unknown): string {
  if (error instanceof SettlementSourceChangedError) {
    return "同じ支出状態の結果と確認できませんでした。再取得してください。";
  }
  if (error instanceof ApiError && error.code === "SETTLEMENT_RUN_UNAVAILABLE") {
    return "もう一方の方式の結果がないため、このアーカイブ済みイベントは比較できません。";
  }
  return "比較結果を取得できませんでした。通信状況を確認して再試行してください。";
}

export function EventProjectDetail({
  quickAddRequestId,
  onQuickAddHandled,
  detail, settlementStrategy, onSettlementStrategyChange, settlementResponse,
  comparison, comparisonStatus, comparisonError, onRetryComparison, settlementStatus,
  settlementError, onRetrySettlement, expenseSafetyBlocked = false, onCreateExpense, onUpdateExpense,
  onDeleteExpense, onRecoverExpense, onExpenseConflict, blockedExpenseIds, notFoundStates,
  onExpenseDialogClose, expenseListReady = false, onArchive, onAddMember, onRenameMember,
}: Props) {
  const archived = detail.status === "ARCHIVED";
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<ProjectExpenseItem | null>(null);
  const openedRequest = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!quickAddRequestId || openedRequest.current === quickAddRequestId || archived || !onCreateExpense) return;
    openedRequest.current = quickAddRequestId;
    setArchiving(false);
    setSelectedExpense(null);
    setAdding(true);
    onQuickAddHandled?.();
  }, [quickAddRequestId, archived, onCreateExpense, onQuickAddHandled]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [explanationRunId, setExplanationRunId] = useState<string | null>(null);
  const comparisonId = useId();
  const explanationId = useId();
  const explanationOpen = Boolean(settlementResponse && explanationRunId === settlementResponse.runId);
  const comparisonReady = Boolean(
    comparison
    && settlementResponse
    && settlementStrategy
    && comparison[settlementStrategy].runId === settlementResponse.runId,
  );
  const strategyCounts: Partial<Record<SettlementStrategy, number>> = comparisonReady && comparison
    ? {
      FEWER_TRANSFERS: comparison.FEWER_TRANSFERS.transfers.length,
      UNDERSTANDABLE: comparison.UNDERSTANDABLE.transfers.length,
    }
    : settlementStrategy && settlementResponse
      ? { [settlementStrategy]: settlementResponse.transfers.length }
      : {};
  const currentExpense = selectedExpense
    ? detail.expenses.find((expense) => expense.id === selectedExpense.id) ?? selectedExpense
    : null;
  const selectedExpenseMissing = Boolean(selectedExpense && expenseListReady
    && !detail.expenses.some((expense) => expense.id === selectedExpense.id));

  return (
    <div className={[styles.page, archived ? "" : styles.hasAction].filter(Boolean).join(" ")}>
      <ProjectDetailHeader
        name={detail.name} type={detail.type} description={detail.description}
        dateLabel={detail.dateLabel} members={detail.members}
        totalExpenseYen={detail.kpi.totalExpenseYen} expenseCount={detail.kpi.expenseCount}
        archived={archived}
        onAddExpense={archived ? undefined : () => { setArchiving(false); setAdding(true); }}
        onAddMember={onAddMember} onRenameMember={onRenameMember}
      />
      {archived ? <p className={styles.archivedNotice} role="note">
        このイベントはアーカイブ済みです。支出の追加・編集・削除はできません。振込状況はアーカイブとは別に表示しています。
      </p> : null}
      <div className={styles.layout}>
        <div className={styles.rightColumn}>
        <section className={styles.settlement} aria-labelledby="event-settlement-title">
          <div className={styles.sectionHeading}>
            <h2 id="event-settlement-title">精算結果</h2>
            <p>誰から誰へ、いくら支払うか</p>
          </div>
          {settlementStrategy && onSettlementStrategyChange ? (
            <SettlementStrategySelector name="event-settlement-strategy" value={settlementStrategy}
              onChange={onSettlementStrategyChange} counts={strategyCounts} />
          ) : <p className={styles.strategyLabel}>{SETTLEMENT_STRATEGY_LABELS.FEWER_TRANSFERS}</p>}
          {settlementStatus === "loading" ? (
            <p className={styles.empty}>精算結果を読み込んでいます。</p>
          ) : settlementStatus === "error" ? (
            <div role="alert" className={styles.error}>
              <p>{expenseSafetyBlocked
                ? "支出の状態確認が必要です。対象の支出を開いて「最新の支出内容を確認」を完了するまで、精算結果は表示しません。"
                : settlementErrorDescription(settlementError)}</p>
              {!expenseSafetyBlocked && onRetrySettlement ? <button type="button" className={styles.retry} onClick={onRetrySettlement}>再試行</button> : null}
            </div>
          ) : comparisonOpen && comparisonReady ? (
            null
          ) : detail.settlementTransfers.length ? (
            <div className={styles.result}>
              <h3>送金の内訳 <span>（送金回数 {detail.settlementTransfers.length}件）</span></h3>
              <ul className={styles.transferList}>
              {detail.settlementTransfers.map((transfer) => (
                <li key={transfer.id} className={styles.transferRow}>
                  <span className={styles.transferParties}>
                    <strong>{transfer.fromMemberName}</strong><span> から </span><strong>{transfer.toMemberName}</strong><span> へ</span>
                  </span>
                  <strong className={styles.amount}>{formatYen(transfer.amountYen)}</strong>
                  <span className={styles.transferStatus}>{transfer.completed ? "完了" : "未精算"}</span>
                </li>
              ))}
              </ul>
            </div>
          ) : <p className={styles.empty}>精算が必要な取引はありません。</p>}
          {settlementStatus !== "loading" && settlementStatus !== "error" ? (
            <div className={styles.settlementActions}>
              <button type="button" className={styles.disclosure} aria-expanded={comparisonOpen}
                aria-controls={comparisonId} onClick={() => setComparisonOpen((open) => !open)}>
                {comparisonOpen ? "比較を閉じる" : "2方式を比較"}
              </button>
              {settlementResponse ? (
                <button type="button" className={styles.disclosure} aria-expanded={explanationOpen}
                  aria-controls={explanationId}
                  onClick={() => setExplanationRunId(explanationOpen ? null : settlementResponse.runId)}>
                  {explanationOpen ? "計算過程を閉じる" : "計算過程を見る"}
                </button>
              ) : null}
            </div>
          ) : null}
          <div id={comparisonId}>
            {comparisonOpen && !expenseSafetyBlocked ? <h3 className={styles.comparisonHeading}>2方式の比較</h3> : null}
            {comparisonOpen && !expenseSafetyBlocked && comparisonReady && comparison && settlementStrategy ? (
              <SettlementComparison comparison={comparison} selectedStrategy={settlementStrategy} members={detail.members} />
            ) : comparisonOpen && !expenseSafetyBlocked ? (
              comparisonStatus === "loading" ? (
                <p className={styles.empty}>同じ支出状態の比較結果を確認しています。</p>
              ) : comparisonStatus === "error" ? (
                <div role="alert" className={styles.error}>
                  <p>{comparisonErrorDescription(comparisonError)}</p>
                  {onRetryComparison ? <button type="button" className={styles.retry} onClick={onRetryComparison}>比較を再試行</button> : null}
                </div>
              ) : (
                <p className={styles.empty}>このデモでは、もう一方の方式の結果を表示できません。</p>
              )
            ) : null}
          </div>
          <p className={styles.transferNote}>振込はアプリ外で行います。表示された状態は送金の実行を意味しません。</p>
        </section>
        <div id={explanationId} hidden={!explanationOpen}>
          {explanationOpen && settlementResponse ? (
            <SettlementExplanation result={settlementResponse} members={detail.members} />
          ) : null}
        </div>
        {!archived ? (
          <section className={`${styles.management} ${styles.desktopManagement}`} aria-labelledby="event-management-desktop-title">
            <h2 id="event-management-desktop-title">イベントの管理</h2>
            <p>イベントをアーカイブすると、閲覧のみになります。振込状況は変更されません。</p>
            <button type="button" className={styles.archiveButton} aria-haspopup="dialog"
              onClick={() => { setAdding(false); setArchiving(true); }}>イベントをアーカイブ</button>
            {!onArchive ? <p className={styles.demoNote}>デモ表示のため保存されません。</p> : null}
          </section>
        ) : null}
        </div>
        <div className={styles.leftColumn}>
        <div className={styles.expenses}>
          <ProjectExpenseList id="event-expense-list-title" expenses={detail.expenses}
            members={detail.members} onSelect={(id) => setSelectedExpense(detail.expenses.find((expense) => expense.id === id) ?? null)} />
        </div>
        <section className={styles.balances} aria-labelledby="event-balance-title">
          <div className={styles.sectionHeading}><h2 id="event-balance-title">メンバー収支</h2></div>
          {settlementStatus === "loading" ? (
            <p className={styles.empty}>メンバー収支を読み込んでいます。</p>
          ) : settlementStatus === "error" ? (
            <p className={styles.empty}>メンバー収支を表示できません。</p>
          ) : detail.memberBalances.length ? (
            <ul className={styles.balanceList}>
              {detail.memberBalances.map((member) => (
                <li key={member.id} className={styles.balanceRow}>
                  <strong className={styles.balanceName}>{member.name}</strong>
                  <span className={styles.balanceDetail}>支払 {formatYen(member.paidYen)} · 負担 {formatYen(member.burdenYen)}</span>
                  <span className={styles.balanceValue}>
                    {member.balanceYen > 0 ? "受け取る " : member.balanceYen < 0 ? "支払う " : "差額なし "}
                    <strong>{formatSignedYen(member.balanceYen)}</strong>
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className={styles.empty}>収支データはまだありません。</p>}
        </section>
        </div>
        {!archived ? (
          <section className={`${styles.management} ${styles.mobileManagement}`} aria-labelledby="event-management-mobile-title">
            <h2 id="event-management-mobile-title">イベントの管理</h2>
            <p>イベントをアーカイブすると、閲覧のみになります。振込状況は変更されません。</p>
            <button type="button" className={styles.archiveButton} aria-haspopup="dialog"
              onClick={() => { setAdding(false); setArchiving(true); }}>イベントをアーカイブ</button>
            {!onArchive ? <p className={styles.demoNote}>デモ表示のため保存されません。</p> : null}
          </section>
        ) : null}
      </div>
      {!archived && adding ? (
        <AddExpenseModal projectName={detail.name} currencyLabel={detail.currencyLabel} members={detail.members}
          onSubmit={onCreateExpense} onClose={() => setAdding(false)} />
      ) : null}
      {!archived && archiving ? (
        <SettlementCompletionDialog projectName={detail.name} settlementTransfers={detail.settlementTransfers}
          onConfirm={onArchive} onClose={() => setArchiving(false)} />
      ) : null}
      {currentExpense ? (
        <ExpenseDetailDialog projectName={detail.name} expense={currentExpense} members={detail.members}
          onUpdate={!archived && onUpdateExpense ? (request) => onUpdateExpense(currentExpense.id, request) : undefined}
          onDelete={!archived && onDeleteExpense ? () => onDeleteExpense(currentExpense.id) : undefined}
          onRecover={onRecoverExpense ? () => onRecoverExpense(currentExpense.id) : undefined}
          onConflict={onExpenseConflict ? () => onExpenseConflict(currentExpense.id) : undefined}
          recoveryRequired={blockedExpenseIds?.has(currentExpense.id)}
          notFoundState={notFoundStates?.[currentExpense.id]}
          missing={selectedExpenseMissing}
          focusFallbackId="event-expense-list-title"
          onClose={() => {
            onExpenseDialogClose?.(currentExpense.id);
            setSelectedExpense(null);
          }} />
      ) : null}
    </div>
  );
}
