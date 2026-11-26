import { useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../../../api/client";
import { FieldError } from "../../../components/common/FieldError";
import type { ProjectMember } from "../../../types/project";
import styles from "./ProjectMemberEditor.module.css";

type Props = {
  members: ProjectMember[];
  onAdd: (name: string) => Promise<void>;
  onRename: (memberId: string, name: string) => Promise<void>;
};

function memberError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "VALIDATION_ERROR": return "メンバー名を確認してください。100文字以内で入力してください。";
      case "PROJECT_ARCHIVED": return "アーカイブ済みのプロジェクトは変更できません。";
      case "PROJECT_NOT_FOUND": return "プロジェクトが見つかりません。";
      case "MEMBER_NOT_FOUND": return "メンバーが見つかりません。";
      case "MEMBER_INACTIVE": return "利用停止中のメンバーは名前を変更できません。";
      case "MEMBER_DISPLAY_ORDER_CONFLICT": return "メンバーを追加できませんでした。もう一度お試しください。";
      default: break;
    }
  }
  return "メンバーを保存できませんでした。通信状況を確認して、もう一度お試しください。";
}

export function ProjectMemberEditor({ members, onAdd, onRename }: Props) {
  const id = useId();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [returnFocusId, setReturnFocusId] = useState<string | null>(null);
  const renameTriggerRef = useRef<HTMLButtonElement>(null);
  const [editingName, setEditingName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [errorTarget, setErrorTarget] = useState<"add" | "rename" | null>(null);
  const [notice, setNotice] = useState("");

  useLayoutEffect(() => {
    if (returnFocusId && editingId === null && !pending && renameTriggerRef.current) {
      renameTriggerRef.current.focus();
      setReturnFocusId(null);
    }
  }, [returnFocusId, editingId, pending, members]);

  const submit = async (event: FormEvent<HTMLFormElement>, memberId?: string) => {
    event.preventDefault();
    if (pending) return;
    const trimmed = (memberId ? editingName : name).trim();
    if (!trimmed || trimmed.length > 100) {
      setError("メンバー名を1〜100文字で入力してください。");
      setErrorTarget(memberId ? "rename" : "add");
      return;
    }
    setPending(true);
    setError("");
    setErrorTarget(null);
    setNotice("");
    try {
      if (memberId) {
        await onRename(memberId, trimmed);
        setEditingId(null);
        setReturnFocusId(memberId);
        setNotice("メンバー名を変更しました。");
      } else {
        await onAdd(trimmed);
        setName("");
        setNotice("メンバーを追加しました。");
      }
    } catch (failure) {
      setError(memberError(failure));
      setErrorTarget(memberId ? "rename" : "add");
    } finally {
      setPending(false);
    }
  };

  return (
    <details className={styles.editor}>
      <summary>メンバーを管理</summary>
      <div className={styles.body}>
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor={`${id}-add`}>新しいメンバー</label>
          <div className={styles.row}>
            <input id={`${id}-add`} value={name} maxLength={100} disabled={pending}
              aria-invalid={Boolean(error) && errorTarget === "add" || undefined}
              aria-describedby={error && errorTarget === "add" ? `${id}-error` : undefined}
              onChange={(event) => { setName(event.target.value); setError(""); }} />
            <button type="submit" disabled={pending}>{pending ? "保存中…" : "追加"}</button>
          </div>
        </form>
        <ul className={styles.list}>
          {members.filter((member) => member.active).map((member) => (
            <li key={member.id}>
              {editingId === member.id ? (
                <form onSubmit={(event) => void submit(event, member.id)}>
                  <label htmlFor={`${id}-${member.id}`}>{member.displayName}の名前</label>
                  <div className={styles.row}>
                    <input id={`${id}-${member.id}`} value={editingName} maxLength={100} autoFocus
                      aria-invalid={Boolean(error) && errorTarget === "rename" || undefined}
                      aria-describedby={error && errorTarget === "rename" ? `${id}-error` : undefined}
                      disabled={pending} onChange={(event) => { setEditingName(event.target.value); setError(""); }} />
                    <button type="submit" disabled={pending}>{pending ? "保存中…" : "保存"}</button>
                    <button type="button" disabled={pending} onClick={() => {
                      setEditingId(null);
                      setReturnFocusId(member.id);
                      setError("");
                    }}>
                      キャンセル
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.memberRow}>
                  <span>{member.displayName}</span>
                  <button type="button" ref={member.id === returnFocusId ? renameTriggerRef : undefined}
                    disabled={pending} aria-label={`${member.displayName}の名前を変更`}
                    onClick={() => { setEditingId(member.id); setEditingName(member.name); setError(""); setNotice(""); }}>
                    名前を変更
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {error ? <FieldError id={`${id}-error`} message={error} /> : null}
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      </div>
    </details>
  );
}
