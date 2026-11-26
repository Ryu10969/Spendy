import type { ProjectType } from "../../../types/project";
import styles from "./ProjectTypeSelector.module.css";

type ProjectTypeOption = {
  value: ProjectType;
  icon: string;
  label: string;
  description: string;
};

const projectTypeOptions: ProjectTypeOption[] = [
  {
    value: "CONTINUOUS",
    icon: "🏠",
    label: "継続",
    description: "ルームメイト・カップル・家族など継続的な費用を管理",
  },
  {
    value: "EVENT",
    icon: "✈️",
    label: "イベント",
    description: "旅行・パーティーなど一回限りのグループイベント",
  },
];

type ProjectTypeSelectorProps = {
  name: string;
  value: ProjectType;
  onChange: (value: ProjectType) => void;
};

export function ProjectTypeSelector({ name, value, onChange }: ProjectTypeSelectorProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>プロジェクトタイプ</legend>
      <div className={styles.options}>
        {projectTypeOptions.map((option) => {
          const descriptionId = `${name}-${option.value.toLowerCase()}-description`;
          const isSelected = value === option.value;

          return (
            <label
              key={option.value}
              className={`${styles.option} ${isSelected ? styles.selected : ""}`}
            >
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={option.value}
                checked={isSelected}
                aria-describedby={descriptionId}
                onChange={() => onChange(option.value)}
              />
              <span className={styles.icon} aria-hidden="true">
                {option.icon}
              </span>
              <span className={styles.label}>{option.label}</span>
              <span className={styles.description} id={descriptionId}>
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
