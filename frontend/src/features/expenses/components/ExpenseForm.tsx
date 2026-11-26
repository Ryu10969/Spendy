import { useId } from "react";
import type { ExpenseCategory } from "../../../api/expenseApi";
import { MAX_EXPENSE_AMOUNT_YEN } from "../../../api/expenseApi";
import { FieldError } from "../../../components/common/FieldError";
import type { ProjectMember } from "../../../types/project";
import { expenseCategoryOptions } from "../expenseCategories";
import { ExpenseDateInput } from "./ExpenseDateInput";
import { ExpenseSelect } from "./ExpenseSelect";
import { parseCalendarDate } from "./calendarDates";
import styles from "./ExpenseForm.module.css";

export type ExpenseFormState = {
  payerId: string;
  participantIds: string[];
  amount: string;
  content: string;
  date: string;
  categoryKey: ExpenseCategory | "";
  memo: string;
};

export type ExpenseFormErrors = Partial<Record<"amount" | "content" | "date" | "payer" | "participants", string>>;

export function validateExpenseForm(form: ExpenseFormState): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  const amount = form.amount.trim();
  if (!amount) errors.amount = "金額を入力してください。";
  else if (!/^\d+$/.test(amount)) errors.amount = "金額は小数を含まない正の整数で入力してください。";
  else if (Number(amount) <= 0) errors.amount = "金額は0より大きい値を入力してください。";
  else if (Number(amount) > MAX_EXPENSE_AMOUNT_YEN) errors.amount = "金額が大きすぎます。整数として正確に扱える範囲で入力してください。";
  if (!form.content.trim()) errors.content = "内容を入力してください。";
  if (!form.date) errors.date = "日付を入力してください。";
  else if (!parseCalendarDate(form.date)) errors.date = "0001〜9999年の有効な日付をYYYY-MM-DDで入力してください。";
  if (!form.payerId) errors.payer = "支払者を選択してください。";
  if (form.participantIds.length === 0) errors.participants = "割り勘メンバーを1人以上選択してください。";
  return errors;
}

export function focusFirstExpenseError(container: HTMLElement | null, errors: ExpenseFormErrors): void {
  const first = (["amount", "content", "date", "payer", "participants"] as const)
    .find((field) => errors[field]);
  if (first) container?.querySelector<HTMLElement>(`[data-expense-field="${first}"]`)?.focus();
}

export function toExpenseRequest(form: ExpenseFormState) {
  return {
    payerMemberId: form.payerId,
    participantMemberIds: form.participantIds,
    amount: Number(form.amount.trim()),
    content: form.content.trim(),
    category: form.categoryKey || null,
    note: form.memo.trim() || null,
    paidOn: form.date,
  };
}

type ExpenseFormProps = {
  form: ExpenseFormState;
  errors: ExpenseFormErrors;
  members: ProjectMember[];
  useChoiceCards?: boolean;
  onChange: (form: ExpenseFormState, field: keyof ExpenseFormErrors | "categoryKey" | "memo") => void;
};

