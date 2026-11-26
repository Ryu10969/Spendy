import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import type {
  CreateExpenseRequest,
  ExpenseListResponse,
  UpdateExpenseRequest,
} from "../../api/expenseApi";
import { getSettlement, type SettlementResponse, type SettlementStrategy } from "../../api/settlementApi";
import { EmptyState } from "../../components/common/EmptyState";
import {
  expenseKeys,
  setExpenseNotFoundState,
  useCreateExpenseMutation,
  useDeleteExpenseMutation,
  useExpenseConflictIds,
  useExpenseNotFoundStates,
  type ExpenseNotFoundState,
  useExpensesQuery,
  useUpdateExpenseMutation,
} from "../../features/expenses/expenseQueries";
import { ContinuousProjectDetail } from "../../features/projects/components/ContinuousProjectDetail";
import { EventProjectDetail } from "../../features/projects/components/EventProjectDetail";
import { toProjectDetail, withEventSettlement } from "../../features/projects/projectDetailAdapter";
import { currentMonth } from "../../features/projects/monthSelection";
import { useQuickAddExpense } from "../../features/projects/useQuickAddExpense";
import { useProjectAnalyticsQuery } from "../../features/analytics/analyticsQueries";
import { useArchiveProjectMutation, useProjectMemberMutations, useProjectQuery } from "../../features/projects/projectQueries";
import {
  getSettlementComparison,
  settlementKeys,
  SettlementSourceChangedError,
  useSettlementComparisonQuery,
  useSettlementQuery,
} from "../../features/settlements/settlementQueries";
import {
  sameSettlementFingerprint,
  sameSettlementSource,
} from "../../features/settlements/settlementSource";
import { getContinuousProjectDetail } from "../../mocks/fixtures/continuousProjectDetails";
import { getEventProjectDetail } from "../../mocks/fixtures/eventProjectDetails";
import { getSettlementFixture } from "../../mocks/fixtures/settlementResponses";
import styles from "./ProjectDetailPage.module.css";

function isExpectedArchivedUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
    && error.code === "SETTLEMENT_RUN_UNAVAILABLE";
}

function isValidSettlementResponse(
  value: SettlementResponse,
  strategy: SettlementStrategy,
): boolean {
  const isInteger = (amount: unknown) => typeof amount === "number" && Number.isSafeInteger(amount);
  return Boolean(value && typeof value.runId === "string" && value.runId
    && typeof value.sourceStateFingerprint === "string" && value.sourceStateFingerprint
    && value.scopeType === "PROJECT" && value.strategy === strategy
    && value.state === "CURRENT" && typeof value.generatedAt === "string"
    && Array.isArray(value.balances) && value.balances.every((balance) =>
      balance && typeof balance.memberId === "string"
      && isInteger(balance.paidAmount) && isInteger(balance.burdenAmount)
      && isInteger(balance.exactBalance) && isInteger(balance.roundedTransferNet)
      && isInteger(balance.roundingDifference))
    && Array.isArray(value.transfers) && value.transfers.every((transfer) =>
      transfer && typeof transfer.id === "string" && isInteger(transfer.transferOrder)
      && typeof transfer.fromMemberId === "string"
      && typeof transfer.toMemberId === "string"
      && isInteger(transfer.exactAmount) && isInteger(transfer.initiallyRoundedAmount)
      && isInteger(transfer.finalRoundedAmount) && isInteger(transfer.roundingAdjustment)
      && (transfer.status === "OUTSTANDING" || transfer.status === "COMPLETED")
      && (transfer.completedAt === null || typeof transfer.completedAt === "string")
      && transfer.explanation?.kind === "NET_BALANCE_MATCH"
      && isInteger(transfer.explanation.fromExactBalanceBefore)
      && isInteger(transfer.explanation.toExactBalanceBefore)));
}

