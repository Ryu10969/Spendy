import type { ExpenseCategory } from "../../api/expenseApi";
import type { ExpenseCategoryKey } from "../../types/project";

export type ExpenseCategoryOption = {
  key: ExpenseCategory;
  label: string;
};

export const expenseCategoryOptions: ExpenseCategoryOption[] = [
  { key: "FOOD", label: "食費" },
  { key: "UTILITIES", label: "光熱費" },
  { key: "TRANSPORTATION", label: "交通費" },
  { key: "ACCOMMODATION", label: "宿泊費" },
  { key: "DAILY_NECESSITIES", label: "日用品" },
  { key: "ENTERTAINMENT", label: "娯楽" },
  { key: "OTHER", label: "その他" },
];

export const expenseCategoryLabels: Record<ExpenseCategoryKey, string> = {
  HOUSING: "家賃・宿泊",
  FOOD: "食費",
  UTILITIES: "光熱費",
  TRANSPORTATION: "交通費",
  ACCOMMODATION: "宿泊費",
  DAILY_GOODS: "日用品",
  DAILY_NECESSITIES: "日用品",
  ENTERTAINMENT: "娯楽",
  OTHER: "その他",
};
