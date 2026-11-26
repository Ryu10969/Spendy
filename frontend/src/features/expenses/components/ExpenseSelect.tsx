import { useEffect, useState } from "react";
import { useExpensePicker } from "./useExpensePicker";
import pickerStyles from "./ExpensePicker.module.css";
import styles from "./ExpenseSelect.module.css";

type Props = {
  id: string;
  labelId: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  clearLabel?: string;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  expenseField?: string;
  onChange: (value: string) => void;
};

export function ExpenseSelect({ id, labelId, value, options, placeholder, clearLabel, required, invalid, describedBy, expenseField, onChange }: Props) {
  const { open, setOpen, inline, root, trigger, panel, close } = useExpensePicker();
  const selectedIndex = options.findIndex((option) => option.value === value);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const active = Math.min(activeIndex, options.length - 1);
  const show = () => {
    if (!options.length) return;
    trigger.current?.focus();
    setActiveIndex(Math.max(0, selectedIndex));
    setOpen(true);
  };
  const choose = (index: number) => {
    if (!options[index]) return;
    onChange(options[index].value);
    close();
  };

  useEffect(() => {
    const menu = panel.current;
    const option = menu?.querySelector<HTMLElement>(`[data-option-index="${active}"]`);
    if (!open || !menu || !option) return;
    const bounds = menu.getBoundingClientRect(), item = option.getBoundingClientRect();
    if (item.top < bounds.top) menu.scrollTop -= bounds.top - item.top;
    else if (item.bottom > bounds.bottom) menu.scrollTop += item.bottom - bounds.bottom;
  }, [open, active, inline, panel]);

  return <div ref={root} className={styles.root}
    onBlur={(event) => {
      if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close(false);
    }}
    onKeyDownCapture={(event) => {
      if (open && event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (open && event.key === "Tab") close(false);
    }}>
    <div className={styles.inputRow}>
    <button ref={trigger} id={id} type="button" role="combobox" className={styles.trigger}
      data-expense-field={expenseField} aria-labelledby={`${labelId} ${id}-value`}
      aria-expanded={open} aria-haspopup="listbox" aria-controls={open ? `${id}-listbox` : undefined}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined}
      aria-required={required} aria-invalid={Boolean(invalid)} aria-describedby={describedBy}
      onClick={() => open ? close() : show()}
      onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          if (!open) {
            show();
            if (event.key === "Home") setActiveIndex(0);
            if (event.key === "End") setActiveIndex(options.length - 1);
          }
          else setActiveIndex(event.key === "Home" ? 0 : event.key === "End" ? options.length - 1
            : Math.max(0, Math.min(options.length - 1, active + (event.key === "ArrowDown" ? 1 : -1))));
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (open) choose(active); else show();
        }
      }}>
      <span id={`${id}-value`}>{options[selectedIndex]?.label ?? placeholder}</span>
      <span aria-hidden="true" className={styles.chevron}>⌄</span>
    </button>
    {clearLabel && value ? <button type="button" className={styles.clear} aria-label={clearLabel}
      onClick={() => { onChange(""); close(); }}>クリア</button> : null}
    </div>
    {open ? <div ref={panel} id={`${id}-listbox`} role="listbox" aria-labelledby={labelId}
      popover={inline ? undefined : "manual"}
      className={`${pickerStyles.panel} ${inline ? pickerStyles.inline : ""} ${styles.menu}`}>
      {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option"
        aria-selected={option.value === value} data-option-index={index} data-active={index === active}
        className={styles.option} onMouseDown={(event) => event.preventDefault()}
        onPointerMove={() => setActiveIndex(index)} onClick={() => choose(index)}>
        <span>{option.label}</span><span aria-hidden="true">{option.value === value ? "✓" : ""}</span>
      </div>)}
    </div> : null}
  </div>;
}
