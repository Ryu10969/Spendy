import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  createInitialProjectCreateForm,
  createMemberInput,
  getTrimmedMemberNames,
  hasProjectCreateErrors,
  projectTypeOptions,
  roundingUnitOptions,
  validateProjectCreateForm,
  type ProjectCreateFormValues,
  type ProjectCreateValidationErrors,
  type RoundingUnit,
} from "../../features/projects/projectCreateForm";
import type { ProjectType } from "../../types/project";
import styles from "./ProjectCreatePage.module.css";

const pageTitleId = "project-create-title";
const projectTypeErrorId = "project-type-error";
const projectNameErrorId = "project-name-error";
const roundingUnitErrorId = "rounding-unit-error";
const membersErrorId = "members-error";

export function ProjectCreatePage() {
  const [formValues, setFormValues] = useState<ProjectCreateFormValues>(() =>
    createInitialProjectCreateForm(),
  );
  const [errors, setErrors] = useState<ProjectCreateValidationErrors>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const memberInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const validateNextValues = (nextValues: ProjectCreateFormValues) => {
    if (hasSubmitted) {
      setErrors(validateProjectCreateForm(nextValues));
    }
  };

  const updateFormValues = (nextValues: ProjectCreateFormValues) => {
    setFormValues(nextValues);
    setSuccessMessage("");
    validateNextValues(nextValues);
  };

  const focusFirstError = (nextErrors: ProjectCreateValidationErrors) => {
    const firstErrorTargetId = nextErrors.projectType
      ? "project-type-continuous"
      : nextErrors.projectName
        ? "project-name"
        : nextErrors.roundingUnit
          ? "rounding-unit-1"
          : nextErrors.members
            ? `member-name-${formValues.members[0]?.id}`
            : "";

    if (!firstErrorTargetId) {
      return;
    }

    window.requestAnimationFrame(() => {
      document.getElementById(firstErrorTargetId)?.focus();
    });
  };

  const handleProjectTypeChange = (projectType: ProjectType) => {
    updateFormValues({ ...formValues, projectType });
  };

  const handleRoundingUnitChange = (roundingUnit: RoundingUnit) => {
    updateFormValues({ ...formValues, roundingUnit });
  };

  const handleMemberNameChange = (memberId: string, memberName: string) => {
    updateFormValues({
      ...formValues,
      members: formValues.members.map((member) =>
        member.id === memberId ? { ...member, name: memberName } : member,
      ),
    });
  };

  const handleAddMember = () => {
    const nextMember = createMemberInput();
    updateFormValues({
      ...formValues,
      members: [...formValues.members, nextMember],
    });

    window.requestAnimationFrame(() => {
      memberInputRefs.current[nextMember.id]?.focus();
    });
  };

  const handleRemoveMember = (memberId: string) => {
    const nextMembers = formValues.members.filter((member) => member.id !== memberId);
    updateFormValues({
      ...formValues,
      members: nextMembers.length > 0 ? nextMembers : [createMemberInput()],
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validateProjectCreateForm(formValues);
    setHasSubmitted(true);
    setErrors(nextErrors);

    if (hasProjectCreateErrors(nextErrors)) {
      setSuccessMessage("");
      focusFirstError(nextErrors);
      return;
    }

    const memberNames = getTrimmedMemberNames(formValues);
    setSuccessMessage(
      `入力内容の検証が完了しました。API未接続のため保存は行わず、${memberNames.length}人のメンバーを含む作成内容をこの画面で確認しています。`,
    );
  };

  const memberNames = getTrimmedMemberNames(formValues);
  const hasAnyError = hasProjectCreateErrors(errors);

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/">プロジェクト</Link>
        <span aria-hidden="true">›</span>
        <span>新規作成</span>
      </nav>

      <Link className={styles.backLink} to="/">
        <span aria-hidden="true">←</span>
        戻る
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title} id={pageTitleId}>
          新規プロジェクト作成
        </h1>
        <p className={styles.subtitle}>
          継続的な共同費用、または一回限りのイベント費用を管理するプロジェクトを作成します。
        </p>
      </header>

      <form className={styles.form} aria-labelledby={pageTitleId} noValidate onSubmit={handleSubmit}>
        {hasAnyError ? (
          <div className={styles.errorSummary} role="alert" aria-labelledby="project-create-errors">
            <p className={styles.errorSummaryTitle} id="project-create-errors">
              入力内容を確認してください
            </p>
            <ul className={styles.errorSummaryList}>
              {errors.projectType ? <li>{errors.projectType}</li> : null}
              {errors.projectName ? <li>{errors.projectName}</li> : null}
              {errors.roundingUnit ? <li>{errors.roundingUnit}</li> : null}
              {errors.members ? <li>{errors.members}</li> : null}
            </ul>
          </div>
        ) : null}

        {successMessage ? (
          <div className={styles.successMessage} role="status">
            {successMessage}
          </div>
        ) : null}

        <fieldset
          className={styles.fieldset}
          aria-describedby={errors.projectType ? projectTypeErrorId : undefined}
        >
          <legend className={styles.legend}>プロジェクトタイプ</legend>
          <div className={styles.projectTypeGrid}>
            {projectTypeOptions.map((option) => {
              const inputId = `project-type-${option.value.toLocaleLowerCase()}`;
              const isSelected = formValues.projectType === option.value;

              return (
                <label
                  key={option.value}
                  className={`${styles.projectTypeCard} ${
                    isSelected ? styles.projectTypeCardSelected : ""
                  }`}
                  htmlFor={inputId}
                >
                  <input
                    className={styles.visuallyHiddenInput}
                    type="radio"
                    id={inputId}
                    name="projectType"
                    value={option.value}
                    checked={isSelected}
                    aria-invalid={Boolean(errors.projectType)}
                    onChange={() => handleProjectTypeChange(option.value)}
                  />
                  <span className={styles.projectTypeIcon} aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className={styles.projectTypeLabel}>{option.label}</span>
                  <span className={styles.projectTypeDescription}>{option.description}</span>
                </label>
              );
            })}
          </div>
          {errors.projectType ? (
            <p className={styles.errorText} id={projectTypeErrorId}>
              {errors.projectType}
            </p>
          ) : null}
        </fieldset>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="project-name">
            プロジェクト名 <span className={styles.requiredMark}>*</span>
          </label>
          <input
            className={styles.textInput}
            id="project-name"
            name="projectName"
            type="text"
            value={formValues.projectName}
            placeholder="例: 共同生活費、東京旅行"
            aria-invalid={Boolean(errors.projectName)}
            aria-describedby={errors.projectName ? projectNameErrorId : undefined}
            onChange={(event) =>
              updateFormValues({ ...formValues, projectName: event.target.value })
            }
          />
          {errors.projectName ? (
            <p className={styles.errorText} id={projectNameErrorId}>
              {errors.projectName}
            </p>
          ) : null}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="project-description">
            説明 <span className={styles.optionalText}>任意</span>
          </label>
          <textarea
            className={styles.textarea}
            id="project-description"
            name="description"
            value={formValues.description}
            placeholder="プロジェクトの簡単な説明..."
            rows={4}
            onChange={(event) =>
              updateFormValues({ ...formValues, description: event.target.value })
            }
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="project-currency">
            通貨
          </label>
          <div className={styles.currencyRow}>
            <input
              className={`${styles.textInput} ${styles.currencyInput}`}
              id="project-currency"
              name="currency"
              type="text"
              value="JPY (¥)"
              readOnly
              aria-describedby="project-currency-note"
            />
            <span className={styles.fixedBadge} id="project-currency-note">
              固定
            </span>
          </div>
        </div>

        <fieldset
          className={styles.fieldset}
          aria-describedby={errors.roundingUnit ? roundingUnitErrorId : undefined}
        >
          <legend className={styles.legend}>端数処理単位</legend>
          <div className={styles.roundingGrid}>
            {roundingUnitOptions.map((option) => {
              const inputId = `rounding-unit-${option.value}`;
              const isSelected = formValues.roundingUnit === option.value;

              return (
                <label
                  key={option.value}
                  className={`${styles.roundingOption} ${
                    isSelected ? styles.roundingOptionSelected : ""
                  }`}
                  htmlFor={inputId}
                >
                  <input
                    className={styles.visuallyHiddenInput}
                    type="radio"
                    id={inputId}
                    name="roundingUnit"
                    value={option.value}
                    checked={isSelected}
                    aria-invalid={Boolean(errors.roundingUnit)}
                    onChange={() => handleRoundingUnitChange(option.value)}
                  />
                  {option.label}
                </label>
              );
            })}
          </div>
          {errors.roundingUnit ? (
            <p className={styles.errorText} id={roundingUnitErrorId}>
              {errors.roundingUnit}
            </p>
          ) : null}
        </fieldset>

        <fieldset
          className={styles.fieldset}
          aria-describedby={errors.members ? membersErrorId : "members-help-text"}
        >
          <legend className={styles.legend}>メンバー</legend>
          <p className={styles.helpText} id="members-help-text">
            メンバーはこのプロジェクト内だけの参加者です。アカウント作成は不要です。
          </p>
          <div className={styles.memberList}>
            {formValues.members.map((member, index) => {
              const memberInputId = `member-name-${member.id}`;

              return (
                <div className={styles.memberRow} key={member.id}>
                  <label className={styles.memberLabel} htmlFor={memberInputId}>
                    メンバー {index + 1}
                  </label>
                  <input
                    className={styles.textInput}
                    id={memberInputId}
                    name={memberInputId}
                    type="text"
                    value={member.name}
                    placeholder="メンバー名を入力"
                    aria-invalid={Boolean(errors.members && memberNames.length === 0)}
                    aria-describedby={errors.members ? membersErrorId : undefined}
                    ref={(element) => {
                      memberInputRefs.current[member.id] = element;
                    }}
                    onChange={(event) => handleMemberNameChange(member.id, event.target.value)}
                  />
                  <button
                    className={styles.removeMemberButton}
                    type="button"
                    onClick={() => handleRemoveMember(member.id)}
                    aria-label={`メンバー ${index + 1} の入力行を削除`}
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
          <button className={styles.addMemberButton} type="button" onClick={handleAddMember}>
            <span aria-hidden="true">＋</span>
            追加
          </button>
          {errors.members ? (
            <p className={styles.errorText} id={membersErrorId}>
              {errors.members}
            </p>
          ) : null}
        </fieldset>

        <div className={styles.actions}>
          <Link className={styles.secondaryAction} to="/">
            キャンセル
          </Link>
          <button className={styles.primaryAction} type="submit">
            プロジェクトを作成
          </button>
        </div>
      </form>
    </div>
  );
}
