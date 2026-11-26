import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

function load(relative, imports = {}) {
  const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  });
  return module.exports;
}

const calls = [];
const client = { apiRequest: async (url) => { calls.push(url); return { items: [] }; } };
const expenseApi = load("../src/api/expenseApi.ts", { "./client": client });
const settlementApi = load("../src/api/settlementApi.ts", { "./client": client });
await expenseApi.getExpenses("token", "2026-09");
await expenseApi.getExpenses("token");
await settlementApi.getSettlement("token", "UNDERSTANDABLE", "2026-09");
await settlementApi.getSettlement("token", "FEWER_TRANSFERS");
assert.deepEqual(calls, [
  "/api/projects/token/expenses?month=2026-09",
  "/api/projects/token/expenses",
  "/api/projects/token/settlements?strategy=UNDERSTANDABLE&month=2026-09",
  "/api/projects/token/settlements?strategy=FEWER_TRANSFERS",
]);

const cache = new Map();
const queryClient = {
  getQueriesData: ({ queryKey }) => [...cache.entries()]
    .filter(([key]) => key.slice(0, queryKey.length).every((part, index) => part === queryKey[index])),
  setQueryData: (key, value) => {
    const old = [...cache.keys()].find((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(key));
    cache.set(old ?? key, value);
  },
  invalidateQueries: async () => {},
};
const query = {
  useQuery: (options) => options,
  useMutation: (options) => options,
  useQueryClient: () => queryClient,
};
const settlementQueries = load("../src/features/settlements/settlementQueries.ts", {
  "@tanstack/react-query": query,
  "../../api/settlementApi": settlementApi,
  "../../mocks/fixtures/settlementResponses": { getSettlementFixture: () => null },
  "./settlementSource": { sameSettlementFingerprint: () => true },
});
const expenseQueries = load("../src/features/expenses/expenseQueries.ts", {
  "@tanstack/react-query": query,
  react: { useSyncExternalStore: () => undefined },
  "../../api/client": { ApiError: class ApiError extends Error {} },
  "../../api/expenseApi": expenseApi,
  "../settlements/settlementQueries": settlementQueries,
  "../projects/projectQueries": { projectKeys: { list: ["projects"] } },
  "../analytics/analyticsQueries": { invalidateProjectAnalytics: async () => {} },
});
const septemberExpenses = expenseQueries.useExpensesQuery("token", true, "2026-09");
const octoberExpenses = expenseQueries.useExpensesQuery("token", true, "2026-10");
const septemberSettlement = settlementQueries.useSettlementQuery(
  "token", "FEWER_TRANSFERS", true, "2026-09");
assert.notDeepEqual(septemberExpenses.queryKey, octoberExpenses.queryKey);
assert.deepEqual(septemberExpenses.queryKey, ["projects", "token", "expenses", "2026-09"]);
assert.deepEqual(septemberSettlement.queryKey,
  ["projects", "token", "settlements", "FEWER_TRANSFERS", "2026-09"]);
await septemberExpenses.queryFn();
await septemberSettlement.queryFn();
assert.equal(calls.at(-2), "/api/projects/token/expenses?month=2026-09");
assert.equal(calls.at(-1),
  "/api/projects/token/settlements?strategy=FEWER_TRANSFERS&month=2026-09");
cache.set(expenseQueries.expenseKeys.list("token", "2026-09"), {
  items: [{ id: "expense", paidOn: "2026-09-30", createdAt: "2026-09-30T00:00:00Z" }],
});
cache.set(expenseQueries.expenseKeys.list("token", "2026-10"), { items: [] });
expenseQueries.useUpdateExpenseMutation("token").onSuccess({
  id: "expense", paidOn: "2026-10-01", createdAt: "2026-09-30T00:00:00Z",
});
assert.deepEqual([...cache.values()].map((value) => value.items.length), [0, 1]);

const months = load("../src/features/projects/monthSelection.ts");
assert.equal(months.currentMonth(new Date(2026, 8, 30)), "2026-09");
assert.equal(months.previousMonth("2026-01"), "2025-12");
assert.equal(months.previousMonth("0001-01"), null);
assert.equal(months.nextMonth("2026-08", "2026-09"), "2026-09");
assert.equal(months.nextMonth("2026-09", "2026-09"), null);

const localDate = (year, month, day) => {
  const date = new Date(2000, month - 1, day, 12);
  date.setFullYear(year);
  return date;
};
assert.equal(months.continuousExpenseDate("2026-10", localDate(2026, 10, 9)), "2026-10-09");
for (const [month, expected] of [
  ["2026-09", "2026-09-30"], ["2026-02", "2026-02-28"],
  ["2024-02", "2024-02-29"], ["2026-01", "2026-01-31"],
  ["2025-12", "2025-12-31"], ["1900-02", "1900-02-28"],
  ["2000-02", "2000-02-29"], ["0001-01", "0001-01-31"],
  ["0004-02", "0004-02-29"], ["0099-02", "0099-02-28"],
  ["0100-02", "0100-02-28"], ["0400-02", "0400-02-29"],
  ["9999-11", "9999-11-30"],
]) assert.equal(months.continuousExpenseDate(month, localDate(9999, 12, 15)), expected);
assert.equal(months.continuousExpenseDate("9999-12", localDate(9999, 12, 31)), "9999-12-31");
assert.equal(months.continuousExpenseDate("0001-01", localDate(1, 1, 3)), "0001-01-03");
assert.equal(months.continuousExpenseDate("0004-02", localDate(4, 2, 7)), "0004-02-07");
assert.equal(months.continuousExpenseDate("2026-12", localDate(2027, 1, 1)), "2026-12-31");

const { toProjectDetail } = load("../src/features/projects/projectDetailAdapter.ts");
const memberA = { id: "a", name: "A", displayOrder: 1, active: true };
const memberB = { id: "b", name: "B", displayOrder: 2, active: true };
const project = {
  publicToken: "token", name: "Home", description: null, type: "CONTINUOUS",
  status: "ACTIVE", members: [memberA, memberB],
};
const expense = {
  id: "expense", amount: 101, paidOn: "2026-09-30", payerMemberId: "a",
  content: "Dinner", category: null, note: null, version: 0, participants: [
    { memberId: "b", allocatedShare: 101, allocationOrder: 1 },
  ],
};
const settlement = {
  scopeType: "YEAR_MONTH", scopeKey: "2026-09", transfers: [{
    id: "transfer", fromMemberId: "b", toMemberId: "a", finalRoundedAmount: 101,
    status: "OUTSTANDING",
  }], balances: [
    { memberId: "a", paidAmount: 101, burdenAmount: 0, exactBalance: 101 },
    { memberId: "b", paidAmount: 0, burdenAmount: 101, exactBalance: -101 },
  ],
};
const detail = toProjectDetail(project, [expense], settlement);
assert.equal(detail.kpi.totalExpenseYen, 101n);
assert.equal(detail.kpi.expenseCount, 1);
assert.equal(detail.kpi.settlementTransactionCount, 1);
assert.deepEqual(detail.expenses.map((item) => item.id), ["expense"]);
assert.deepEqual(detail.memberBalances.map((item) => item.balanceYen), [101, -101]);
assert.equal(detail.settlementTransfers[0].amountYen, 101);
console.log("Monthly Settlement transport, keys, navigation, and adapter: PASS");
