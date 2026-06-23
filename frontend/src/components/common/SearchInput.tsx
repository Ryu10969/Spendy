import styles from "./SearchInput.module.css";

type SearchInputProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function SearchInput({ id, label, value, placeholder, onChange }: SearchInputProps) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.control}>
        <span className={styles.icon} aria-hidden="true">
          ⌕
        </span>
        <input
          id={id}
          className={styles.input}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {value ? (
          <button className={styles.clearButton} type="button" onClick={() => onChange("")}>
            クリア
          </button>
        ) : null}
      </div>
    </div>
  );
}