export function ProjectDetailPage() {
  const { publicToken } = useParams();
  const [settlementStrategy, setSettlementStrategy] =
    useState<SettlementStrategy>("FEWER_TRANSFERS");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  useEffect(() => setSelectedMonth(currentMonth()), [publicToken]);
  const [settlementRecoveryPending, setSettlementRecoveryPending] = useState(false);
  const fixtureDetail = getContinuousProjectDetail(publicToken) ?? getEventProjectDetail(publicToken);
  const isRealProject = fixtureDetail === null;
  const hasDemoSettlement = getSettlementFixture(publicToken, "FEWER_TRANSFERS") !== null;
  const queryClient = useQueryClient();
  const blockedExpenseIds = new Set(useExpenseConflictIds(publicToken));
  const notFoundStates = useExpenseNotFoundStates(publicToken);
  const projectQuery = useProjectQuery(publicToken, isRealProject);
  const quickAdd = useQuickAddExpense(publicToken, isRealProject, projectQuery.refetch);
  const isRealContinuousProject = isRealProject && projectQuery.data?.type === "CONTINUOUS";
  const analyticsQuery = useProjectAnalyticsQuery(publicToken, selectedMonth, isRealContinuousProject);
  const expensesQuery = useExpensesQuery(
    publicToken,
    isRealProject && (projectQuery.isSuccess || isRealContinuousProject),
    isRealContinuousProject ? selectedMonth : undefined,
  );
  const isRealEventProject =
    isRealProject && projectQuery.isSuccess && projectQuery.data.type === "EVENT";
  const settlementQuery = useSettlementQuery(
    publicToken,
    settlementStrategy,
    isRealEventProject || isRealContinuousProject || hasDemoSettlement,
    isRealContinuousProject ? selectedMonth : undefined,
  );
  const comparisonQuery = useSettlementComparisonQuery(
    publicToken,
    hasDemoSettlement || (isRealEventProject && expensesQuery.isSuccess),
  );
  const createExpenseMutation = useCreateExpenseMutation(publicToken);
  const updateExpenseMutation = useUpdateExpenseMutation(publicToken);
  const deleteExpenseMutation = useDeleteExpenseMutation(publicToken);
  const archiveProjectMutation = useArchiveProjectMutation(publicToken);
  const memberMutations = useProjectMemberMutations(publicToken);
  const settlementPresentationBlocked = blockedExpenseIds.size > 0
    || Object.entries(notFoundStates).some(([id, state]) =>
      state === "unresolved" || expensesQuery.data?.items.some((expense) => expense.id === id));

  const selectedSettlement = !settlementRecoveryPending && !settlementPresentationBlocked
    && settlementQuery.isSuccess && settlementQuery.fetchStatus === "idle"
    ? settlementQuery.data
    : undefined;
  const comparisonSourceChanged = Boolean(selectedSettlement
    && comparisonQuery.isSuccess
    && comparisonQuery.fetchStatus === "idle"
    && (comparisonQuery.data[settlementStrategy].runId !== selectedSettlement.runId
      || Boolean(selectedSettlement.sourceStateFingerprint)
        !== Boolean(comparisonQuery.data[settlementStrategy].sourceStateFingerprint)
      || (selectedSettlement.sourceStateFingerprint
        && !sameSettlementFingerprint(selectedSettlement, comparisonQuery.data[settlementStrategy]))));
  const comparisonError = settlementPresentationBlocked || comparisonSourceChanged
    ? new SettlementSourceChangedError()
    : comparisonQuery.error;
  const comparison =
    selectedSettlement && comparisonQuery.isSuccess && comparisonQuery.fetchStatus === "idle"
      && !comparisonSourceChanged
      ? comparisonQuery.data
      : undefined;
  const settlementResponse = comparison?.[settlementStrategy] ?? selectedSettlement;
  const comparisonStatus =
    settlementRecoveryPending || settlementQuery.isPending || settlementQuery.fetchStatus !== "idle"
      || comparisonQuery.isPending || comparisonQuery.fetchStatus !== "idle"
      ? "loading" as const
      : settlementPresentationBlocked || settlementQuery.isError || comparisonQuery.isError || comparisonSourceChanged
        ? "error" as const
        : "ready" as const;
  const settlementStatus =
    settlementRecoveryPending
      ? "loading" as const
      : settlementPresentationBlocked
        ? "error" as const
        : settlementResponse
          ? "ready" as const
          : settlementQuery.isPending || settlementQuery.fetchStatus !== "idle"
            ? "loading" as const
            : settlementQuery.isError
              ? "error" as const
              : "ready" as const;

  if (fixtureDetail?.type === "EVENT" && hasDemoSettlement) {
    return (
      <EventProjectDetail
        detail={withEventSettlement(fixtureDetail, settlementResponse)}
        settlementStrategy={settlementStrategy}
        onSettlementStrategyChange={setSettlementStrategy}
        settlementResponse={settlementResponse}
        comparison={comparison}
        comparisonStatus={comparisonStatus}
        comparisonError={comparisonError}
        onRetryComparison={() => void comparisonQuery.refetch()}
        settlementStatus={settlementStatus}
        settlementError={settlementPresentationBlocked ? comparisonError : settlementQuery.error}
        onRetrySettlement={() => {
          void settlementQuery.refetch();
          if (comparisonSourceChanged) void comparisonQuery.refetch();
        }}
      />
    );
  }

  if (fixtureDetail) {
    return fixtureDetail.type === "CONTINUOUS" ? (
      <ContinuousProjectDetail detail={fixtureDetail} />
    ) : (
      <EventProjectDetail detail={fixtureDetail} />
    );
  }

  if (quickAdd.error) {
    return <div className={styles.statePage}><EmptyState title="プロジェクトを読み込めませんでした"
      description="プロジェクトの状態を確認できませんでした。"
      action={<button className={styles.stateAction} type="button" onClick={quickAdd.retry}>再試行</button>} /></div>;
  }

  if (quickAdd.loading || (projectQuery.isPending && !projectQuery.data)) {
    return (
      <div className={styles.statePage}>
        <EmptyState
          title="プロジェクトを読み込んでいます"
          description="プロジェクト情報を取得しています。"
        />
      </div>
    );
  }

  const analyticsProjectNotFound = isRealContinuousProject && analyticsQuery.error instanceof ApiError
    && analyticsQuery.error.code === "PROJECT_NOT_FOUND";
  if ((projectQuery.isError && !projectQuery.data) || analyticsProjectNotFound) {
    const isProjectNotFound =
      (projectQuery.error instanceof ApiError &&
      projectQuery.error.status === 404 &&
      projectQuery.error.code === "PROJECT_NOT_FOUND") || analyticsProjectNotFound;

    return (
      <div className={styles.statePage}>
        <Link className={styles.backLink} to="/">
          <span aria-hidden="true">←</span>
          <span>プロジェクト一覧に戻る</span>
        </Link>
        {isProjectNotFound ? (
          <EmptyState
            title="プロジェクトが見つかりません"
            description="このリンクのプロジェクトは存在しません。URLを確認してください。"
            action={
              <Link className={styles.stateAction} to="/">
                プロジェクト一覧へ
              </Link>
            }
          />
        ) : (
          <EmptyState
            title="プロジェクトを読み込めませんでした"
            description="通信状況を確認して、もう一度お試しください。"
            action={
              <button
                className={styles.stateAction}
                type="button"
                onClick={() => void projectQuery.refetch()}
              >
                再試行
              </button>
            }
          />
        )}
      </div>
    );
  }

  if (!isRealContinuousProject && expensesQuery.isPending && !expensesQuery.data) {
    return (
      <div className={styles.statePage}>
        <EmptyState
          title="支出履歴を読み込んでいます"
          description="プロジェクトの支出情報を取得しています。"
        />
      </div>
    );
  }

  if (!isRealContinuousProject && expensesQuery.isError && !expensesQuery.data) {
    return (
      <div className={styles.statePage}>
        <Link className={styles.backLink} to="/">
          <span aria-hidden="true">←</span>
          <span>プロジェクト一覧に戻る</span>
        </Link>
        <EmptyState
          title="支出履歴を読み込めませんでした"
          description="通信状況を確認して、もう一度お試しください。"
          action={
            <button
              className={styles.stateAction}
              type="button"
              onClick={() => void expensesQuery.refetch()}
            >
              再試行
            </button>
          }
        />
      </div>
    );
  }

  const monthlySettlement = isRealContinuousProject && settlementQuery.isSuccess
    && settlementQuery.fetchStatus === "idle"
    && settlementQuery.data.scopeType === "YEAR_MONTH"
    && settlementQuery.data.scopeKey === selectedMonth
    && settlementQuery.data.strategy === settlementStrategy
    && settlementQuery.data.state === "CURRENT"
    && !settlementPresentationBlocked && !settlementRecoveryPending
      ? settlementQuery.data : undefined;

  const detail = toProjectDetail(
    projectQuery.data,
    (isRealContinuousProject && (expensesQuery.fetchStatus !== "idle" || !expensesQuery.isSuccess)
      ? [] : expensesQuery.data?.items ?? [])
      .filter((expense) => notFoundStates[expense.id] !== "deleted"),
    isRealContinuousProject ? monthlySettlement : settlementResponse,
  );
  const handleCreateExpense = async (request: CreateExpenseRequest) => {
    await createExpenseMutation.mutateAsync(request);
  };
  const handleUpdateExpense = async (
    expenseId: string,
    request: UpdateExpenseRequest,
  ) => {
    try {
      await updateExpenseMutation.mutateAsync({ expenseId, request });
    } catch (error) {
      if (error instanceof ApiError && error.code === "EXPENSE_NOT_FOUND") {
        try { await handleRecoverExpense(expenseId); } catch { /* Keep the safe block. */ }
      }
      throw error;
    }
  };
  const handleDeleteExpense = async (expenseId: string) => {
    try {
      await deleteExpenseMutation.mutateAsync(expenseId);
    } catch (error) {
      if (error instanceof ApiError && error.code === "EXPENSE_NOT_FOUND") {
        try { await handleRecoverExpense(expenseId); } catch { /* Keep the safe block. */ }
      }
      throw error;
    }
  };
  const handleRecoverExpense = async (expenseId: string): Promise<"found" | "deleted"> => {
    setSettlementRecoveryPending(true);
    try {
      const token = publicToken!;
      if (queryClient.getQueryData<Record<string, ExpenseNotFoundState>>(
        expenseKeys.notFound(token),
      )?.[expenseId] === "unresolved") {
        await queryClient.cancelQueries({ queryKey: expenseKeys.list(token, isRealContinuousProject ? selectedMonth : undefined), exact: true });
      }
      const [firstProject, firstExpenses] = await Promise.all([
        projectQuery.refetch(),
        expensesQuery.refetch(),
      ]);
      if (!firstProject.isSuccess || !firstExpenses.isSuccess) {
        throw new Error("Latest Project or Expense retrieval failed");
      }
      let recoveredExpenses = firstExpenses.data;
      if (firstProject.data.type === "EVENT") {
        const settlementResults = firstProject.data.status === "ACTIVE"
          ? await Promise.allSettled([
            getSettlement(token, settlementStrategy),
            getSettlementComparison(token, true),
          ])
          : null;
        const [latestProject, latestExpenses] = await Promise.all([
          projectQuery.refetch(),
          expensesQuery.refetch(),
        ]);
        if (!latestProject.isSuccess || !latestExpenses.isSuccess) {
          throw new SettlementSourceChangedError();
        }
        if (latestProject.data.status === "ARCHIVED") {
          const archivedExpenses = await expensesQuery.refetch();
          if (!archivedExpenses.isSuccess) throw new SettlementSourceChangedError();
          await queryClient.cancelQueries({ queryKey: settlementKeys.project(token) });
          const [selectedResult, comparisonResult] = await Promise.all([
            settlementQuery.refetch(), comparisonQuery.refetch(),
          ]);
          const selectedUnavailable = selectedResult.isError
            && isExpectedArchivedUnavailable(selectedResult.error);
          const comparisonUnavailable = comparisonResult.isError
            && isExpectedArchivedUnavailable(comparisonResult.error);
          if ((!selectedResult.isSuccess && !selectedUnavailable)
            || (!comparisonResult.isSuccess && !comparisonUnavailable)
            || (selectedResult.isSuccess && !isValidSettlementResponse(
              selectedResult.data, settlementStrategy,
            ))
            || (comparisonResult.isSuccess && (
              !isValidSettlementResponse(comparisonResult.data.FEWER_TRANSFERS, "FEWER_TRANSFERS")
              || !isValidSettlementResponse(comparisonResult.data.UNDERSTANDABLE, "UNDERSTANDABLE")
            ))
            || (selectedUnavailable && comparisonResult.isSuccess)
            || (selectedResult.isSuccess && comparisonResult.isSuccess && (
              selectedResult.data.runId !== comparisonResult.data[settlementStrategy].runId
              || !sameSettlementFingerprint(
                selectedResult.data,
                comparisonResult.data.FEWER_TRANSFERS,
                comparisonResult.data.UNDERSTANDABLE,
              )
            ))) {
            throw new SettlementSourceChangedError();
          }
          recoveredExpenses = archivedExpenses.data;
        } else {
          if (!settlementResults || !sameSettlementSource(
            firstProject.data, firstExpenses.data,
            latestProject.data, latestExpenses.data,
          )) {
            throw new SettlementSourceChangedError();
          }
          const [selectedResult, comparisonResult] = settlementResults;
          if (selectedResult.status !== "fulfilled"
            || comparisonResult.status !== "fulfilled") {
            throw new SettlementSourceChangedError();
          }
          const selected = selectedResult.value;
          const comparison = comparisonResult.value;
          if (!isValidSettlementResponse(selected, settlementStrategy)
            || !isValidSettlementResponse(comparison.FEWER_TRANSFERS, "FEWER_TRANSFERS")
            || !isValidSettlementResponse(comparison.UNDERSTANDABLE, "UNDERSTANDABLE")
            || selected.runId !== comparison[settlementStrategy].runId
            || !sameSettlementFingerprint(
              selected, comparison.FEWER_TRANSFERS, comparison.UNDERSTANDABLE,
            )) {
            throw new SettlementSourceChangedError();
          }
          const confirmed = await getSettlement(token, settlementStrategy);
          if (!isValidSettlementResponse(confirmed, settlementStrategy)
            || confirmed.runId !== selected.runId
            || !sameSettlementFingerprint(selected, confirmed)) {
            throw new SettlementSourceChangedError();
          }
          await queryClient.cancelQueries({ queryKey: settlementKeys.project(token) });
          queryClient.setQueryData(settlementKeys.detail(token, "FEWER_TRANSFERS"),
            comparison.FEWER_TRANSFERS);
          queryClient.setQueryData(settlementKeys.detail(token, "UNDERSTANDABLE"),
            comparison.UNDERSTANDABLE);
          queryClient.setQueryData(settlementKeys.detail(token, settlementStrategy), confirmed);
          queryClient.setQueryData(settlementKeys.comparison(token), comparison);
          recoveredExpenses = latestExpenses.data;
        }
      } else {
        const firstSettlement = await getSettlement(token, settlementStrategy, selectedMonth);
        const [latestProject, latestExpenses] = await Promise.all([
          projectQuery.refetch(), expensesQuery.refetch(),
        ]);
        if (!latestProject.isSuccess || !latestExpenses.isSuccess
          || !sameSettlementSource(firstProject.data, firstExpenses.data,
            latestProject.data, latestExpenses.data)) {
          throw new SettlementSourceChangedError();
        }
        const confirmed = await getSettlement(token, settlementStrategy, selectedMonth);
        if (confirmed.scopeType !== "YEAR_MONTH" || confirmed.scopeKey !== selectedMonth
          || confirmed.state !== "CURRENT" || confirmed.runId !== firstSettlement.runId
          || !sameSettlementFingerprint(firstSettlement, confirmed)) {
          throw new SettlementSourceChangedError();
        }
        await queryClient.cancelQueries({ queryKey: settlementKeys.project(token) });
        queryClient.setQueryData(settlementKeys.detail(token, settlementStrategy, selectedMonth), confirmed);
        recoveredExpenses = latestExpenses.data;
      }
      if (!recoveredExpenses || !Array.isArray(recoveredExpenses.items)) {
        throw new Error("Invalid Expense list response");
      }
      const recoveredOutcome = recoveredExpenses.items.some((expense) => expense.id === expenseId)
        ? "found" as const : "deleted" as const;
      // Publish the verified list before removing either safety block. A late
      // pre-recovery list request must not restore a deleted row.
      await queryClient.cancelQueries({ queryKey: expenseKeys.list(token, isRealContinuousProject ? selectedMonth : undefined), exact: true });
      queryClient.setQueryData(expenseKeys.list(token, isRealContinuousProject ? selectedMonth : undefined), recoveredExpenses);
      if (queryClient.getQueryData<Record<string, ExpenseNotFoundState>>(
        expenseKeys.notFound(token),
      )?.[expenseId]) {
        setExpenseNotFoundState(queryClient, token, expenseId,
          recoveredOutcome === "deleted" ? "deleted" : null);
      }
      const conflictKey = expenseKeys.conflicts(publicToken ?? "");
      const remaining = (queryClient.getQueryData<string[]>(conflictKey) ?? [])
        .filter((id) => id !== expenseId);
      if (remaining.length) queryClient.setQueryData(conflictKey, remaining);
      else queryClient.removeQueries({ queryKey: conflictKey, exact: true });
      return recoveredOutcome;
    } finally {
      setSettlementRecoveryPending(false);
    }
  };
  const handleExpenseConflict = (expenseId: string) => {
    queryClient.setQueryData<string[]>(expenseKeys.conflicts(publicToken ?? ""),
      (current) => [...new Set([...(current ?? []), expenseId])]);
  };
  const handleExpenseDialogClose = (expenseId: string) => {
    const token = publicToken!;
    const notFoundKey = expenseKeys.notFound(token);
    if (queryClient.getQueryData<Record<string, ExpenseNotFoundState>>(
      notFoundKey,
    )?.[expenseId] !== "deleted") return;
    void (async () => {
      try {
        const listKey = expenseKeys.list(token, isRealContinuousProject ? selectedMonth : undefined);
        await queryClient.cancelQueries({ queryKey: listKey, exact: true });
        const canonical = queryClient.getQueryData<ExpenseListResponse>(listKey);
        if (canonical && Array.isArray(canonical.items)
          && !canonical.items.some((expense) => expense.id === expenseId)
          && queryClient.getQueryData<Record<string, ExpenseNotFoundState>>(
            notFoundKey,
          )?.[expenseId] === "deleted") {
          setExpenseNotFoundState(queryClient, token, expenseId, null);
        }
      } catch { /* Retain the safe state if the cache cannot be confirmed. */ }
    })();
  };
  const handleArchive = async () => {
    await archiveProjectMutation.mutateAsync();
  };
  const handleAddMember = async (name: string) => {
    await memberMutations.add.mutateAsync(name);
  };
  const handleRenameMember = async (memberId: string, name: string) => {
    await memberMutations.rename.mutateAsync({ memberId, name });
  };

  return detail.type === "CONTINUOUS" ? (
    <ContinuousProjectDetail
      key={publicToken}
      quickAddRequestId={quickAdd.requestId}
      onQuickAddHandled={quickAdd.handled}
      detail={detail}
      selectedMonth={selectedMonth}
      analytics={analyticsQuery}
      onRetryAnalytics={() => void analyticsQuery.refetch()}
      onMonthChange={setSelectedMonth}
      settlementStrategy={settlementStrategy}
      onSettlementStrategyChange={setSettlementStrategy}
      settlementStatus={settlementQuery.isPending || settlementQuery.fetchStatus !== "idle"
        || settlementRecoveryPending ? "loading"
        : settlementQuery.isError || !monthlySettlement || settlementPresentationBlocked
          ? "error" : "ready"}
      onRetrySettlement={() => void settlementQuery.refetch()}
      settlementResponse={monthlySettlement}
      expenseStatus={expensesQuery.isError ? "error"
        : expensesQuery.isPending || expensesQuery.fetchStatus !== "idle" ? "loading" : "ready"}
      onRetryExpenses={() => void expensesQuery.refetch()}
      archived={projectQuery.data.status === "ARCHIVED"}
      onCreateExpense={handleCreateExpense}
      onUpdateExpense={projectQuery.data.status === "ACTIVE" ? handleUpdateExpense : undefined}
      onDeleteExpense={projectQuery.data.status === "ACTIVE" ? handleDeleteExpense : undefined}
      onRecoverExpense={handleRecoverExpense}
      onExpenseConflict={handleExpenseConflict}
      blockedExpenseIds={blockedExpenseIds}
      notFoundStates={notFoundStates}
      onExpenseDialogClose={handleExpenseDialogClose}
      expenseListReady={expensesQuery.isSuccess && expensesQuery.fetchStatus === "idle"}
      onAddMember={projectQuery.data.status === "ACTIVE" ? handleAddMember : undefined}
      onRenameMember={projectQuery.data.status === "ACTIVE" ? handleRenameMember : undefined}
    />
  ) : (
    <EventProjectDetail
      key={publicToken}
      quickAddRequestId={quickAdd.requestId}
      onQuickAddHandled={quickAdd.handled}
      detail={detail}
      settlementStrategy={settlementStrategy}
      onSettlementStrategyChange={setSettlementStrategy}
      settlementResponse={settlementResponse}
      comparison={comparison}
      comparisonStatus={comparisonStatus}
      comparisonError={comparisonError}
      onRetryComparison={() => void comparisonQuery.refetch()}
      settlementStatus={settlementStatus}
      settlementError={settlementPresentationBlocked ? comparisonError : settlementQuery.error}
      expenseSafetyBlocked={settlementPresentationBlocked}
      onRetrySettlement={() => {
        void settlementQuery.refetch();
        if (comparisonSourceChanged) void comparisonQuery.refetch();
      }}
      onCreateExpense={handleCreateExpense}
      onUpdateExpense={handleUpdateExpense}
      onDeleteExpense={handleDeleteExpense}
      onRecoverExpense={handleRecoverExpense}
      onExpenseConflict={handleExpenseConflict}
      blockedExpenseIds={blockedExpenseIds}
      notFoundStates={notFoundStates}
      onExpenseDialogClose={handleExpenseDialogClose}
      expenseListReady={expensesQuery.isSuccess && expensesQuery.fetchStatus === "idle"}
      onAddMember={projectQuery.data.status === "ACTIVE" ? handleAddMember : undefined}
      onRenameMember={projectQuery.data.status === "ACTIVE" ? handleRenameMember : undefined}
      onArchive={handleArchive}
    />
  );
}
