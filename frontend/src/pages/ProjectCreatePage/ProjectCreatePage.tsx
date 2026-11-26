import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FieldError } from "../../components/common/FieldError";
import { MemberListEditor } from "../../features/projects/components/MemberListEditor";
import { ProjectTypeSelector } from "../../features/projects/components/ProjectTypeSelector";
import { RoundingUnitSelector } from "../../features/projects/components/RoundingUnitSelector";
import { useCreateProjectMutation } from "../../features/projects/projectQueries";
import type {
  ProjectCreateFormState,
  ProjectFormMember,
} from "../../types/project";
import styles from "./ProjectCreatePage.module.css";

const initialFormState: ProjectCreateFormState = {
  type: "CONTINUOUS",
  name: "",
  description: "",
  roundingUnit: 10,
  members: [],
};

function createMemberId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `member-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const nameErrorId = "project-name-error";
const membersErrorId = "project-members-error";

export function ProjectCreatePage() {
  const navigate = useNavigate();
  const createProjectMutation = useCreateProjectMutation();
  const [form, setForm] = useState<ProjectCreateFormState>(initialFormState);
  const [nameError, setNameError] = useState("");
  const [membersError, setMembersError] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const memberInputRef = useRef<HTMLInputElement>(null);

  const handleAddMember = (name: string) => {
    const member: ProjectFormMember = { id: createMemberId(), name };
    setForm((current) => ({ ...current, members: [...current.members, member] }));
    setMembersError("");
  };

  const handleRemoveMember = (id: string) => {
    setForm((current) => ({
      ...current,
      members: current.members.filter((member) => member.id !== id),
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (createProjectMutation.isPending) {
      return;
    }

    const trimmedName = form.name.trim();
    let isValid = true;

    if (!trimmedName) {
      setNameError("プロジェクト名を入力してください。");
      isValid = false;
    } else {
      setNameError("");
    }

    if (form.members.length === 0) {
      setMembersError("メンバーを1人以上追加してください。");
      isValid = false;
    } else {
      setMembersError("");
    }

    if (!isValid) {
      if (!trimmedName) {
        nameInputRef.current?.focus();
      } else if (form.members.length === 0) {
        memberInputRef.current?.focus();
      }
      return;
    }

    createProjectMutation.reset();

    try {
      const project = await createProjectMutation.mutateAsync({
        name: trimmedName,
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        type: form.type,
        roundingUnit: form.roundingUnit,
        members: form.members.map((member) => ({ name: member.name })),
      });
      navigate(`/p/${project.publicToken}`);
    } catch {
      // The mutation state renders a safe error while preserving the form values.
    }
  };

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link to="/">プロジェクト</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">新規作成</span>
      </nav>

      <Link className={styles.backLink} to="/">
        <span aria-hidden="true">←</span>
        <span>戻る</span>
      </Link>

      <h1 className={styles.title}>新規プロジェクト作成</h1>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <ProjectTypeSelector
          name="project-type"
          value={form.type}
          onChange={(type) => setForm((current) => ({ ...current, type }))}
        />

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-name">
            プロジェクト名 <span className={styles.required} aria-hidden="true">*</span>
            <span className={styles.srOnly}>（必須）</span>
          </label>
          <input
            id="project-name"
            ref={nameInputRef}
            className={styles.input}
            type="text"
            value={form.name}
            placeholder="例: 共同生活費、東京旅行"
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
            onChange={(event) => {
              const value = event.target.value;
              setForm((current) => ({ ...current, name: value }));
              if (nameError && value.trim()) {
                setNameError("");
              }
            }}
          />
          {nameError ? <FieldError id={nameErrorId} message={nameError} /> : null}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-description">
            説明 <span className={styles.optional}>（任意）</span>
          </label>
          <textarea
            id="project-description"
            className={styles.textarea}
            value={form.description}
            placeholder="プロジェクトの簡単な説明..."
            rows={3}
            onChange={(event) => {
              const value = event.target.value;
              setForm((current) => ({ ...current, description: value }));
            }}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="project-currency">
            通貨
          </label>
          <div className={styles.currencyRow}>
            <input
              id="project-currency"
              className={styles.input}
              type="text"
              value="JPY (¥)"
              readOnly
              disabled
            />
            <span className={styles.currencyNote}>近日対応予定</span>
          </div>
        </div>

        <RoundingUnitSelector
          name="rounding-unit"
          value={form.roundingUnit}
          onChange={(roundingUnit) => setForm((current) => ({ ...current, roundingUnit }))}
        />

        <MemberListEditor
          members={form.members}
          onAdd={handleAddMember}
          onRemove={handleRemoveMember}
          error={membersError}
          errorId={membersErrorId}
          inputRef={memberInputRef}
        />

        {createProjectMutation.isError ? (
          <p className={styles.apiError} role="alert">
            プロジェクトを作成できませんでした。入力内容を確認して、もう一度お試しください。
          </p>
        ) : null}

        <button
          className={styles.submitButton}
          type="submit"
          disabled={createProjectMutation.isPending}
        >
          {createProjectMutation.isPending ? "作成中..." : "プロジェクトを作成"}
        </button>
      </form>
    </div>
  );
}
