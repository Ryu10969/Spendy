import type { ProjectType } from "../../../types/project";
import styles from "./ProjectTypeBadge.module.css";

type ProjectTypeBadgeProps = {
  type: ProjectType;
};

const projectTypeLabels: Record<ProjectType, string> = {
  CONTINUOUS: "継続",
  EVENT: "イベント",
};

export function ProjectTypeBadge({ type }: ProjectTypeBadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[type.toLowerCase()]}`}>
      {projectTypeLabels[type]}
    </span>
  );
}
