import { Link } from "react-router-dom";
import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectMember, ProjectType } from "../../../types/project";
import { formatYen } from "../../../utils/formatMoney";
import { ProjectMemberEditor } from "./ProjectMemberEditor";
import styles from "./ProjectDetailHeader.module.css";

type ProjectDetailHeaderProps = {
  name: string;
  type: ProjectType;
  description: string;
  dateLabel?: string;
  members: ProjectMember[];
  totalExpenseYen: number | bigint;
  expenseCount: number;
  summaryLabel?: string;
  summaryControls?: ReactNode;
  summary?: ReactNode;
  archived?: boolean;
  onAddExpense?: () => void;
  onAddMember?: (name: string) => Promise<void>;
  onRenameMember?: (memberId: string, name: string) => Promise<void>;
};

export function ProjectDetailHeader({
  name,
  type,
  description,
  dateLabel,
  members,
  totalExpenseYen,
  expenseCount,
  summaryLabel,
  summaryControls,
  summary,
  archived = false,
  onAddExpense,
  onAddMember,
  onRenameMember,
}: ProjectDetailHeaderProps) {
  const addExpenseRef = useRef<HTMLButtonElement>(null);
  const [inlineAction, setInlineAction] = useState(false);
  const hasAddExpense = !archived && Boolean(onAddExpense);
  useLayoutEffect(() => {
    const button = addExpenseRef.current;
    const shell = button?.closest<HTMLElement>("[data-app-shell]");
    if (!button || !shell) return;
    const property = "--project-expense-action-reserve";
    const previous = shell.style.getPropertyValue(property);
    const media = window.matchMedia("(max-width: 767px)");
    const restore = () => {
      if (previous) shell.style.setProperty(property, previous);
      else shell.style.removeProperty(property);
    };
    const measure = () => {
      if (!media.matches) { restore(); setInlineAction(false); return; }
      const height = Math.ceil(button.getBoundingClientRect().height);
      const style = window.getComputedStyle(button);
      const safeTop = parseFloat(style.getPropertyValue("--action-safe-top")) || 0;
      const safeBottom = parseFloat(style.getPropertyValue("--action-safe-bottom")) || 0;
      // Leave a 44px navigation scrollport plus its 18px padding/border.
      const fits = window.innerHeight >= height + 16 + 8 + safeBottom + Math.max(8, safeTop) + 62;
      setInlineAction(!fits);
      shell.style.setProperty(property, fits ? `${height + 16}px` : "0px");
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(button);
    media.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", measure);
      window.removeEventListener("resize", measure);
      restore();
    };
  }, [hasAddExpense]);
  return (
    <>
      <nav className={styles.breadcrumb} aria-label="パンくず">
        <Link to="/">プロジェクト</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{name}</span>
      </nav>
      <header className={styles.header}>
        <div className={styles.headingRow}>
          <div className={styles.heading}>
            <p className={styles.eyebrow}>
              {type === "EVENT" ? "イベント" : "継続"}
              {archived ? <span className={styles.archived}>アーカイブ済み</span> : " · 利用中"}
            </p>
            <h1>{name}</h1>
            {dateLabel ? <p className={styles.date}>{dateLabel}</p> : null}
            {description ? <p className={styles.description}>{description}</p> : null}
            <p className={styles.members}>
              メンバー {members.length}人
              {members.length ? ` · ${members.map((member) => member.displayName).join("、")}` : ""}
            </p>
            {!archived && onAddMember && onRenameMember ? (
              <ProjectMemberEditor members={members} onAdd={onAddMember} onRename={onRenameMember} />
            ) : null}
          </div>
        </div>
        {summary === undefined ? <div className={styles.total} aria-label="合計支出">
          <span className={styles.totalLabel}>
            {summaryLabel ?? (type === "CONTINUOUS" ? "全期間の合計支出" : "合計支出")}
          </span>
          <strong>{formatYen(totalExpenseYen)}</strong>
          <span className={styles.totalCount}>{expenseCount}件 · JPY</span>
        </div> : null}
        {!archived && onAddExpense ? (
          <button
            ref={addExpenseRef}
            data-inline-action={inlineAction || undefined}
            type="button"
            className={styles.addExpense}
            aria-haspopup="dialog"
            onClick={onAddExpense}
          >
            ＋ 支出を追加
          </button>
        ) : null}
        {summaryControls ? <div className={styles.summaryControls}>{summaryControls}</div> : null}
      </header>
      {summary}
    </>
  );
}
