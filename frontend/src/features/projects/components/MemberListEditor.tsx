import { useState } from "react";
import type { KeyboardEvent, Ref } from "react";
import { FieldError } from "../../../components/common/FieldError";
import type { ProjectFormMember } from "../../../types/project";
import styles from "./MemberListEditor.module.css";

type MemberListEditorProps = {
  members: ProjectFormMember[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  error?: string;
  errorId: string;
  inputRef?: Ref<HTMLInputElement>;
};

const inputId = "project-member-input";
const blankErrorId = "project-member-blank-error";

export function MemberListEditor({
  members,
  onAdd,
  onRemove,
  error,
  errorId,
  inputRef,
}: MemberListEditorProps) {
  const [draft, setDraft] = useState("");
  const [blankError, setBlankError] = useState("");

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setBlankError("メンバー名を入力してください。");
      return;
    }

    onAdd(trimmed);
    setDraft("");
    setBlankError("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleAdd();
    }
  };

  const describedBy = [blankError ? blankErrorId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={styles.editor}>
      <label className={styles.label} htmlFor={inputId}>
        メンバー
      </label>
      <div className={styles.inputRow}>
        <input
          id={inputId}
          ref={inputRef}
          className={styles.input}
          type="text"
          value={draft}
          placeholder="メンバー名を入力"
          aria-invalid={blankError || error ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            if (blankError) {
              setBlankError("");
            }
          }}
          onKeyDown={handleKeyDown}
        />
        <button className={styles.addButton} type="button" onClick={handleAdd}>
          <span aria-hidden="true">＋</span>
          <span>追加</span>
        </button>
      </div>

      {blankError ? <FieldError id={blankErrorId} message={blankError} /> : null}
      {error ? <FieldError id={errorId} message={error} /> : null}

      {members.length > 0 ? (
        <ul className={styles.memberList}>
          {members.map((member) => (
            <li key={member.id} className={styles.memberItem}>
              <span className={styles.memberName}>{member.name}</span>
              <button
                className={styles.removeButton}
                type="button"
                aria-label={`メンバー「${member.name}」を削除`}
                onClick={() => onRemove(member.id)}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.emptyHint}>メンバーを1人以上追加してください。</p>
      )}
    </div>
  );
}
