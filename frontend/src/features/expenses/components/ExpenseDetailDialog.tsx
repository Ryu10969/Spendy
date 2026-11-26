import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../../api/client";
import { type ExpenseCategory, type UpdateExpenseRequest } from "../../../api/expenseApi";
import {
  ExpenseForm,
  focusFirstExpenseError,
  toExpenseRequest,
  validateExpenseForm,
  type ExpenseFormErrors,
  type ExpenseFormState,
} from "./ExpenseForm";
import { useAccessibleDialog } from "../../../hooks/useAccessibleDialog";
import type { ExpenseNotFoundState } from "../expenseQueries";
import type { ProjectExpenseItem, ProjectMember } from "../../../types/project";
import { formatYen } from "../../../utils/formatMoney";
import { expenseCategoryLabels, expenseCategoryOptions } from "../expenseCategories";
import styles from "./ExpenseDetailDialog.module.css";

type ExpenseDetailDialogProps = {
  projectName: string;
  expense: ProjectExpenseItem;
  members: ProjectMember[];
  useChoiceCards?: boolean;
  onUpdate?: (request: UpdateExpenseRequest) => Promise<void>;
  onDelete?: () => Promise<void>;
  onRecover?: () => Promise<"found" | "deleted">;
  onConflict?: () => void;
  recoveryRequired?: boolean;
  notFoundState?: ExpenseNotFoundState;
  missing?: boolean;
  focusFallbackId?: string;
  onClose: () => void;
};

type DialogMode = "detail" | "edit" | "delete";

type EditExpenseFormState = ExpenseFormState & { version?: number };

function isExpenseCategory(value: string | null): value is ExpenseCategory {
  return expenseCategoryOptions.some((option) => option.key === value);
}

function toEditForm(expense: ProjectExpenseItem): EditExpenseFormState {
  return {
    payerId: expense.persistedState?.payerMemberId ?? "",
    participantIds: expense.persistedState?.participantMemberIds ?? [],
    amount: String(expense.amountYen),
    content: expense.title,
    date: expense.persistedState?.paidOn ?? "",
    categoryKey: isExpenseCategory(expense.categoryKey) ? expense.categoryKey : "",
    memo: expense.memo ?? "",
    version: expense.persistedState?.version,
  };
}

function mutationErrorMessage(error: unknown, operation: "update" | "delete"): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "PROJECT_ARCHIVED":
        return "このプロジェクトはアーカイブ済みのため、支出を変更できません。";
      case "PROJECT_NOT_FOUND":
        return "プロジェクトが見つかりません。ページを再読み込みしてください。";
      case "EXPENSE_NOT_FOUND":
        return "この支出はすでに削除されたか、見つかりません。ページを再読み込みしてください。";
      case "MEMBER_NOT_FOUND":
      case "MEMBER_INACTIVE":
        return "選択したメンバーを利用できません。最新のプロジェクト情報を確認してください。";
      case "VALIDATION_ERROR":
        return operation === "update"
          ? "入力内容を保存できませんでした。各項目を確認してください。"
          : "支出を削除できませんでした。最新の状態を確認してください。";
    }
  }

  return operation === "update"
    ? "支出を保存できませんでした。通信状況を確認して、もう一度お試しください。"
    : "支出を削除できませんでした。通信状況を確認して、もう一度お試しください。";
}

