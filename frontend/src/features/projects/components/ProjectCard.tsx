import { Link } from "react-router-dom";
import type { ProjectListItem } from "../../../types/project";
import { formatSignedYen, formatYen } from "../../../utils/formatMoney";
import { MemberAvatarGroup } from "./MemberAvatarGroup";
import { ProjectTypeBadge } from "./ProjectTypeBadge";
import styles from "./ProjectCard.module.css";

type ProjectCardProps = {
  project: ProjectListItem;
};

export function ProjectCard({ project }: ProjectCardProps) {
  const isArchived = project.status === "ARCHIVED";
  const linkLabel = isArchived
    ? `${project.name} の詳細を開く。アーカイブ済み・閲覧のみ。`
    : `${project.name} の詳細を開く`;
  const settlementLabel =
    project.summary.pendingSettlementCount > 0
      ? `精算待ち ${project.summary.pendingSettlementCount}件`
      : "精算済み";

  return (
    <Link
      className={`${styles.card} ${isArchived ? styles.archived : ""}`}
      to={`/p/${project.publicToken}`}
      aria-label={linkLabel}
    >
      <div className={styles.header}>
        <span className={styles.projectIcon} aria-hidden="true">
          {project.icon}
        </span>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <h3 className={styles.title}>{project.name}</h3>
            <ProjectTypeBadge type={project.type} />
          </div>
          <p className={styles.description}>{project.summary.description}</p>
        </div>
        {isArchived ? <span className={styles.readOnlyPill}>閲覧のみ</span> : null}
      </div>

      <div className={styles.metaRow}>
        <MemberAvatarGroup members={project.members} />
        <span className={styles.updated}>◷ {project.summary.lastUpdatedLabel}</span>
      </div>

      <dl className={styles.summaryGrid}>
        <div className={styles.summaryItem}>
          <dt>合計</dt>
          <dd>{formatYen(project.summary.totalExpenseYen)}</dd>
        </div>
        <div className={styles.summaryItem}>
          <dt>件数</dt>
          <dd>{project.summary.expenseCount}</dd>
        </div>
        <div className={`${styles.summaryItem} ${styles.balanceItem}`}>
          <dt>収支サマリー</dt>
          <dd className={project.summary.balanceYen >= 0 ? styles.positive : styles.negative}>
            {formatSignedYen(project.summary.balanceYen)}
          </dd>
        </div>
      </dl>

      <div className={styles.footer}>
        <span className={project.summary.pendingSettlementCount > 0 ? styles.waitingPill : styles.donePill}>
          {settlementLabel}
        </span>
        <span className={styles.chevron} aria-hidden="true">
          ›
        </span>
      </div>
    </Link>
  );
}
