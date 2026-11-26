import type { MemberComparisonItem } from "../../../types/project";
import { formatYen } from "../../../utils/formatMoney";
import styles from "./MemberComparison.module.css";

type MemberComparisonProps = {
  items: MemberComparisonItem[];
};

export function MemberComparison({ items }: MemberComparisonProps) {
  const maxValue = items.reduce(
    (max, item) => Math.max(max, item.paidYen, item.burdenYen),
    0,
  );

  const toHeight = (value: number) => (maxValue > 0 ? `${(value / maxValue) * 100}%` : "0%");

  return (
    <div className={styles.wrapper}>
      <ul className={styles.chart}>
        {items.map((item) => (
          <li key={item.id} className={styles.column}>
            <div className={styles.bars} aria-hidden="true">
              <span className={`${styles.bar} ${styles.paid}`} style={{ height: toHeight(item.paidYen) }} />
              <span className={`${styles.bar} ${styles.burden}`} style={{ height: toHeight(item.burdenYen) }} />
            </div>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.srValue}>
              {item.name}：支払額 {formatYen(item.paidYen)}、負担額 {formatYen(item.burdenYen)}
            </span>
          </li>
        ))}
      </ul>

      <div className={styles.keys}>
        <span className={styles.key}>
          <span className={`${styles.keyDot} ${styles.paid}`} aria-hidden="true" />
          支払額
        </span>
        <span className={styles.key}>
          <span className={`${styles.keyDot} ${styles.burden}`} aria-hidden="true" />
          負担額
        </span>
      </div>
    </div>
  );
}
