import { apiRequest } from "./client";

export const MAX_EXPENSE_AMOUNT_YEN = Number.MAX_SAFE_INTEGER;

export type ExpenseCategory =
  | "FOOD"
  | "UTILITIES"
  | "TRANSPORTATION"
  | "ACCOMMODATION"
  | "DAILY_NECESSITIES"
  | "ENTERTAINMENT"
  | "OTHER";

export type ExpenseParticipantResponse = {
  memberId: string;
  allocatedShare: number;
  allocationOrder: number;
};

export type ExpenseResponse = {
  id: string;
  payerMemberId: string;
  amount: number;
  content: string;
  category: ExpenseCategory | null;
  note: string | null;
  paidOn: string;
  version: number;
  participants: ExpenseParticipantResponse[];
  createdAt: string;
  updatedAt: string;
};

export type ExpenseListResponse = {
  items: ExpenseResponse[];
};

export type CreateExpenseRequest = {
  payerMemberId: string;
  participantMemberIds: string[];
  amount: number;
  content: string;
  category: ExpenseCategory | null;
  note: string | null;
  paidOn: string;
};

export type UpdateExpenseRequest = CreateExpenseRequest & {
  version: number;
};

export function getExpenses(publicToken: string, month?: string): Promise<ExpenseListResponse> {
  return apiRequest<ExpenseListResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/expenses${month ? `?month=${encodeURIComponent(month)}` : ""}`,
  );
}

export function createExpense(
  publicToken: string,
  request: CreateExpenseRequest,
): Promise<ExpenseResponse> {
  return apiRequest<ExpenseResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/expenses`,
    {
      method: "POST",
      body: JSON.stringify(request),
    },
  );
}

export function updateExpense(
  publicToken: string,
  expenseId: string,
  request: UpdateExpenseRequest,
): Promise<ExpenseResponse> {
  return apiRequest<ExpenseResponse>(
    `/api/projects/${encodeURIComponent(publicToken)}/expenses/${encodeURIComponent(expenseId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(request),
    },
  );
}

export function deleteExpense(publicToken: string, expenseId: string): Promise<void> {
  return apiRequest<void>(
    `/api/projects/${encodeURIComponent(publicToken)}/expenses/${encodeURIComponent(expenseId)}`,
    {
      method: "DELETE",
    },
  );
}
