import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { ApiError } from "../../api/client";
import {
  createExpense,
  deleteExpense,
  getExpenses,
  updateExpense,
  type CreateExpenseRequest,
  type ExpenseListResponse,
  type ExpenseResponse,
  type UpdateExpenseRequest,
} from "../../api/expenseApi";
import { settlementKeys } from "../settlements/settlementQueries";
import { projectKeys } from "../projects/projectQueries";
import { invalidateProjectAnalytics } from "../analytics/analyticsQueries";

export const expenseKeys = {
  list: (publicToken: string, month?: string) =>
    month ? ["projects", publicToken, "expenses", month] as const
      : ["projects", publicToken, "expenses"] as const,
  conflicts: (publicToken: string) => ["expense-conflicts", publicToken] as const,
  notFound: (publicToken: string) => ["expense-not-found", publicToken] as const,
};

const EMPTY_CONFLICTS: readonly string[] = [];
const EMPTY_NOT_FOUND: Readonly<Record<string, ExpenseNotFoundState>> = {};

export type ExpenseNotFoundState = "unresolved" | "deleted";

export function useExpenseConflictIds(publicToken: string | undefined): readonly string[] {
  const queryClient = useQueryClient();
  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => queryClient.getQueryData<readonly string[]>(expenseKeys.conflicts(publicToken ?? ""))
      ?? EMPTY_CONFLICTS,
  );
}

export function useExpenseNotFoundStates(
  publicToken: string | undefined,
): Readonly<Record<string, ExpenseNotFoundState>> {
  const queryClient = useQueryClient();
  return useSyncExternalStore(
    (onStoreChange) => queryClient.getQueryCache().subscribe(onStoreChange),
    () => queryClient.getQueryData<Record<string, ExpenseNotFoundState>>(
      expenseKeys.notFound(publicToken ?? ""),
    ) ?? EMPTY_NOT_FOUND,
  );
}

export function setExpenseNotFoundState(
  queryClient: QueryClient,
  publicToken: string,
  expenseId: string,
  state: ExpenseNotFoundState | null,
): void {
  const key = expenseKeys.notFound(publicToken);
  const next = { ...queryClient.getQueryData<Record<string, ExpenseNotFoundState>>(key) };
  if (state) next[expenseId] = state;
  else delete next[expenseId];
  if (Object.keys(next).length) queryClient.setQueryData(key, next);
  else queryClient.removeQueries({ queryKey: key, exact: true });
}

export function useExpensesQuery(publicToken: string | undefined, enabled = true, month?: string) {
  return useQuery({
    queryKey: expenseKeys.list(publicToken ?? "", month),
    queryFn: () => getExpenses(publicToken!, month),
    enabled: Boolean(publicToken) && enabled,
  });
}

function updateCachedLists(
  queryClient: QueryClient,
  publicToken: string,
  update: (items: ExpenseResponse[], month?: string) => ExpenseResponse[],
): void {
  for (const [key, current] of queryClient.getQueriesData<ExpenseListResponse>({
    queryKey: expenseKeys.list(publicToken),
  })) {
    if (!current) continue;
    const month = typeof key[3] === "string" ? key[3] : undefined;
    queryClient.setQueryData(key, { items: sortExpenses(update(current.items, month)) });
  }
}

export function useCreateExpenseMutation(publicToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: CreateExpenseRequest) => createExpense(publicToken!, request),
    onSuccess: (createdExpense) => {
      void invalidateProjectAnalytics(queryClient, publicToken ?? "");
      const queryKey = expenseKeys.list(publicToken ?? "");
      updateCachedLists(queryClient, publicToken ?? "", (items, month) =>
        !month || createdExpense.paidOn.startsWith(`${month}-`)
          ? [createdExpense, ...items.filter((expense) => expense.id !== createdExpense.id)]
          : items);
      void queryClient.invalidateQueries({
        queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: settlementKeys.project(publicToken ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: projectKeys.list });
    },
  });
}

export function useUpdateExpenseMutation(publicToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      expenseId,
      request,
    }: {
      expenseId: string;
      request: UpdateExpenseRequest;
    }) => updateExpense(publicToken!, expenseId, request),
    onSuccess: (updatedExpense) => {
      void invalidateProjectAnalytics(queryClient, publicToken ?? "");
      const queryKey = expenseKeys.list(publicToken ?? "");
      updateCachedLists(queryClient, publicToken ?? "", (items, month) => {
        const remaining = items.filter((expense) => expense.id !== updatedExpense.id);
        return !month || updatedExpense.paidOn.startsWith(`${month}-`)
          ? [updatedExpense, ...remaining] : remaining;
      });
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: settlementKeys.project(publicToken ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: projectKeys.list });
    },
    onError: (error, variables) => {
      if (
        error instanceof ApiError &&
        error.code === "EXPENSE_NOT_FOUND"
      ) {
        setExpenseNotFoundState(queryClient, publicToken!, variables.expenseId, "unresolved");
      }
    },
  });
}

export function useDeleteExpenseMutation(publicToken: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(publicToken!, expenseId),
    onSuccess: (_, deletedExpenseId) => {
      void invalidateProjectAnalytics(queryClient, publicToken ?? "");
      const queryKey = expenseKeys.list(publicToken ?? "");
      updateCachedLists(queryClient, publicToken ?? "", (items) =>
        items.filter((expense) => expense.id !== deletedExpenseId));
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: settlementKeys.project(publicToken ?? ""),
      });
      void queryClient.invalidateQueries({ queryKey: projectKeys.list });
    },
    onError: (error, expenseId) => {
      if (error instanceof ApiError && error.code === "EXPENSE_NOT_FOUND") {
        setExpenseNotFoundState(queryClient, publicToken!, expenseId, "unresolved");
      }
    },
  });
}

function sortExpenses(expenses: ExpenseResponse[]): ExpenseResponse[] {
  return [...expenses].sort((left, right) => {
    const paidOnComparison = right.paidOn.localeCompare(left.paidOn);
    if (paidOnComparison !== 0) {
      return paidOnComparison;
    }

    const createdAtComparison = right.createdAt.localeCompare(left.createdAt);
    return createdAtComparison !== 0
      ? createdAtComparison
      : left.id.localeCompare(right.id);
  });
}