export function ExpenseDetailDialog({
  projectName,
  expense,
  members,
  useChoiceCards = false,
  onUpdate,
  onDelete,
  onRecover,
  onConflict,
  recoveryRequired = false,
  notFoundState,
  missing = false,
  focusFallbackId,
  onClose,
}: ExpenseDetailDialogProps) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const deleteActionRef = useRef<HTMLButtonElement>(null);
  const editActionRef = useRef<HTMLButtonElement>(null);
  const mutationErrorRef = useRef<HTMLParagraphElement>(null);
  const conflictRef = useRef<HTMLParagraphElement>(null);
  const isPendingRef = useRef(false);
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const [mode, setMode] = useState<DialogMode>("detail");
  const [form, setForm] = useState<EditExpenseFormState>(() => toEditForm(expense));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const isNotFoundUnresolved = notFoundState === "unresolved";
  const isDeleted = deleted || notFoundState === "deleted"
    || (missing && !isNotFoundUnresolved);
  const canMutate = !isDeleted && !recoveryRequired && !isNotFoundUnresolved
    && Boolean(expense.persistedState && onUpdate && onDelete);
  const selectedMemberIds = new Set([
    expense.persistedState?.payerMemberId,
    ...(expense.persistedState?.participantMemberIds ?? []),
    form.payerId,
    ...form.participantIds,
  ]);
  const editableMembers = members.filter(
    (member) => member.active !== false || selectedMemberIds.has(member.id),
  );
  const savedShares = expense.persistedState && expense.participantAllocations?.length
    ? expense.participantAllocations.map((allocation) => allocation.allocatedShareYen)
    : null;
  const minimumShare = savedShares ? Math.min(...savedShares) : null;
  const maximumShare = savedShares ? Math.max(...savedShares) : null;
  const requestClose = () => {
    if (isPendingRef.current) return;
    if (mode === "edit" && conflicted) {
      onClose();
    } else if (mode === "edit") {
      setErrors({});
      setMutationError(null);
      setConflicted(false);
      setMode("detail");
      window.requestAnimationFrame(() => editActionRef.current?.focus());
    } else onClose();
  };

  useAccessibleDialog(dialogRef, requestClose, focusFallbackId);

  useEffect(() => {
    if ((missing || notFoundState === "deleted") && !conflicted && !isNotFoundUnresolved) {
      setDeleted(true);
      setMode("detail");
      conflictRef.current?.focus();
    }
  }, [missing, conflicted, isNotFoundUnresolved, notFoundState]);

  useEffect(() => {
    if (mode === "edit") {
      fieldsRef.current?.querySelector<HTMLElement>('[data-expense-field="amount"]')?.focus();
    } else if (mode === "delete") {
      deleteActionRef.current?.focus();
    }
  }, [mode]);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  const showMutationError = (message: string) => {
    setMutationError(message);
    window.requestAnimationFrame(() => mutationErrorRef.current?.focus());
  };

  const beginEdit = () => {
    if (!canMutate) return;
    setForm(toEditForm(expense));
    setErrors({});
    setMutationError(null);
    setConflicted(false);
    setMode("edit");
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPendingRef.current || conflicted || recoveryRequired || isNotFoundUnresolved || isDeleted || !onUpdate || form.version === undefined) {
      return;
    }

    const nextErrors = validateExpenseForm(form);
    setErrors(nextErrors);
    setMutationError(null);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstExpenseError(fieldsRef.current, nextErrors);
      return;
    }

    isPendingRef.current = true;
    setIsPending(true);
    try {
      await onUpdate({ ...toExpenseRequest(form), version: form.version });
      setMode("detail");
      window.requestAnimationFrame(() => editActionRef.current?.focus());
    } catch (error) {
      if (error instanceof ApiError && error.code === "EXPENSE_VERSION_CONFLICT") {
        setConflicted(true);
        onConflict?.();
        window.requestAnimationFrame(() => conflictRef.current?.focus());
      } else if (error instanceof ApiError && error.code === "EXPENSE_NOT_FOUND") {
        setMode("detail");
        window.requestAnimationFrame(() =>
          (conflictRef.current ?? editActionRef.current ?? dialogRef.current)?.focus());
      } else {
        showMutationError(mutationErrorMessage(error, "update"));
      }
    } finally {
      isPendingRef.current = false;
      setIsPending(false);
    }
  };

  const handleRecover = async () => {
    if (isPendingRef.current || (!conflicted && !recoveryRequired && !isNotFoundUnresolved) || !onRecover) return;
    isPendingRef.current = true;
    setIsPending(true);
    setIsRecovering(true);
    setMutationError(null);
    try {
      const outcome = await onRecover();
      setDeleted(outcome === "deleted");
      setConflicted(false);
      setMode("detail");
      window.requestAnimationFrame(() => {
        if (outcome === "deleted") conflictRef.current?.focus();
        else (editActionRef.current ?? dialogRef.current)?.focus();
      });
    } catch {
      showMutationError(conflicted
        ? "最新の支出内容を確認できませんでした。入力内容はこの画面に残っています。通信状況を確認して、もう一度お試しください。"
        : "最新の支出内容を確認できませんでした。通信状況を確認して、もう一度お試しください。");
    } finally {
      isPendingRef.current = false;
      setIsPending(false);
      setIsRecovering(false);
    }
  };

  const handleDelete = async () => {
    if (isPendingRef.current || recoveryRequired || isNotFoundUnresolved || isDeleted || !onDelete) {
      return;
    }

    setMutationError(null);
    isPendingRef.current = true;
    setIsPending(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.code === "EXPENSE_NOT_FOUND") {
        setMode("detail");
        window.requestAnimationFrame(() =>
          (conflictRef.current ?? editActionRef.current ?? dialogRef.current)?.focus());
      } else {
        showMutationError(mutationErrorMessage(error, "delete"));
      }
    } finally {
      isPendingRef.current = false;
      setIsPending(false);
    }
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={handleOverlayMouseDown}
      role="presentation"
    >
      <div
        className={`${styles.dialog} ${mode === "delete" ? styles.deleteDialog : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={mode === "delete" || (mode === "detail" && !canMutate) ? descriptionId : undefined}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className={`${styles.header} ${styles.alignedHeader}`}>
          <div>
            <p className={styles.eyebrow}>
              {mode === "edit"
                ? "支出内容の編集"
                : mode === "delete"
                  ? "削除前の確認"
                  : "支出内容の確認"}
            </p>
            <h2 className={styles.title} id={titleId}>
              {mode === "edit"
                ? "支出を編集"
                : mode === "delete"
                  ? "支出を削除"
                  : "支出詳細"}
            </h2>
          </div>
          <button
            type="button"
            className={styles.iconCloseButton}
            onClick={requestClose}
            disabled={isPending}
            aria-label={mode === "edit"
              ? conflicted ? "編集をやめて支出一覧に戻る" : "編集をキャンセルして支出詳細に戻る"
              : "支出詳細を閉じる"}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {mode === "edit" && (!isDeleted || conflicted) ? (
          <form className={styles.editForm} onSubmit={handleEditSubmit} noValidate>
            <div className={styles.body} ref={fieldsRef} data-expense-picker-boundary>
              {conflicted && (
                <p className={`${styles.apiError} ${styles.conflictAlert}`} role="alert" ref={conflictRef} tabIndex={-1}>
                  <strong>別の操作で更新されています</strong>
                  今回の変更は保存されていません。入力内容はこの編集画面に残っています。
                  最新の支出内容を確認してから、あらためて編集してください。
                </p>
              )}
              {conflicted && <p className={styles.projectName}>{projectName}</p>}
              <ExpenseForm form={form} errors={errors} members={editableMembers} useChoiceCards={useChoiceCards}
                onChange={(next, field) => {
                  if (!conflicted) setMutationError(null);
                  setForm((current) => ({ ...next, version: current.version }));
                  if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }));
                }} />
              {mutationError && (
                <p className={styles.apiError} role="alert" ref={mutationErrorRef} tabIndex={-1}>
                  {mutationError}
                </p>
              )}
            </div>
            <div className={`${styles.formActions} ${conflicted ? styles.conflictActions : ""}`}>
              <button type="submit" className={styles.primaryButton} disabled={isPending || conflicted || recoveryRequired || isNotFoundUnresolved || isDeleted}>
                {isPending && !isRecovering ? "保存中…" : "変更を保存"}
              </button>
              {conflicted && (
                <>
                  <p className={styles.conflictHint}>最新内容を確認してから再編集してください。</p>
                  <button type="button" className={styles.primaryButton} disabled={isPending}
                    onClick={() => void handleRecover()}>
                    {isRecovering ? "確認中…" : "最新の支出内容を確認"}
                  </button>
                </>
              )}
              <button type="button" className={styles.secondaryButton} disabled={isPending}
                onClick={requestClose}>{conflicted ? "編集をやめる" : "キャンセル"}</button>
            </div>
          </form>
        ) : mode === "delete" && !isDeleted ? (
          <div className={`${styles.body} ${styles.deleteBody}`}>
            <div className={styles.deleteConfirmation} id={descriptionId}>
              <h3>この支出を削除しますか？</h3>
              <p className={styles.deleteWarning}>この操作は取り消せません。</p>
              <div className={styles.deleteTarget}>
                <p className={styles.projectName}>{projectName}</p>
                <p className={styles.deleteExpenseName}>{expense.title}</p>
                <p className={styles.deleteAmount}>{formatYen(expense.amountYen)}</p>
                <p className={styles.deleteMeta}>{expense.payerName} 支払い・{expense.dateLabel}</p>
              </div>
            </div>

            {mutationError ? (
              <p
                className={styles.apiError}
                role="alert"
                ref={mutationErrorRef}
                tabIndex={-1}
              >
                {mutationError}
              </p>
            ) : null}

            <div className={`${styles.formActions} ${styles.deleteActions}`}>
              <button
                type="button"
                className={styles.dangerButton}
                ref={deleteActionRef}
                disabled={isPending}
                onClick={() => void handleDelete()}
              >
                {isPending ? "削除中…" : "削除する"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={isPending}
                onClick={() => {
                  setMutationError(null);
                  setMode("detail");
                }}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : isDeleted ? (
          <div className={styles.body}>
            <p className={styles.apiError} id={descriptionId} ref={conflictRef} tabIndex={-1} role="status">
              最新の情報でこの支出は削除されています。ここから編集・削除はできません。
            </p>
          </div>
        ) : isNotFoundUnresolved ? (
          <div className={styles.body}>
            <p className={styles.apiError} id={descriptionId} ref={conflictRef} tabIndex={-1} role="alert">
              この支出は見つかりませんでした。最新の支出一覧を確認できるまで、編集・削除はできません。
            </p>
            {mutationError && (
              <p className={styles.apiError} role="alert" ref={mutationErrorRef} tabIndex={-1}>
                {mutationError}
              </p>
            )}
          </div>
        ) : recoveryRequired ? (
          <div className={styles.body}>
            <p className={styles.apiError} id={descriptionId} role="status">
              前回の編集は保存されていません。最新の支出内容を確認するまで、再編集はできません。
            </p>
            {mutationError && (
              <p className={styles.apiError} role="alert" ref={mutationErrorRef} tabIndex={-1}>
                {mutationError}
              </p>
            )}
          </div>
        ) : (
          <div className={`${styles.body} ${styles.detailBody}`}>
            <div className={styles.summary}>
              <p className={styles.projectName}>{projectName}</p>
              <p className={styles.expenseName}>{expense.title}</p>
              <p className={styles.amount}>{formatYen(expense.amountYen)}</p>
            </div>

            <dl className={styles.details}>
              <div className={styles.detailRow}>
                <dt>支払者</dt>
                <dd>{expense.payerName}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>支払日</dt>
                <dd>{expense.dateLabel}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>カテゴリ</dt>
                <dd>{expense.categoryKey ? expenseCategoryLabels[expense.categoryKey] : "未設定"}</dd>
              </div>
              <div className={styles.detailRow}>
                <dt>割り勘方式</dt>
                <dd>
                  {minimumShare !== null && maximumShare !== null
                    ? `均等割り ${formatYen(minimumShare)}${minimumShare === maximumShare ? "" : `〜${formatYen(maximumShare)}`} / 人`
                    : "均等割り"}
                  {minimumShare !== null && maximumShare !== null && maximumShare - minimumShare === 1 ? (
                    <p className={styles.roundingNote}>割り切れない端数は1円単位で調整されています。</p>
                  ) : null}
                </dd>
              </div>
            </dl>

            <section className={styles.allocationSection} aria-labelledby={`${baseId}-allocations`}>
              <h3 id={`${baseId}-allocations`}>
                {expense.persistedState ? "対象メンバー・保存済み配分" : "対象メンバー"}
              </h3>
              <ul className={styles.memberList}>
                {expense.participantAllocations
                  ? expense.participantAllocations.map((allocation) => (
                      <li key={allocation.memberId}>
                        <span>{allocation.memberName}</span>
                        <span className={styles.allocation}>
                          {formatYen(allocation.allocatedShareYen)}
                        </span>
                      </li>
                    ))
                  : expense.participantNames.map((name, index) => (
                      <li key={`${name}-${index}`}>{name}</li>
                    ))}
              </ul>
              {expense.persistedState && expense.participantAllocations?.length ? (
                <div className={styles.allocationTotal}>
                  <span>合計</span>
                  <strong>{formatYen(expense.amountYen)}</strong>
                </div>
              ) : null}
            </section>

            <section className={styles.memoSection} aria-label="メモ">
              <h3>メモ</h3>
              <p className={expense.memo ? undefined : styles.emptyValue}>
                {expense.memo ?? "メモはありません"}
              </p>
            </section>

            {!canMutate ? (
              <p className={styles.demoNote} id={descriptionId}>
                {expense.persistedState
                  ? "表示している対象メンバーの金額は保存済みです。このプロジェクトは閲覧のみのため、編集・削除できません。"
                  : "これは集中管理されたデモデータの確認画面です。表示内容は保存済みデータではなく、この画面からの編集・削除も行われません。"}
              </p>
            ) : null}
          </div>
        )}

        <div className={styles.footer}>
          {mode === "detail" || (isDeleted && !conflicted) ? (
            <>
              <div className={styles.footerPrimary}>
                {canMutate ? (
                  <button type="button" className={styles.primaryButton} onClick={beginEdit} ref={editActionRef}>
                    編集する
                  </button>
                ) : null}
                <button type="button" className={styles.secondaryButton} onClick={requestClose}>
                  閉じる
                </button>
                {(recoveryRequired || isNotFoundUnresolved) && !isDeleted ? (
                  <button type="button" className={styles.primaryButton} disabled={isPending}
                    onClick={() => void handleRecover()}>
                    {isRecovering ? "確認中…" : "最新の支出内容を確認"}
                  </button>
                ) : null}
              </div>
              {canMutate ? (
                <button
                  type="button"
                  className={styles.deleteButton}
                  onClick={() => {
                    setMutationError(null);
                    setMode("delete");
                  }}
                >
                  この支出を削除
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
