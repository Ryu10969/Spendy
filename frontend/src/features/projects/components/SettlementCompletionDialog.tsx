import { useEffect, useId, useRef, useState } from "react";
import { ApiError } from "../../../api/client";
import type { SettlementTransfer } from "../../../types/project";
import { useAccessibleDialog } from "../../../hooks/useAccessibleDialog";
import { formatYen } from "../../../utils/formatMoney";
import styles from "./SettlementCompletionDialog.module.css";

type SettlementCompletionDialogProps = {
  projectName: string;
  settlementTransfers: SettlementTransfer[];
  onConfirm?: () => Promise<void>;
  onClose: () => void;
};

function archiveErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "PROJECT_ARCHIVED":
        return "このイベントはすでにアーカイブ済みです。";
      case "EVENT_ARCHIVE_UNSUPPORTED":
        return "このプロジェクトではイベントのアーカイブを利用できません。";
      case "PROJECT_NOT_FOUND":
        return "プロジェクトが見つかりません。";
      case "VALIDATION_ERROR":
        return "アーカイブの確認が必要です。内容を確認して、もう一度お試しください。";
      default:
        break;
    }
  }

  return "アーカイブできませんでした。通信状況を確認して、もう一度お試しください。";
}

export function SettlementCompletionDialog({
  projectName,
  settlementTransfers,
  onConfirm,
  onClose,
}: SettlementCompletionDialogProps) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const isSubmittingRef = useRef(false);
  const titleId = `${baseId}-title`;
  const descriptionId = `${baseId}-description`;
  const [confirmed, setConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const isPersistedArchive = Boolean(onConfirm);

  const requestClose = () => {
    if (!isSubmittingRef.current) {
      onClose();
    }
  };

  useAccessibleDialog(dialogRef, requestClose);

  useEffect(() => {
    if (confirmed) {
      successRef.current?.focus();
    }
  }, [confirmed]);

  useEffect(() => {
    if (submissionError) {
      errorRef.current?.focus();
    }
  }, [submissionError]);

  const handleOverlayMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      requestClose();
    }
  };

  const handleConfirm = async () => {
    if (isSubmittingRef.current) {
      return;
    }

    if (!onConfirm) {
      setConfirmed(true);
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      await onConfirm();
    } catch (error) {
      setSubmissionError(archiveErrorMessage(error));
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={handleOverlayMouseDown} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        ref={dialogRef}
      >
        <div className={styles.header}>
          <h2 className={styles.title} id={titleId}>
            {confirmed ? "アーカイブの確認を表示しました" : "イベントをアーカイブしますか？"}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={requestClose}
            aria-label="閉じる"
            disabled={isSubmitting}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {confirmed ? (
          <div className={styles.body}>
            <p
              className={styles.successMessage}
              role="status"
              ref={successRef}
              tabIndex={-1}
            >
              <span className={styles.successIcon} aria-hidden="true">
                ✓
              </span>
              「{projectName}」のアーカイブ操作を確認しました。
            </p>
            <p className={styles.archivedFeedback}>
              <span className={styles.archivedBadge}>アーカイブ済み（想定）</span>
              <span>
                このイベントはアーカイブ扱いになり、閲覧のみ（読み取り専用）になる想定です。支出の追加・編集・削除はできなくなります。振込状況は変更されません。
              </span>
            </p>
            <p className={styles.demoNote} id={descriptionId}>
              この操作はデモ表示のため、実際にはアーカイブ・読み取り専用化は保存されていません。
            </p>
            <div className={styles.footer}>
              <button type="button" className={styles.confirmButton} onClick={onClose}>
                閉じる
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.body}>
            <p className={styles.contextNote} id={descriptionId}>
              {isPersistedArchive
                ? `「${projectName}」をアーカイブすると、閲覧のみになります。支出の追加・編集・削除はできなくなります。振込状況は変更されません。`
                : `「${projectName}」をアーカイブ扱いにするデモ表示です。支出の追加・編集・削除はできなくなる想定です。振込状況は変更されません。`}
            </p>

            <p className={styles.archiveCallout}>
              <span className={styles.archiveCalloutIcon} aria-hidden="true">
                🗂
              </span>
              <span>
                アーカイブはイベントを閲覧のみにする操作です。振込の完了とは別です。
              </span>
            </p>

            <section className={styles.summaryCard} aria-labelledby={`${baseId}-summary-title`}>
              <h3 className={styles.summaryTitle} id={`${baseId}-summary-title`}>
                精算結果の確認
              </h3>
              {settlementTransfers.length === 0 ? (
                <p className={styles.emptyNote}>精算が必要な取引はありません。</p>
              ) : (
                <ul className={styles.summaryList}>
                  {settlementTransfers.map((transfer) => (
                    <li key={transfer.id} className={styles.summaryItem}>
                      <span className={styles.summaryParties}>
                        <span className={styles.summaryFrom}>{transfer.fromMemberName}</span>
                        <span className={styles.summaryArrow} aria-hidden="true">
                          →
                        </span>
                        <span className={styles.summaryTo}>{transfer.toMemberName}</span>
                      </span>
                      <span className={styles.summaryAmount}>{formatYen(transfer.amountYen)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {isPersistedArchive ? null : (
              <p className={styles.demoNote}>
                これは UI 実装段階のデモ表示です。実際のアーカイブ・保存は行われません。
              </p>
            )}

            {submissionError ? (
              <p
                className={styles.apiError}
                role="alert"
                ref={errorRef}
                tabIndex={-1}
              >
                {submissionError}
              </p>
            ) : null}

            <div className={styles.footer}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={requestClose}
                disabled={isSubmitting}
              >
                キャンセル
              </button>
              <button
                type="button"
                className={styles.confirmButton}
                onClick={() => void handleConfirm()}
                disabled={isSubmitting}
              >
                <span aria-hidden="true">✓</span>
                <span>{isSubmitting ? "アーカイブ中…" : "イベントをアーカイブ"}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
