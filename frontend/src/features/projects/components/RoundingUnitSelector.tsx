import type { RoundingUnit } from "../../../types/project";
import styles from "./RoundingUnitSelector.module.css";

type RoundingUnitOption = {
  value: RoundingUnit;
  label: string;
};

const roundingUnitOptions: RoundingUnitOption[] = [
  { value: 1, label: "¥1" },
  { value: 10, label: "¥10" },
  { value: 100, label: "¥100" },
  { value: 1000, label: "¥1,000" },
];

type RoundingUnitSelectorProps = {
  name: string;
  value: RoundingUnit;
  onChange: (value: RoundingUnit) => void;
};

export function RoundingUnitSelector({ name, value, onChange }: RoundingUnitSelectorProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>端数処理単位</legend>
      <div className={styles.options}>
        {roundingUnitOptions.map((option) => {
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
                onChange={() => onChange(option.value)}
              />
              <span className={styles.label}>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
