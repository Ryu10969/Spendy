import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../../api/client";
import type { CreateExpenseRequest } from "../../../api/expenseApi";
import { useAccessibleDialog } from "../../../hooks/useAccessibleDialog";
import type { ProjectMember } from "../../../types/project";
import {
  ExpenseForm,
  focusFirstExpenseError,
  toExpenseRequest,
  validateExpenseForm,
  type ExpenseFormErrors,
  type ExpenseFormState,
} from "./ExpenseForm";
import styles from "./AddExpenseModal.module.css";

type AddExpenseModalProps = {
  projectName: string;
  currencyLabel: string;
  members: ProjectMember[];
  initialDate?: string;
  onSubmit?: (request: CreateExpenseRequest) => Promise<void>;
  onClose: () => void;
};

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function submissionErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "PROJECT_ARCHIVED") return "このプロジェクトはアーカイブ済みのため、支出を追加できません。";
    if (error.code === "MEMBER_NOT_FOUND" || error.code === "MEMBER_INACTIVE") {
      return "選択したメンバーを利用できません。プロジェクト情報を再読み込みしてください。";
    }
    if (error.code === "VALIDATION_ERROR") return "入力内容を保存できませんでした。各項目を確認して、もう一度お試しください。";
  }
  return "支出を保存できませんでした。通信状況を確認して、もう一度お試しください。";
}

export function AddExpenseModal({ projectName, currencyLabel, members, initialDate, onSubmit, onClose }: AddExpenseModalProps) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    // Remember the trigger before inert can blur it in the browser.
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previous: Array<readonly [HTMLElement, boolean]> = [];
    // Keep the modal's ancestor path interactive, blocking all sibling branches.
    for (let node: HTMLElement | null = overlayRef.current; node?.parentElement; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling instanceof HTMLElement && sibling !== node) {
          previous.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      if (node.parentElement === document.body) break;
    }
    return () => { previous.forEach(([node, inert]) => { node.inert = inert; }); };
  }, []);
  const fieldsRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const isSubmittingRef = useRef(false);
  const selectableMembers = members.filter((member) => member.active !== false);
  const [form, setForm] = useState<ExpenseFormState>(() => ({
    payerId: selectableMembers[0]?.id ?? "",
    participantIds: selectableMembers.map((member) => member.id),
    amount: "",
    content: "",
    date: initialDate ?? todayIsoDate(),
    categoryKey: "",
    memo: "",
  }));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [demoSaved, setDemoSaved] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestClose = () => {
    if (!isSubmittingRef.current) onClose();
  };
  useAccessibleDialog(dialogRef, requestClose, undefined, returnFocusRef);

  useEffect(() => {
    fieldsRef.current?.querySelector<HTMLElement>('[data-expense-field="amount"]')?.focus();
  }, []);
  useEffect(() => {
    if (demoSaved) noticeRef.current?.focus();
  }, [demoSaved]);
  useEffect(() => {
    if (submissionError) errorRef.current?.focus();
  }, [submissionError]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const nextErrors = validateExpenseForm(form);
    setErrors(nextErrors);
    setSubmissionError(null);
    if (Object.keys(nextErrors).length) {
      setDemoSaved(false);
      focusFirstExpenseError(fieldsRef.current, nextErrors);
      return;
    }
    if (!onSubmit) {
      setDemoSaved(true);
      return;
    }
    setDemoSaved(false);
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onSubmit(toExpenseRequest(form));
      onClose();
    } catch (error) {
      setSubmissionError(submissionErrorMessage(error));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div ref={overlayRef} className={styles.overlay} role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) requestClose(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-context`} tabIndex={-1} ref={dialogRef}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title} id={`${id}-title`}>支出を追加</h2>
            <p className={styles.contextNote} id={`${id}-context`}>{projectName} · {currencyLabel}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={requestClose}
            disabled={isSubmitting} aria-label="支出の追加を閉じる"><span aria-hidden="true">×</span></button>
        </div>
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.body} ref={fieldsRef} data-expense-picker-boundary>
            {selectableMembers.length === 0 ? <p role="status">支出を追加するには、有効なメンバーが必要です。</p> : null}
            <ExpenseForm form={form} errors={errors} members={selectableMembers}
              onChange={(next, field) => {
                setForm(next);
                setDemoSaved(false);
                setSubmissionError(null);
                if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }));
              }} />
            {demoSaved && <p className={styles.demoNotice} role="status" ref={noticeRef} tabIndex={-1}>
              入力内容を確認しました。この画面は UI 実装段階のため、支出は保存されていません（デモ表示のみ）。
            </p>}
            {submissionError && <p className={styles.apiError} role="alert" ref={errorRef} tabIndex={-1}>{submissionError}</p>}
          </div>
          <div className={styles.footer}>
            <button type="submit" className={styles.saveButton} disabled={isSubmitting || selectableMembers.length === 0}>{isSubmitting ? "保存中…" : "支出を追加"}</button>
            <button type="button" className={styles.cancelButton} onClick={requestClose} disabled={isSubmitting}>キャンセル</button>
          </div>
        </form>
      </div>
    </div>
  );
}
