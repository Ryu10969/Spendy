import {
  SETTLEMENT_STRATEGIES,
  SETTLEMENT_STRATEGY_LABELS,
  type SettlementStrategy,
} from "../../../api/settlementApi";
import styles from "./SettlementStrategySelector.module.css";

type SettlementStrategySelectorProps = {
  name: string;
  value: SettlementStrategy;
  onChange: (value: SettlementStrategy) => void;
  counts?: Partial<Record<SettlementStrategy, number>>;
};

export function SettlementStrategySelector({
  name,
  value,
  onChange,
  counts,
}: SettlementStrategySelectorProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>精算方式</legend>
      <div className={styles.options}>
        {SETTLEMENT_STRATEGIES.map((strategy) => {
          const isSelected = value === strategy;

          return (
            <label
              key={strategy}
              className={`${styles.option} ${isSelected ? styles.selected : ""}`}
            >
              <input
                className={styles.input}
                type="radio"
                name={name}
                value={strategy}
                checked={isSelected}
                onChange={() => onChange(strategy)}
              />
              <span className={styles.marker} aria-hidden="true" />
              <span className={styles.content}>
                <span className={styles.label}>{SETTLEMENT_STRATEGY_LABELS[strategy]}</span>
                {counts?.[strategy] !== undefined ? (
                  <strong className={styles.count}>{counts[strategy]}件</strong>
                ) : null}
                <span className={styles.caption}>
                  {strategy === "FEWER_TRANSFERS"
                    ? "送金回数を抑える方式"
                    : "メンバー順に組み合わせる方式"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
