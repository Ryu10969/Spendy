import { expenseCategoryLabels } from "../../expenses/expenseCategories";
import type { ProjectExpenseItem, ProjectMember } from "../../../types/project";
import { formatYen } from "../../../utils/formatMoney";
import styles from "./ProjectExpenseList.module.css";

type ProjectExpenseListProps = {
  id: string;
  expenses: ProjectExpenseItem[];
  members: ProjectMember[];
  onSelect: (id: string) => void;
  adaptToWidth?: boolean;
};

function participantLabel(expense: ProjectExpenseItem, members: ProjectMember[]): string {
  const participantIds = expense.persistedState?.participantMemberIds
    ?? expense.participantAllocations?.map((allocation) => allocation.memberId);
  const memberIds = members.map((member) => member.id);
  if (
    participantIds?.length
    && memberIds.length === participantIds.length
    && new Set(memberIds).size === memberIds.length
    && new Set(participantIds).size === participantIds.length
    && memberIds.every((id) => participantIds.includes(id))
  ) {
    return "全員";
  }

  const count = Number.isInteger(expense.participantCount) && expense.participantCount >= 0
    ? expense.participantCount
    : participantIds?.length ?? (expense.participantNames?.length || undefined);
  return count === undefined ? "対象メンバー" : `対象${count}人`;
}

function shareLabel(expense: ProjectExpenseItem): string {
  if (!expense.participantAllocations?.length) return `${formatYen(expense.perPersonYen)}/人`;
  const shares = expense.participantAllocations.map((item) => item.allocatedShareYen);
  const minimum = Math.min(...shares);
  const maximum = Math.max(...shares);
  return minimum === maximum
    ? `${formatYen(minimum)}/人`
    : `${formatYen(minimum)}〜${formatYen(maximum)}/人`;
}

export function ProjectExpenseList({ id, expenses, members, onSelect, adaptToWidth = false }: ProjectExpenseListProps) {
  return (
    <section className={adaptToWidth ? `${styles.section} ${styles.responsive}` : styles.section} aria-labelledby={id}>
      <div className={styles.heading}>
        <h2 id={id} tabIndex={-1}>支出一覧</h2>
        <span>{expenses.length}件</span>
      </div>
      {expenses.length ? (
        <>
          <div className={styles.columnHead} aria-hidden="true">
            <span>内容</span><span>支払者</span><span>支払日</span><span>金額</span>
          </div>
          <ul className={styles.list}>
            {expenses.map((expense) => (
              <li key={expense.id}>
                <button
                  type="button"
                  className={styles.row}
                  aria-haspopup="dialog"
                  onClick={() => onSelect(expense.id)}
                >
                  <span className={styles.main}>
                    <strong>{expense.title}</strong>
                    <span className={styles.meta}>
                      {expense.categoryKey ? expenseCategoryLabels[expense.categoryKey] : "カテゴリなし"}
                      {` · ${participantLabel(expense, members)}`}
                      {` · ${shareLabel(expense)}`}
                    </span>
                  </span>
                  <span className={styles.payer}>{adaptToWidth ? <span className={styles.fieldLabel}>支払者 </span> : null}{expense.payerName}</span>
                  <span className={styles.date}>{adaptToWidth ? <span className={styles.fieldLabel}>支払日 </span> : null}{expense.dateLabel}</span>
                  <strong className={styles.amount}>{adaptToWidth ? <span className={styles.fieldLabel}>金額 </span> : null}{formatYen(expense.amountYen)}</strong>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : <p className={styles.empty}>支出はまだありません。</p>}
    </section>
  );
}
