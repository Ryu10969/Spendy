import { useEffect, useId, useRef, useState } from "react";
import { useAccessibleDialog } from "../../../hooks/useAccessibleDialog";
import type { ProjectListItem } from "../../../types/project";
import styles from "./ProjectDeleteDialog.module.css";

type Props = {
  project: ProjectListItem;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  focusFallbackId?: string;
};

export function ProjectDeleteDialog({ project, onConfirm, onClose, focusFallbackId = "project-search" }: Props) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const pendingRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => { if (!pendingRef.current) onClose(); };

  useAccessibleDialog(dialogRef, close, focusFallbackId);
  useEffect(() => { deleteRef.current?.focus(); }, []);

  async function confirm() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch {
      setError("削除できませんでした。通信状況を確認して、もう一度お試しください。");
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <div className={styles.overlay} role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div className={styles.dialog} role="dialog" aria-modal="true"
        aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
        tabIndex={-1} ref={dialogRef}>
        <header className={styles.header}>
          <h2 id={`${id}-title`}>プロジェクトを削除</h2>
          <button type="button" className={styles.close} aria-label="閉じる"
            disabled={pending} onClick={close}>×</button>
        </header>
        <div className={styles.body}>
          <div id={`${id}-description`}>
            <p className={styles.warning}>この操作は取り消せません。</p>
            <div className={styles.target}>
              <strong>{project.name}</strong>
              <span>{project.type === "EVENT" ? "イベント" : "継続"}・
                {project.status === "ARCHIVED" ? "アーカイブ済み" : "利用中"}</span>
            </div>
            <p>このプロジェクトと支出・精算の記録は Spendy から見られなくなります。</p>
          </div>
          {error ? <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.danger} ref={deleteRef}
              disabled={pending} onClick={() => void confirm()}>
              {pending ? "削除中…" : "削除する"}
            </button>
            <button type="button" className={styles.cancel} disabled={pending} onClick={close}>
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
