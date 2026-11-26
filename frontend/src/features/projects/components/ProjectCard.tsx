import { Link } from "react-router-dom";
import type { ProjectListItem } from "../../../types/project";
import continuousImage from "../../../assets/projects/default-continuous.webp";
import eventImage from "../../../assets/projects/default-event.webp";
import { formatYen } from "../../../utils/formatMoney";
import { ProjectTypeBadge } from "./ProjectTypeBadge";
import styles from "./ProjectCard.module.css";

type ProjectCardProps = {
  project: ProjectListItem;
  onDelete: (project: ProjectListItem) => void;
};

function MetaIcon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>;
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const isArchived = project.status === "ARCHIVED";
  const isEvent = project.type === "EVENT";

  return (
    <article className={`${styles.card} ${isEvent ? styles.event : ""} ${isArchived ? styles.archived : ""}`}>
      <Link className={styles.navigation} to={`/p/${project.publicToken}`}>
        <img className={styles.thumbnail} src={isEvent ? eventImage : continuousImage} alt="" />
        <span className={styles.body}>
          <strong className={styles.title}>{project.name}</strong>
          <span className={styles.badges}>
            <ProjectTypeBadge type={project.type} />
            {isArchived ? <span className={styles.archivedStatus}>アーカイブ済み・閲覧のみ</span> : null}
          </span>
          <span className={styles.metadata}>
            <span aria-label={`メンバー ${project.members.length}人`}><MetaIcon path="M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0M3 21v-3c0-5 18-5 18 0v3ZM18 4a3 3 0 0 1 0 6" />{project.members.length}人</span>
            <span aria-label={`支出 ${project.summary.expenseCount}件`}><MetaIcon path="M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4" />{project.summary.expenseCount}件</span>
            <span><MetaIcon path="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 3" />更新 {project.summary.lastUpdatedLabel}</span>
          </span>
          {/* Provisional placement of the optional settlement count. */}
          {project.summary.pendingSettlementCount != null ? (
            <span className={styles.supplement}>未精算 {project.summary.pendingSettlementCount}件</span>
          ) : null}
        </span>
        <span className={styles.spending}>
          <span>全期間の支出</span>
          <strong className={styles.amount}>{formatYen(project.summary.totalExpenseYen)}</strong>
        </span>
      </Link>
      <details className={styles.actions}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}>
        <summary className={styles.more} aria-label={`${project.name}の操作`}><span aria-hidden="true">⋮</span></summary>
        <div className={styles.actionPanel}>
          <button type="button" className={styles.deleteButton} aria-label={`${project.name}を削除`}
            onClick={(event) => {
              const details = event.currentTarget.closest("details");
              if (details) {
                details.open = false;
                details.querySelector("summary")?.focus();
              }
              onDelete(project);
            }}>プロジェクトを削除</button>
        </div>
      </details>
    </article>
  );
}
