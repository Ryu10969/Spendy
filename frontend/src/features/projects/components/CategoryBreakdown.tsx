import type { CategoryBreakdownItem } from "../../../types/project";
import { formatYen } from "../../../utils/formatMoney";
import styles from "./CategoryBreakdown.module.css";

type CategoryBreakdownProps = {
  items: CategoryBreakdownItem[];
};

export function CategoryBreakdown({ items }: CategoryBreakdownProps) {
  const total = items.reduce((sum, item) => sum + item.amountYen, 0);

  let cursor = 0;
  const stops = items
    .map((item) => {
      const start = total > 0 ? (cursor / total) * 100 : 0;
      cursor += item.amountYen;
      const end = total > 0 ? (cursor / total) * 100 : 0;
      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div className={styles.wrapper}>
      <div
        className={styles.donut}
        style={{ background: `conic-gradient(${stops})` }}
        role="img"
        aria-label="カテゴリ別支出の割合"
      >
        <span className={styles.donutHole} aria-hidden="true" />
      </div>

      <dl className={styles.legend}>
        {items.map((item) => (
          <div key={item.key} className={styles.legendRow}>
            <dt className={styles.legendLabel}>
              <span className={styles.swatch} style={{ background: item.color }} aria-hidden="true" />
              <span>{item.label}</span>
            </dt>
            <dd className={styles.legendValue}>
              <span className={styles.legendPercent}>{item.percent}%</span>
              <span className={styles.legendAmount}>{formatYen(item.amountYen)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