export function ExpenseForm({ form, errors, members, onChange, useChoiceCards = false }: ExpenseFormProps) {
  const id = useId();
  const update = <K extends keyof ExpenseFormState>(field: K, value: ExpenseFormState[K], errorField: keyof ExpenseFormErrors | "categoryKey" | "memo" = field as keyof ExpenseFormErrors) =>
    onChange({ ...form, [field]: value }, errorField);
  const describedBy = (field: keyof ExpenseFormErrors) => errors[field] ? `${id}-${field}-error` : undefined;

  return (
    <div className={useChoiceCards ? `${styles.fields} ${styles.choiceCards}` : styles.fields}>
      <div className={styles.main}>
        <div className={styles.primaryFields}>
          <div className={styles.field}>
            <label htmlFor={`${id}-amount`}>金額 <span className={styles.currency}>（JPY）</span></label>
            <div className={styles.amountWrap}>
              <span aria-hidden="true">¥</span>
              <input id={`${id}-amount`} data-expense-field="amount" className={`${styles.control} ${styles.amount}`}
                type="text" inputMode="numeric" value={form.amount} placeholder="0" aria-required="true"
                aria-invalid={Boolean(errors.amount)} aria-describedby={describedBy("amount")}
                onChange={(event) => update("amount", event.target.value)} />
            </div>
            {errors.amount && <FieldError id={`${id}-amount-error`} message={errors.amount} />}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-content`}>支出名 <span aria-hidden="true" className={styles.required}>*</span></label>
            <input id={`${id}-content`} data-expense-field="content" className={styles.control} type="text"
              maxLength={100} value={form.content} aria-required="true" aria-invalid={Boolean(errors.content)}
              aria-describedby={describedBy("content")} onChange={(event) => update("content", event.target.value)} />
            {errors.content && <FieldError id={`${id}-content-error`} message={errors.content} />}
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-date`}>支払日</label>
            <ExpenseDateInput id={`${id}-date`} value={form.date} invalid={Boolean(errors.date)}
              describedBy={[`${id}-date-hint`, describedBy("date")].filter(Boolean).join(" ")}
              onChange={(value) => update("date", value)} />
            <p className={styles.hint} id={`${id}-date-hint`}>YYYY-MM-DDで入力、またはカレンダーで選択。月の所属は支払日で決まります。</p>
            {errors.date && <FieldError id={`${id}-date-error`} message={errors.date} />}
          </div>
          <div className={styles.field}>
            <label id={`${id}-payer-label`} htmlFor={`${id}-payer`}>支払者</label>
            <ExpenseSelect id={`${id}-payer`} labelId={`${id}-payer-label`} expenseField="payer" value={form.payerId}
              required invalid={Boolean(errors.payer)} describedBy={describedBy("payer")}
              placeholder="支払者を選択"
              options={members.map((member) => ({ value: member.id,
                label: `${member.displayName}${member.active === false ? "（無効）" : ""}` }))}
              onChange={(value) => update("payerId", value, "payer")} />
            {errors.payer && <FieldError id={`${id}-payer-error`} message={errors.payer} />}
          </div>
        </div>
        <fieldset className={styles.participants} aria-invalid={Boolean(errors.participants)}
          aria-describedby={[`${id}-rounding-note`, describedBy("participants")].filter(Boolean).join(" ")}>
          <legend>割り勘メンバー</legend>
          <div className={styles.memberList}>
            {members.map((member) => <label key={member.id} className={styles.member}>
              <input type="checkbox" data-expense-field="participants" checked={form.participantIds.includes(member.id)}
                onChange={() => update("participantIds", form.participantIds.includes(member.id)
                  ? form.participantIds.filter((id) => id !== member.id) : [...form.participantIds, member.id], "participants")} />
              <span>{member.displayName}{member.active === false ? "（無効）" : ""}</span>
            </label>)}
          </div>
          {errors.participants && <FieldError id={`${id}-participants-error`} message={errors.participants} />}
          <p className={styles.splitNote}>割り勘方式　均等割り</p>
          <p className={styles.roundingNote} id={`${id}-rounding-note`}>
            割り切れない端数は1円単位で自動調整し、合計が支出額と一致するよう配分します。
          </p>
        </fieldset>
      </div>
      <div className={styles.optionalFields}>
        <div className={styles.field}>
          <label id={`${id}-category-label`} htmlFor={`${id}-category`}>カテゴリ <span className={styles.optional}>（任意）</span></label>
          <ExpenseSelect id={`${id}-category`} labelId={`${id}-category-label`} value={form.categoryKey}
            placeholder="カテゴリーを選択（任意）" clearLabel="カテゴリーの選択をクリア"
            options={expenseCategoryOptions.map((option) => ({ value: option.key, label: option.label }))}
            onChange={(value) => update("categoryKey", value as ExpenseCategory | "")} />
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-memo`}>メモ <span className={styles.optional}>（任意）</span></label>
          <textarea id={`${id}-memo`} className={styles.control} value={form.memo} maxLength={1000} rows={3}
            onChange={(event) => update("memo", event.target.value)} />
        </div>
      </div>
    </div>
  );
}
