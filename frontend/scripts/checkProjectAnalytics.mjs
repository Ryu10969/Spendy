import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

function load(relative, imports = {}) {
  const source = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, (name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  });
  return module.exports;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
const fixtures = load("../src/mocks/fixtures/analyticsResponses.ts");
const { analyticsFixture: data, analyticsFixtureExpenses: expenses, analyticsSettlementFixture: settlement,
  emptyAnalyticsFixture: empty, bothEmptyAnalyticsFixture: bothEmpty,
  noPreviousDataAnalyticsFixture: noPreviousData, noPreviousMonthAnalyticsFixture: noPreviousMonth } = fixtures;
const money = load("../src/utils/formatMoney.ts");
const { ApiError } = load("../src/api/client.ts");
const presentation = load("../src/features/analytics/analyticsPresentation.ts", {
  "../../api/client": { ApiError }, "../../utils/formatMoney": money,
});
const { analyticsPresentation: present, comparisonText } = presentation;
const ready = (value) => ({ data: value, isError: false, fetchStatus: "idle", error: null });

// Fixture conservation, saved allocation population, and an exact-payable rounded plan.
assert.equal(expenses.reduce((sum, item) => sum + item.amount, 0), data.totalExpense);
assert.equal(new Set(expenses.flatMap((item) => item.participants.map((p) => p.memberId))).size, data.participantCount);
for (const fixture of [data, empty, bothEmpty, noPreviousData, noPreviousMonth]) {
  assert.equal(fixture.categoryBreakdown.reduce((sum, item) => sum + item.totalExpense, 0), fixture.totalExpense);
  assert.equal(fixture.categoryBreakdown.reduce((sum, item) => sum + item.expenseCount, 0), fixture.expenseCount);
  for (const field of ["paidAmount", "burdenAmount"]) {
    assert.equal(fixture.members.reduce((sum, member) => sum + member[field], 0), fixture.totalExpense);
  }
  assert.equal(fixture.members.reduce((sum, member) => sum + member.exactBalance, 0), 0);
  assert.equal(fixture.monthlyTrend.items.at(-1).month, fixture.scopeKey);
  assert.equal(fixture.monthlyTrend.items.at(-1).totalExpense, fixture.totalExpense);
  assert.equal(fixture.monthlyTrend.items[0].month, fixture.monthlyTrend.startMonth);
}
for (const member of data.members) {
  assert.equal(expenses.filter((e) => e.payerMemberId === member.memberId).reduce((sum, e) => sum + e.amount, 0), member.paidAmount);
  assert.equal(expenses.flatMap((e) => e.participants).filter((p) => p.memberId === member.memberId)
    .reduce((sum, p) => sum + p.allocatedShare, 0), member.burdenAmount);
}
const remaining = new Map(data.members.map((m) => [m.memberId, m.exactBalance]));
for (const transfer of settlement.transfers) {
  assert.equal(transfer.explanation.fromExactBalanceBefore, remaining.get(transfer.fromMemberId));
  assert.equal(transfer.explanation.toExactBalanceBefore, remaining.get(transfer.toMemberId));
  assert.equal(transfer.initiallyRoundedAmount + transfer.roundingAdjustment, transfer.exactAmount);
  assert.equal(transfer.finalRoundedAmount, transfer.exactAmount);
  remaining.set(transfer.fromMemberId, remaining.get(transfer.fromMemberId) + transfer.finalRoundedAmount);
  remaining.set(transfer.toMemberId, remaining.get(transfer.toMemberId) - transfer.finalRoundedAmount);
}
assert.ok([...remaining.values()].every((amount) => amount === 0));
assert.ok(settlement.transfers.every((t) => t.status === "OUTSTANDING"));

assert.match(comparisonText(data.previousMonthComparison), /増加.*\+¥201（\+25.13%）/);
assert.match(comparisonText(empty.previousMonthComparison), /減少.*-100.00%/);
assert.match(comparisonText(bothEmpty.previousMonthComparison), /両月の支出なし.*割合 —/);
assert.match(comparisonText(noPreviousData.previousMonthComparison), /前月の支出なし.*\+¥1,001.*割合 —/);
assert.match(comparisonText(noPreviousMonth.previousMonthComparison), /前月なし.*—/);
assert.match(comparisonText({ ...data.previousMonthComparison, difference: 0, percentageChange: "0.00" }), /増減なし.*0.00%/);
assert.equal(present(ready(data), data.publicToken, "2026-11", false).data, undefined);
assert.equal(present(ready(data), "other-token", "2026-10", false).data, undefined);
assert.equal(present(ready(data), data.publicToken, "2026-10", true).data, undefined);
assert.equal(present({ ...ready(data), fetchStatus: "fetching" }, data.publicToken, "2026-10", false).retained, true);
assert.equal(present({ ...ready(data), isError: true, error: new Error("offline") }, data.publicToken, "2026-10", false).retained, true);
for (const code of ["ANALYTICS_AMOUNT_OUT_OF_RANGE", "ANALYTICS_CALCULATION_INVALID", "ANALYTICS_SCOPE_UNSUPPORTED", "PROJECT_NOT_FOUND"]) {
  assert.equal(present({ ...ready(data), isError: true, error: new ApiError(409, code, "unavailable") },
    data.publicToken, data.scopeKey, false).data, undefined);
}

// Real QueryObserver exercises a month switch, an ignored late response, and mutation invalidation.
let queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
const reads = [];
const api = load("../src/api/analyticsApi.ts", { "./client": {
  apiRequest: (url, init) => new Promise((resolve, reject) => reads.push({ url, init, resolve, reject })),
} });
let options;
const queryHooks = {
  useQuery: (value) => { options = value; return { ...ready(undefined), refetch: () => {} }; },
  useQueryClient: () => queryClient,
  useMutation: (value) => value,
};
const queries = load("../src/features/analytics/analyticsQueries.ts", {
  "@tanstack/react-query": queryHooks, "../../api/analyticsApi": api, "./analyticsPresentation": presentation,
});
queries.useProjectAnalyticsQuery("project/token", "2026-10", false);
assert.equal(options.enabled, false);
queries.useProjectAnalyticsQuery(data.publicToken, "2026-10", true);
const octoberOptions = options;
const observer = new QueryObserver(queryClient, octoberOptions);
const unsubscribe = observer.subscribe(() => {});
assert.match(reads[0].url, /month=2026-10&trendMonths=6$/);
queries.useProjectAnalyticsQuery(data.publicToken, "2026-11", true);
observer.setOptions(options);
assert.equal(reads[0].init.signal.aborted, true);
reads[1].resolve(empty);
await tick();
reads[0].resolve(data);
await tick();
assert.equal(observer.getCurrentResult().data.scopeKey, "2026-11");
assert.notDeepEqual(octoberOptions.queryKey, options.queryKey);
queries.useProjectAnalyticsQuery(data.publicToken, "2026-11", true, 3);
assert.notDeepEqual(options.queryKey, observer.options.queryKey);
const invalidation = queries.invalidateProjectAnalytics(queryClient, data.publicToken);
assert.equal(queryClient.getQueryState(observer.options.queryKey).isInvalidated, true);
await tick();
assert.equal(present(observer.getCurrentResult(), data.publicToken, "2026-11", true).data, undefined);
reads.at(-1).reject(new Error("offline after mutation"));
await invalidation;
assert.equal(queryClient.getQueryState(observer.options.queryKey).isInvalidated, true);
assert.equal(present(observer.getCurrentResult(), data.publicToken, "2026-11", true).data, undefined);
const retry = observer.refetch();
reads.at(-1).resolve(empty);
await retry;
assert.equal(queryClient.getQueryState(observer.options.queryKey).isInvalidated, false);
assert.equal(present(observer.getCurrentResult(), data.publicToken, "2026-11", false).data, empty);
const backgroundRead = observer.refetch();
const olderRead = reads.at(-1);
const afterMutation = queries.invalidateProjectAnalytics(queryClient, data.publicToken);
await tick();
assert.equal(olderRead.init.signal.aborted, true);
assert.equal(queryClient.getQueryState(observer.options.queryKey).isInvalidated, true);
const renamed = { ...empty, previousMonthComparison: {
  ...empty.previousMonthComparison, previousTotalExpense: 2001, difference: -2001,
}, monthlyTrend: { ...empty.monthlyTrend, items: empty.monthlyTrend.items.map((item) =>
  item.month === "2026-10" ? { ...item, totalExpense: 2001 } : item) } };
reads.at(-1).resolve(renamed);
await afterMutation;
olderRead.resolve(empty);
await backgroundRead;
await tick();
assert.equal(observer.getCurrentResult().data.previousMonthComparison.difference, -2001);
unsubscribe();
queryClient.clear();

// Every Expense CRUD path and member rename invalidates all cached month/trend variants.
queryClient = new QueryClient();
const expenseQueries = load("../src/features/expenses/expenseQueries.ts", {
  "@tanstack/react-query": queryHooks, react: {}, "../../api/client": { ApiError }, "../../api/expenseApi": {},
  "../settlements/settlementQueries": { settlementKeys: { project: (token) => ["projects", token, "settlements"] } },
  "../projects/projectQueries": { projectKeys: { list: ["projects", "list"] } },
  "../analytics/analyticsQueries": queries,
});
const keys = [queries.analyticsKeys.month(data.publicToken, "2026-09"),
  queries.analyticsKeys.month(data.publicToken, "2026-10"), queries.analyticsKeys.month(data.publicToken, "2026-11", 3),
  queries.analyticsKeys.overview([data.publicToken, "second"], "2026-09", "2026-11"),
  [...queries.analyticsKeys.localHome, "2026-10"], [...queries.analyticsKeys.localHome, "2026-11"]];
const unrelatedOverview = queries.analyticsKeys.overview(["second"], "2026-09", "2026-11");
queryClient.setQueryData(unrelatedOverview, data);
assert.deepEqual(keys[3], queries.analyticsKeys.overview(["second", data.publicToken], "2026-09", "2026-11"));
for (const operation of ["useCreateExpenseMutation", "useUpdateExpenseMutation", "useDeleteExpenseMutation"]) {
  for (const key of keys) queryClient.setQueryData(key, data);
  // Category-only edits and cross-month moves take the same conservative token invalidation path.
  expenseQueries[operation](data.publicToken).onSuccess({ ...expenses[0], category: "OTHER", paidOn: "2026-11-01" }, expenses[0].id);
  await tick();
  for (const key of keys) assert.equal(queryClient.getQueryState(key).isInvalidated, true);
  assert.equal(queryClient.getQueryState(unrelatedOverview).isInvalidated, false);
}
const projectQueries = load("../src/features/projects/projectQueries.ts", {
  "@tanstack/react-query": queryHooks, "../../api/expenseApi": {}, "../../api/client": { ApiError },
  "../../api/projectApi": {}, "../settlements/settlementQueries": {}, "../analytics/analyticsQueries": queries,
});
for (const key of keys) queryClient.setQueryData(key, data);
await projectQueries.useProjectMemberMutations(data.publicToken).rename.onSuccess({ id: data.members[0].memberId, name: "Renamed", displayOrder: 1 });
await tick();
for (const key of keys) assert.equal(queryClient.getQueryState(key).isInvalidated, true);
queryClient.clear();

// Server rendering checks actual labels/alternatives; no browser or DOM runtime is used.
const collapsible = load("../src/features/projects/components/CollapsibleCard.tsx", { react: React });
const components = load("../src/features/analytics/ProjectAnalytics.tsx", {
  "../../api/client": { ApiError }, "../expenses/expenseCategories": load("../src/features/expenses/expenseCategories.ts"),
  "../projects/components/CollapsibleCard": collapsible, "./analyticsPresentation": presentation, "../../utils/formatMoney": money,
});
const summaryHtml = (value) => renderToStaticMarkup(React.createElement(components.AnalyticsSummary, {
  analytics: present(ready(value), value.publicToken, value.scopeKey, false), month: value.scopeKey, onRetry: () => {},
}));
assert.match(summaryHtml(empty), /この月の支出はありません/);
assert.match(summaryHtml(empty), /—（対象参加者なし）/);
assert.match(summaryHtml(noPreviousData), /前月の支出なし/);
assert.match(summaryHtml(noPreviousMonth), /前月なし/);
assert.match(summaryHtml(data), /class="increase"[^>]*>.*aria-hidden="true">↑ .*\+¥201.*増加.*\+25.13%/);
assert.match(summaryHtml(empty), /class="decrease"[^>]*>.*aria-hidden="true">↓ .*-¥1,001.*減少.*-100.00%/);
assert.match(summaryHtml(noPreviousData), /class="increase"[^>]*>.*増加.*割合 —/);
assert.ok(!/class="(?:increase|decrease)"/.test(summaryHtml(bothEmpty)));
assert.ok(!/class="(?:increase|decrease)"/.test(summaryHtml(noPreviousMonth)));
assert.match(summaryHtml({ ...data, previousMonthComparison: {
  ...data.previousMonthComparison, previousTotalExpense: data.totalExpense, difference: 0, percentageChange: "0.00",
}, monthlyTrend: { ...data.monthlyTrend, items: data.monthlyTrend.items.map((item) =>
  item.month === "2026-09" ? { ...item, totalExpense: data.totalExpense } : item) },
}), /class="neutral"[^>]*>.*¥0.*変化なし.*0.00%/);
const notes = summaryHtml(data).match(/<details class="metricNotes">(.*?)<\/details>/)?.[1];
assert.ok(notes, "aggregation notes are available in a natively closed disclosure");
for (const text of ["集計・参考値について", "重複を除いた人数", "非アクティブ", "負担0円", "支払いのみは除外", "個人の実際の負担額", "未来日付", "前の暦月全体"]) assert.ok(notes.includes(text), text);
assert.match(summaryHtml(data), /role="status" class="srOnly"/);
const html = renderToStaticMarkup(React.createElement(components.AnalyticsAnalysis, {
  analytics: present(ready(data), data.publicToken, data.scopeKey, false), month: data.scopeKey,
}, React.createElement("p", null, "Expense section remains available")));
for (const text of ["未分類", "¥1,000", "2026年5月", "0件", "支払額", "負担額", "差額", "非アクティブ", "支払いのみ", "差額なし"]) assert.ok(html.includes(text), text);
assert.ok(!html.includes("残高"), "Continuous Analytics uses difference wording only");
assert.ok(!html.includes("住居費"));
assert.equal((html.match(/class="donut"/g) ?? []).length, 1, "one chart for both viewports");
assert.equal((html.match(/aria-label="カテゴリ別支出の正確な値"/g) ?? []).length, 1);
for (const explanationOpen of [false, true]) {
  const layoutHtml = renderToStaticMarkup(React.createElement(components.AnalyticsAnalysis, {
    analytics: present(ready(data), data.publicToken, data.scopeKey, false), month: data.scopeKey,
    settlement: React.createElement("section", null, "transfer plan"), explanationOpen,
  }, "Expense section remains available"));
  assert.equal(layoutHtml.includes('class="overviewGrid paired"'), !explanationOpen);
  assert.ok(layoutHtml.indexOf("transfer plan") < layoutHtml.indexOf("支出の分析"));
  assert.ok(layoutHtml.includes('class="membersAndExpenses"'));
}
assert.equal((summaryHtml(data).match(/参加者1人あたりの平均負担（参考）/g) ?? []).length, 1);
assert.ok(!html.includes("参加者1人あたりの平均負担"));
for (const [direction, meaning] of [["receivable", "受け取る"], ["payable", "支払う"], ["neutral", "差額なし"]]) {
  assert.match(html, new RegExp(`data-direction="${direction}"[^>]*>.*?<small>${meaning}</small>`));
}
assert.match(html, /class="mobileMembers".*<h4>.*<dl[^>]*>.*<dt>支払額<\/dt>.*<dt>負担額<\/dt>.*<dt>差額<\/dt>/);
const longName = "長い名前でも全文を保持するメンバー表示確認";
const large = { ...data, totalExpense: Number.MAX_SAFE_INTEGER, expenseCount: 1,
  participantCount: 1, averagePerPerson: Number.MAX_SAFE_INTEGER,
  previousMonthComparison: { ...noPreviousData.previousMonthComparison, previousMonth: "2026-09", difference: Number.MAX_SAFE_INTEGER },
  categoryBreakdown: [{ category: null, totalExpense: Number.MAX_SAFE_INTEGER, expenseCount: 1 }],
  members: [{ ...data.members[0], name: longName, paidAmount: Number.MAX_SAFE_INTEGER, burdenAmount: Number.MAX_SAFE_INTEGER, exactBalance: 0 }],
  monthlyTrend: { ...data.monthlyTrend, items: data.monthlyTrend.items.map((item) => ({ ...item,
    totalExpense: item.month === data.scopeKey ? Number.MAX_SAFE_INTEGER : 0,
    expenseCount: item.month === data.scopeKey ? 1 : 0,
  })) },
};
const largeHtml = renderToStaticMarkup(React.createElement(components.AnalyticsAnalysis, {
  analytics: present(ready(large), data.publicToken, data.scopeKey, false), month: data.scopeKey,
}, "expenses"));
assert.ok(largeHtml.includes(`<h4>${longName}</h4>`));
assert.ok(largeHtml.includes(money.formatYen(Number.MAX_SAFE_INTEGER)));
for (const analytics of [
  present(ready(undefined), data.publicToken, data.scopeKey, false),
  present({ ...ready(data), isError: true, error: new Error("offline") }, data.publicToken, data.scopeKey, true),
]) {
  const unavailableHtml = renderToStaticMarkup(React.createElement(components.AnalyticsAnalysis,
    { analytics, month: data.scopeKey }, React.createElement("p", null, "Expense section remains available")));
  assert.match(unavailableHtml, /Expense section remains available/);
  assert.ok(!unavailableHtml.includes("¥1,000"));
}
const { SettlementExplanation } = load("../src/features/projects/components/SettlementExplanation.tsx", {
  "../../../utils/formatMoney": money,
});
const explanationHtml = renderToStaticMarkup(React.createElement(SettlementExplanation,
  { result: settlement, members: data.members.map((m) => ({ id: m.memberId, displayName: m.name })) }));
assert.match(explanationHtml, /丸め前.*¥499.*初回丸め.*¥500.*調整.*-¥1.*最終額.*¥499/);
assert.ok(!explanationHtml.includes("最少"));
assert.ok(!explanationHtml.includes("data-balance="), "Event keeps existing presentation by default");
assert.ok(!explanationHtml.includes("tabindex="), "Continuous scroll focus does not affect Event");
const continuousExplanationHtml = renderToStaticMarkup(React.createElement(SettlementExplanation,
  { result: settlement, members: data.members.map((m) => ({ id: m.memberId, displayName: m.name })), showBalanceColors: true }));
assert.match(continuousExplanationHtml, /data-balance="-1"/);
assert.match(continuousExplanationHtml, /data-balance="1"/);

// Hook harness drives the actual disclosure component across run/strategy/month/availability changes.
function hookHarness() {
  const slots = [];
  let cursor = 0, dirty = false, effects = [], layoutEffects = [];
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        const next = typeof value === "function" ? value(slots[index]) : value;
        dirty ||= next !== slots[index]; slots[index] = next;
      }];
    },
    useRef: (initial) => { const index = cursor++; return slots[index] ??= { current: initial }; },
    useId: () => { const index = cursor++; return `id-${index}`; },
    useEffect(fn, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) effects.push(fn);
      slots[index] = dependencies;
    },
    useLayoutEffect(fn, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => value !== slots[index][i])) layoutEffects.push(fn);
      slots[index] = dependencies;
    },
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  };
  return { hooks, render(Component, props, commit = () => {}) {
    let tree;
    do {
      dirty = false; cursor = 0; effects = []; layoutEffects = [];
      tree = Component(props);
      commit(tree);
      layoutEffects.forEach((effect) => effect());
      effects.forEach((effect) => effect());
    } while (dirty);
    return tree;
  } };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...React.Children.toArray(tree.props?.children).flatMap(nodes), ...nodes(tree.props?.settlement)];
}
const harness = hookHarness();
const stub = () => null;
const loadContinuous = (hooks) => load("../src/features/projects/components/ContinuousProjectDetail.tsx", {
  react: hooks, "../../analytics/ProjectAnalytics": components,
  "../../expenses/components/AddExpenseModal": { AddExpenseModal: stub },
  "../../expenses/components/ExpenseDetailDialog": { ExpenseDetailDialog: stub },
  "../monthSelection": load("../src/features/projects/monthSelection.ts"), "../../../utils/formatMoney": money,
  "./ProjectDetailHeader": { ProjectDetailHeader: stub }, "./ProjectExpenseList": { ProjectExpenseList: stub },
  "./SettlementStrategySelector": { SettlementStrategySelector: stub },
  "./SettlementExplanation": { SettlementExplanation: stub }, "./CollapsibleCard": collapsible,
}).ContinuousProjectDetail;
const ContinuousProjectDetail = loadContinuous(harness.hooks);
const { toProjectDetail } = load("../src/features/projects/projectDetailAdapter.ts");
const detail = toProjectDetail({ publicToken: data.publicToken, name: "Home", type: "CONTINUOUS", description: "", status: "ACTIVE",
  members: data.members.map((m) => ({ id: m.memberId, ...m })) }, expenses, settlement);
let props = { detail, selectedMonth: "2026-10", settlementStatus: "ready", settlementStrategy: "FEWER_TRANSFERS", settlementResponse: settlement };
const render = () => harness.render(ContinuousProjectDetail, props);
const trigger = (tree) => nodes(tree).find((node) => node.type === "button" && node.props["aria-controls"]);
assert.equal(renderToStaticMarkup(nodes(render()).find((node) => node.props.id === "continuous-settlement-title")),
  '<h2 id="continuous-settlement-title">2026年10月の精算結果</h2>');
assert.ok(nodes(render()).some((node) => node.props.title === "精算結果"));
assert.ok(!renderToStaticMarkup(render()).includes("（送金案）"));
assert.match(renderToStaticMarkup(render()), /選択月の計算結果です。実際の送金完了を意味しません。/);
assert.ok(nodes(render()).some((node) => node.props.className === "history" && node.props["aria-label"] === "選択月の支出履歴"));
const memberSummary = nodes(render()).find((node) => node.props.className === "settlementBalances");
assert.match(renderToStaticMarkup(memberSummary), /保存された支出の負担額と差額/);
const memberBlocks = React.Children.toArray(nodes(memberSummary).find((node) => node.props.className === "balanceCards").props.children);
assert.equal(memberBlocks.length, detail.memberBalances.length);
for (const [i, block] of memberBlocks.entries()) {
  const balance = detail.memberBalances[i];
  assert.equal(nodes(block).find((node) => node.type === "h4").props.children, balance.name);
  assert.deepEqual(nodes(block).filter((node) => node.type === "dt").map((node) => node.props.children), ["支払額", "負担額", "差額"]);
  const blockHtml = renderToStaticMarkup(block);
  for (const amount of [money.formatYen(balance.paidYen), money.formatYen(balance.burdenYen), money.formatSignedYen(balance.balanceYen)]) assert.ok(blockHtml.includes(amount));
  assert.equal(nodes(block).find((node) => node.props["data-balance"] !== undefined).props["data-balance"], Math.sign(balance.balanceYen));
  assert.ok(blockHtml.includes(balance.balanceYen > 0 ? "受け取る" : balance.balanceYen < 0 ? "支払う" : "差額なし"));
}

// Exercise the real shared Header: month navigation must span both columns, not live inside the heading.
const headerHarness = hookHarness();
const { ProjectDetailHeader } = load("../src/features/projects/components/ProjectDetailHeader.tsx", {
  react: headerHarness.hooks,
  "react-router-dom": { Link: stub }, "../../../utils/formatMoney": money,
  "./ProjectMemberEditor": { ProjectMemberEditor: stub },
});
const headerProps = { name: detail.name, type: "CONTINUOUS", description: detail.description,
  members: detail.members, totalExpenseYen: data.totalExpense, expenseCount: data.expenseCount, onAddExpense: stub };
const monthNav = React.createElement("nav", { "aria-label": "対象月" }, "2026年10月");
const headerTree = headerHarness.render(ProjectDetailHeader, { ...headerProps, summaryControls: monthNav, summary: "analytics summary" });
const header = nodes(headerTree).find((node) => node.type === "header");
const fullWidthControls = React.Children.toArray(header.props.children).find((node) => node.props.className === "summaryControls");
assert.equal(fullWidthControls.props.children, monthNav);
assert.ok(!nodes(nodes(headerTree).find((node) => node.props.className === "heading")).includes(fullWidthControls));
const eventHeader = nodes(headerHarness.render(ProjectDetailHeader, { ...headerProps, type: "EVENT" })).find((node) => node.type === "header");
assert.deepEqual(React.Children.toArray(eventHeader.props.children).map((node) => node.props.className),
  ["headingRow", "total", "addExpense"], "Event header retains its original children/order");
const planHtml = () => renderToStaticMarkup(nodes(render()).find((node) => node.props["aria-label"] === "精算結果の送金案"));
assert.ok(!/未送金|未精算|送金完了/.test(planHtml()), "ordinary Continuous transfers have no situation label");
for (const transfer of detail.settlementTransfers) {
  for (const text of [transfer.fromMemberName, transfer.toMemberName, money.formatYen(transfer.amountYen)]) assert.ok(planHtml().includes(text));
}
const completedAt = "2026-10-09T03:00:00Z";
const recorded = { ...settlement, transfers: settlement.transfers.map((transfer, i) => i === 0
  ? { ...transfer, status: "COMPLETED", completedAt } : transfer) };
props = { ...props, settlementResponse: recorded, detail: { ...detail,
  settlementTransfers: detail.settlementTransfers.map((transfer, i) => ({ ...transfer, completed: i === 0 })),
} };
assert.equal((planHtml().match(/送金完了（記録済み）/g) ?? []).length, 1);
assert.ok(planHtml().includes(`<time dateTime="${completedAt}">${completedAt}</time>`));
props = { ...props, detail, settlementResponse: settlement };
assert.ok(!planHtml().includes("記録済み"), "completion stays with its original transfer/run");
const actualCards = nodes(components.AnalyticsAnalysis({ analytics: present(ready(data), data.publicToken, data.scopeKey, false),
  month: data.scopeKey, children: "expenses" })).filter((node) => node.type === collapsible.CollapsibleCard);
assert.deepEqual(actualCards.map((node) => [node.props.title, node.props.defaultOpen !== false]), [
  ["カテゴリ別の支出内訳", true], ["月別の支出推移", false], ["メンバー別の集計", false],
]);
props.analytics = present(ready(data), data.publicToken, data.scopeKey, false);
assert.ok(!nodes(render()).some((node) => node.props.className === "settlementBalances"), "normal view avoids duplicate member aggregates");
assert.equal(trigger(render()).props["aria-expanded"], false);
assert.equal(nodes(render()).find((node) => node.type === components.AnalyticsAnalysis).props.explanationOpen, false);
trigger(render()).props.onClick();
assert.equal(trigger(render()).props["aria-expanded"], true);
assert.equal(nodes(render()).find((node) => node.type === components.AnalyticsAnalysis).props.explanationOpen, true);
trigger(render()).props.onClick();
assert.equal(nodes(render()).find((node) => node.type === components.AnalyticsAnalysis).props.explanationOpen, false);
trigger(render()).props.onClick();
assert.ok(nodes(render()).some((node) => node.props.className === "settlementBalances"));
assert.equal(nodes(render()).find((node) => node.props.showBalanceColors).props.result, settlement, "full response is reused");
for (const changed of [
  { settlementResponse: { ...settlement, runId: "new-run" } },
  { settlementStrategy: "UNDERSTANDABLE", settlementResponse: { ...settlement, runId: "other-strategy", strategy: "UNDERSTANDABLE" } },
  { selectedMonth: "2026-09", settlementResponse: { ...settlement, scopeKey: "2026-09", runId: "other-month" } },
  { settlementStatus: "loading", settlementResponse: undefined },
]) {
  props = { ...props, ...changed };
  assert.equal(trigger(render()).props["aria-expanded"], false);
  if (props.settlementResponse) {
    trigger(render()).props.onClick();
    assert.equal(trigger(render()).props["aria-expanded"], true);
  }
}
props = { ...props, selectedMonth: "2026-10", settlementStrategy: "FEWER_TRANSFERS", settlementStatus: "ready", settlementResponse: settlement };
assert.equal(trigger(render()).props["aria-expanded"], false);
props.analytics = present({ ...ready(data), isError: true, error: new Error("offline") }, data.publicToken, data.scopeKey, true);
assert.ok(nodes(render()).some((node) => node.props.className === "settlementBalances"), "Settlement balances survive Analytics failure");
assert.equal(nodes(render()).find((node) => node.props.id === "continuous-expense-list-title").props.expenses.length, 2);
trigger(render()).props.onClick();
assert.equal(trigger(render()).props["aria-expanded"], true);
// Simulate DOM removal BEFORE layout/passive effects: activeElement has already
// fallen back to body. Drive actual focus/blur callbacks rather than source text.
const focusDocumentBefore = globalThis.document;
try {
  const body = {};
  globalThis.document = { body, activeElement: body };
  for (const test of [
    { name: "month", changed: { selectedMonth: "2026-09", settlementResponse: { ...settlement, runId: "september", scopeKey: "2026-09" } } },
    { name: "strategy", changed: { settlementStrategy: "UNDERSTANDABLE", settlementResponse: { ...settlement, strategy: "UNDERSTANDABLE" } } },
    { name: "refetched run", changed: { settlementResponse: { ...settlement, runId: "refetched" } } },
    { name: "loading", changed: { settlementStatus: "loading", settlementResponse: undefined }, fallback: true },
    { name: "error", changed: { settlementStatus: "error", settlementResponse: undefined }, fallback: true },
    { name: "hidden trigger", changed: { settlementResponse: { ...settlement, runId: "hidden" } }, hidden: true, fallback: true },
    { name: "disabled trigger", changed: { settlementResponse: { ...settlement, runId: "disabled" } }, disabled: true, fallback: true },
    { name: "removed trigger", changed: { selectedMonth: undefined }, fallback: true },
    { name: "outside focus", changed: { settlementResponse: { ...settlement, runId: "outside" } }, outside: true },
    { name: "blur to body", changed: { settlementResponse: { ...settlement, runId: "body" } }, outside: true, toBody: true },
    { name: "manual close", manual: true },
    { name: "manual close from trigger", manual: true, outside: true, onTrigger: true },
  ]) {
    const h = hookHarness(), Component = loadContinuous(h.hooks);
    let currentProps = { detail, selectedMonth: "2026-10", settlementStatus: "ready",
      settlementStrategy: "FEWER_TRANSFERS", settlementResponse: settlement,
      analytics: present(ready(data), data.publicToken, data.scopeKey, false) };
    let committedOpen = false, removedFocusedChild = false, transitioning = false;
    const focusedChild = {}, secondChild = {}, panelDom = { contains: (node) => node === focusedChild || node === secondChild };
    const focusCalls = [];
    const focusable = (name) => ({ disabled: false, getAttribute: () => "false", getClientRects: () => [{}],
      focus() { document.activeElement = this; focusCalls.push(name); } });
    const triggerDom = focusable("trigger"), historyDom = focusable("history"), outsideDom = focusable("outside");
    triggerDom.getClientRects = () => transitioning && test.hidden ? [] : [{}];
    const focusRender = () => h.render(Component, currentProps, (tree) => {
      const toggle = trigger(tree);
      triggerDom.disabled = transitioning && Boolean(test.disabled);
      triggerDom.getAttribute = () => toggle?.props["aria-disabled"] ? "true" : "false";
      if (toggle) toggle.props.ref.current = triggerDom;
      else if (lastTriggerRef) lastTriggerRef.current = null;
      if (toggle) lastTriggerRef = toggle.props.ref;
      nodes(tree).find((node) => node.props["aria-label"] === "選択月の支出履歴").props.ref.current = historyDom;
      const panel = nodes(tree).find((node) => node.props["aria-label"] === "選択月の精算計算過程");
      if (panel?.props.ref) panel.props.ref.current = panelDom;
      if (committedOpen && !toggle?.props["aria-expanded"] && panelDom.contains(document.activeElement)) {
        document.activeElement = body;
        removedFocusedChild = true;
      }
      committedOpen = Boolean(toggle?.props["aria-expanded"]);
    });
    let lastTriggerRef;
    let tree = focusRender();
    trigger(tree).props.onClick();
    tree = focusRender();
    const panel = nodes(tree).find((node) => node.props["aria-label"] === "選択月の精算計算過程");
    document.activeElement = focusedChild;
    panel.props.onFocusCapture?.({ target: focusedChild });
    panel.props.onBlurCapture?.({ currentTarget: panelDom, relatedTarget: secondChild });
    document.activeElement = secondChild;
    panel.props.onFocusCapture?.({ target: secondChild });
    if (test.outside) {
      const destination = test.toBody ? null : test.onTrigger ? triggerDom : outsideDom;
      panel.props.onBlurCapture?.({ currentTarget: panelDom, relatedTarget: destination });
      document.activeElement = destination ?? body;
    }
    const focusBeforeClose = document.activeElement;
    transitioning = true;
    if (test.manual) trigger(tree).props.onClick();
    else currentProps = { ...currentProps, ...test.changed };
    tree = focusRender();
    assert.equal(trigger(tree)?.props["aria-expanded"] ?? false, false, test.name);
    assert.equal(nodes(tree).some((node) => node.props.showBalanceColors), false, `${test.name}: old explanation removed`);
    if (test.outside) {
      assert.equal(document.activeElement, focusBeforeClose, `${test.name}: never steal outside focus`);
      assert.deepEqual(focusCalls, []);
      assert.equal(removedFocusedChild, false);
    } else {
      assert.equal(removedFocusedChild, true, `${test.name}: focused DOM is gone before effects run`);
      assert.equal(document.activeElement, test.fallback ? historyDom : triggerDom, `${test.name}: focus restored after removal`);
      assert.deepEqual(focusCalls, [test.fallback ? "history" : "trigger"], `${test.name}: restore exactly once`);
    }
    // Background ready/retry and additional renders must not restore focus again.
    document.activeElement = outsideDom;
    currentProps = { ...currentProps, settlementStatus: "ready", settlementResponse: settlement };
    focusRender();
    assert.equal(document.activeElement, outsideDom, `${test.name}: subsequent update preserves outside focus`);
  }
} finally {
  globalThis.document = focusDocumentBefore;
}
// Smartphone independent initial folding, using actual component state with a viewport stub.
globalThis.window = { matchMedia: () => ({ matches: true }) };
for (const [title, defaultOpen] of [["カテゴリ", true], ["推移", false], ["メンバー", false], ["精算", true]]) {
  const h = hookHarness();
  const { CollapsibleCard } = load("../src/features/projects/components/CollapsibleCard.tsx", { react: h.hooks });
  const tree = h.render(CollapsibleCard, { title, defaultOpen, expandOnDesktop: true, children: "values" });
  assert.equal(trigger(tree).props["aria-expanded"], defaultOpen);
  assert.equal(nodes(tree).find((node) => node.props.id).props.hidden, !defaultOpen);
  trigger(tree).props.onClick();
  assert.equal(trigger(h.render(CollapsibleCard, { title, defaultOpen, expandOnDesktop: true, children: "values" })).props["aria-expanded"], !defaultOpen);
}
globalThis.window = { matchMedia: () => ({ matches: false }) };
for (const defaultOpen of [false, true]) {
  const h = hookHarness();
  const { CollapsibleCard } = load("../src/features/projects/components/CollapsibleCard.tsx", { react: h.hooks });
  const tree = h.render(CollapsibleCard, { title: "Desktop", defaultOpen, expandOnDesktop: true, children: "values" });
  assert.equal(nodes(tree).find((node) => node.props.id).props.hidden, false);
}
delete globalThis.window;

// Continuous opts into container-responsive rows; default/Event markup and actions stay intact.
const { ProjectExpenseList } = load("../src/features/projects/components/ProjectExpenseList.tsx", {
  "../../expenses/expenseCategories": load("../src/features/expenses/expenseCategories.ts"), "../../../utils/formatMoney": money,
});
let selectedExpense;
const listProps = { id: "test-expenses", members: detail.members,
  expenses: [{ ...detail.expenses[0], title: longName, payerName: longName, amountYen: Number.MAX_SAFE_INTEGER }],
  onSelect: (id) => { selectedExpense = id; },
};
const defaultList = renderToStaticMarkup(React.createElement(ProjectExpenseList, listProps));
const responsiveList = ProjectExpenseList({ ...listProps, adaptToWidth: true });
const responsiveHtml = renderToStaticMarkup(responsiveList);
assert.ok(!defaultList.includes("responsive") && !defaultList.includes("fieldLabel"));
assert.ok(responsiveHtml.includes("section responsive"));
for (const text of [longName, money.formatYen(Number.MAX_SAFE_INTEGER), "支払者", "支払日", "金額"]) assert.ok(responsiveHtml.includes(text));
nodes(responsiveList).find((node) => node.type === "button").props.onClick();
assert.equal(selectedExpense, listProps.expenses[0].id, "full row still opens the existing Expense dialog");
assert.equal(nodes(render()).find((node) => node.props.id === "continuous-expense-list-title").props.adaptToWidth, true);
nodes(render()).find((node) => node.props.id === "continuous-expense-list-title").props.onSelect(detail.expenses[0].id);
const continuousDialog = nodes(render()).find((node) => node.props.expense);
assert.equal(continuousDialog.props.useChoiceCards, true);
continuousDialog.props.onClose();

// Check the semantic CSS wiring and contrast of the reused tokens, not browser layout.
const css = readFileSync(new URL("../src/features/analytics/ProjectAnalytics.module.css", import.meta.url), "utf8");
assert.match(css, /\.decrease, \.balance\[data-direction="receivable"\] \{ color: var\(--color-success\)/);
assert.match(css, /\.increase, \.balance\[data-direction="payable"\] \{ color: var\(--color-text-error\)/);
assert.match(css, /\.neutral, \.balance\[data-direction="neutral"\] \{ color: var\(--color-text-primary\)/);
assert.match(css, /\.overviewGrid[^}]*align-items: stretch/);
assert.match(css, /\.layout \.overviewGrid > \* \{[^}]*margin-top: 0/,
  "two class selectors override either card's one-class margin regardless of stylesheet order");
assert.match(css, /\.charts \{[^}]*align-items: stretch/);
assert.match(css, /\.charts > section \{ align-content: start/);
assert.match(css, /\.overviewGrid\.paired, \.membersAndExpenses \{ grid-template-columns: var\(--analytics-columns\)/);
assert.ok(!/min-height:|height:/.test(css.match(/\.overviewGrid \{([^}]+)\}/)[1]), "natural card height, no fixed spacer");
const continuousCss = readFileSync(new URL("../src/features/projects/components/ContinuousProjectDetail.module.css", import.meta.url), "utf8");
assert.match(continuousCss, /\.monthNavigation \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
assert.match(continuousCss, /button:first-child \{ justify-self: start/);
assert.match(continuousCss, /button:last-child \{ justify-self: end/);
assert.match(continuousCss, /\.monthNavigation button \{ min-width: 0; width: min\(100%, 7.5rem\)/);
const headerCss = readFileSync(new URL("../src/features/projects/components/ProjectDetailHeader.module.css", import.meta.url), "utf8");
assert.match(headerCss, /\.summaryControls \{ grid-column: 1 \/ -1; grid-row: 3/);
assert.match(continuousCss, /\.history \{[^}]*padding: var\(--space-5\)[^}]*border: var\(--border-default\)[^}]*border-radius: var\(--radius-xl\)[^}]*background: var\(--color-background-surface\)/);
assert.match(continuousCss, /@media \(min-width: 768px\) \{[^@]*\.settlementExpanded \.settlementBody > \* \{[^}]*border: var\(--border-default\)/);
assert.match(continuousCss, /\.settlementExpanded \.settlementBody \.list li:last-child \{ border-bottom: 0/);
assert.ok(!continuousCss.match(/\.settlementBalances \{[^}]*\}/)[0].includes("overflow"), "member blocks adapt instead of using a horizontal scroller");
assert.match(continuousCss, /\.balanceCards dl \{[^}]*repeat\(auto-fit, minmax\(min\(100%, 11rem\), 1fr\)\)/);
assert.match(continuousCss, /\.difference \{ grid-column: 1 \/ -1/);
assert.ok(!continuousCss.includes("min-width: 34rem"), "Expense rows no longer force a wide scrolling surface");
const expenseCss = readFileSync(new URL("../src/features/projects/components/ProjectExpenseList.module.css", import.meta.url), "utf8");
assert.match(expenseCss, /\.responsive \{ container: continuous-expenses \/ inline-size/);
assert.match(expenseCss, /@container continuous-expenses \(max-width: 32rem\)[\s\S]*\.responsive \.row \{ grid-template-columns: minmax\(0, 1fr\)/);
assert.match(expenseCss, /\.responsive \.row > \* \{ grid-column: 1; grid-row: auto; min-width: 0/);
assert.match(expenseCss, /\.responsive \.amount \{ max-width: none; white-space: nowrap/);
assert.match(expenseCss, /\.responsive \.fieldLabel \{ display: inline/);
assert.match(expenseCss, /\.responsive \.row \{ padding-inline: 0/);
// Match breakpoint selection only; these stubs do not measure CSS or device layout.
for (const width of [1440, 1024, 820, 768, 390, 375, 320]) {
  globalThis.window = { matchMedia: (query) => ({ matches: width <= Number(query.match(/\d+/)[0]) }) };
  const h = hookHarness();
  const { CollapsibleCard } = load("../src/features/projects/components/CollapsibleCard.tsx", { react: h.hooks });
  const tree = h.render(CollapsibleCard, { title: "推移", defaultOpen: false, expandOnDesktop: true, children: "values" });
  assert.equal(nodes(tree).find((node) => node.props.id).props.hidden, width < 768, `${width}px folding breakpoint`);
}
delete globalThis.window;
const tokens = readFileSync(new URL("../src/styles/tokens.css", import.meta.url), "utf8");
const luminance = (hex) => {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((value) => parseInt(value, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
for (const theme of tokens.matchAll(/:root(?:\[data-theme="dark"\])? \{([^}]+)\}/g)) {
  const palette = Object.fromEntries([...theme[1].matchAll(/--([\w-]+): (#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]));
  for (const foreground of ["color-success", "color-text-error", "color-text-primary"]) {
    const backgrounds = ["color-background-surface", "color-background-input"];
    if (foreground === "color-text-primary") backgrounds.push("color-state-selected-surface");
    for (const background of backgrounds) {
      const values = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => a - b);
      assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `${foreground} on ${background}`);
    }
  }
  for (const [foreground, background] of [["color-text-on-primary", "color-action-primary"],
    ["color-text-primary", "color-background-elevated"], ["color-text-secondary", "color-background-elevated"]]) {
    const values = [luminance(palette[foreground]), luminance(palette[background])].sort((a, b) => a - b);
    assert.ok((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `calendar ${foreground} on ${background}`);
  }
}

// Actual Add form state preserves manual dates; a new mount re-evaluates the selected scope.
const NativeDate = globalThis.Date;
let now = new NativeDate(2026, 9, 9, 12);
globalThis.Date = class extends NativeDate {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
};
try {
  let navigatedMonth;
  props = { ...props, selectedMonth: "2026-10", onMonthChange: (month) => { navigatedMonth = month; } };
  const monthControls = () => nodes(nodes(render()).find((node) => node.props.summaryControls).props.summaryControls);
  let monthButtons = monthControls().filter((node) => node.type === "button");
  assert.deepEqual(monthButtons.map((node) => node.props.disabled), [false, true], "current month keeps disabled next control in the Grid");
  monthButtons[1].props.onClick();
  assert.equal(navigatedMonth, undefined);
  monthButtons[0].props.onClick();
  assert.equal(navigatedMonth, "2026-09");
  props.selectedMonth = "0001-01";
  monthButtons = monthControls().filter((node) => node.type === "button");
  assert.deepEqual(monthButtons.map((node) => node.props.disabled), [true, false]);
  monthButtons[1].props.onClick();
  assert.equal(navigatedMonth, "0001-02");
  props = { ...props, selectedMonth: "2026-09" };
  nodes(render()).find((node) => node.props.onAddExpense).props.onAddExpense();
  const added = () => nodes(render()).find((node) => node.props.initialDate !== undefined);
  assert.equal(added().props.initialDate, "2026-09-30");
  added().props.onClose();
  assert.equal(added(), undefined);
  props.selectedMonth = "2024-02";
  nodes(render()).find((node) => node.props.onAddExpense).props.onAddExpense();
  assert.equal(added().props.initialDate, "2024-02-29");
  added().props.onClose();
  props.selectedMonth = "2026-10";
  nodes(render()).find((node) => node.props.onAddExpense).props.onAddExpense();
  assert.equal(added().props.initialDate, "2026-10-09");
  added().props.onClose();
  now = new NativeDate(2026, 10, 1, 0, 5);
  nodes(render()).find((node) => node.props.onAddExpense).props.onAddExpense();
  assert.equal(added().props.initialDate, "2026-10-31", "former current month is past at reopen");

  const categories = load("../src/features/expenses/expenseCategories.ts");
  const calendarDates = load("../src/features/expenses/components/calendarDates.ts");
  const dateInputStub = () => null;
  const selectInputStub = () => null;
  const formModule = load("../src/features/expenses/components/ExpenseForm.tsx", {
    react: React, "../../../api/expenseApi": { MAX_EXPENSE_AMOUNT_YEN: Number.MAX_SAFE_INTEGER },
    "../../../components/common/FieldError": { FieldError: stub }, "../expenseCategories": categories,
    "./calendarDates": calendarDates, "./ExpenseDateInput": { ExpenseDateInput: dateInputStub },
    "./ExpenseSelect": { ExpenseSelect: selectInputStub },
  });
  const choicesHarness = hookHarness();
  const choicesModule = load("../src/features/expenses/components/ExpenseForm.tsx", {
    react: choicesHarness.hooks, "../../../api/expenseApi": { MAX_EXPENSE_AMOUNT_YEN: Number.MAX_SAFE_INTEGER },
    "../../../components/common/FieldError": { FieldError: stub }, "../expenseCategories": categories,
    "./calendarDates": calendarDates, "./ExpenseDateInput": { ExpenseDateInput: dateInputStub },
    "./ExpenseSelect": { ExpenseSelect: selectInputStub },
  });
  let editedForm = { payerId: detail.members[0].id, participantIds: [detail.members[0].id], amount: "1001",
    content: "編集", date: "2026-09-30", categoryKey: "FOOD", memo: "" };
  let changedField;
  const choicesRender = (useChoiceCards = true, errors = {}) => choicesHarness.render(choicesModule.ExpenseForm, {
    form: editedForm, errors, members: detail.members, useChoiceCards,
    onChange: (next, field) => { editedForm = next; changedField = field; },
  });
  const dropdown = (field) => nodes(choicesRender()).find((node) => node.type === selectInputStub && node.props.id.endsWith(`-${field}`));
  assert.deepEqual(dropdown("category").props.options.map((option) => option.value), categories.expenseCategoryOptions.map((option) => option.key));
  assert.equal(dropdown("category").props.options.length, 7);
  assert.equal(dropdown("category").props.clearLabel, "カテゴリーの選択をクリア");
  assert.equal(dropdown("payer").props.clearLabel, undefined);
  assert.equal(dropdown("payer").props.placeholder, "支払者を選択");
  assert.deepEqual(dropdown("payer").props.options.map((option) => option.value), detail.members.map((member) => member.id));
  assert.equal(dropdown("category").props.value, "FOOD");
  assert.equal(dropdown("payer").props.value, detail.members[0].id);
  dropdown("category").props.onChange("OTHER");
  assert.equal(editedForm.categoryKey, "OTHER");
  assert.equal(choicesModule.toExpenseRequest(editedForm).category, "OTHER");
  assert.equal(changedField, "categoryKey");
  dropdown("category").props.onChange("");
  assert.equal(choicesModule.toExpenseRequest(editedForm).category, null);
  dropdown("payer").props.onChange(detail.members[1].id);
  assert.equal(editedForm.payerId, detail.members[1].id);
  assert.equal(choicesModule.toExpenseRequest(editedForm).payerMemberId, detail.members[1].id);
  assert.equal(changedField, "payer");
  dropdown("payer").props.onChange("");
  const blankPayerErrors = choicesModule.validateExpenseForm(editedForm);
  assert.equal(blankPayerErrors.payer, "支払者を選択してください。");
  const payerErrorInput = nodes(choicesRender(true, blankPayerErrors)).find((node) => node.props.expenseField === "payer");
  assert.equal(payerErrorInput.props.invalid, true);
  assert.ok(payerErrorInput.props.describedBy.endsWith("-payer-error"));
  dropdown("payer").props.onChange(detail.members[0].id);
  const checkbox = nodes(choicesRender()).find((node) => node.type === "input" && node.props.type === "checkbox");
  checkbox.props.onChange();
  assert.deepEqual(editedForm.participantIds, []);
  assert.equal(choicesModule.validateExpenseForm(editedForm).participants, "割り勘メンバーを1人以上選択してください。");
  nodes(choicesRender()).find((node) => node.type === "input" && node.props.type === "checkbox").props.onChange();
  const dateField = nodes(choicesRender()).find((node) => node.type === dateInputStub);
  assert.equal(dateField.props.value, "2026-09-30", "editing starts from saved date");
  dateField.props.onChange("2026-08-15");
  assert.equal(choicesModule.toExpenseRequest(editedForm).paidOn, "2026-08-15");
  assert.equal(nodes(choicesRender()).find((node) => node.type === dateInputStub).props.value, "2026-08-15", "rerender preserves entered date");
  assert.deepEqual(choicesModule.validateExpenseForm(editedForm), {});
  for (const scoped of [true, false]) {
    const formNodes = nodes(choicesRender(scoped));
    assert.equal(formNodes.filter((node) => node.type === selectInputStub).length, 2, "all Add/Edit forms share custom dropdowns");
    assert.deepEqual(formNodes.filter((node) => node.type === selectInputStub).map((node) => node.props.options),
      [dropdown("payer").props.options, dropdown("category").props.options]);
  }
  assert.ok(!nodes(choicesRender(false)).some((node) => node.props.type === "radio"));
  const formCss = readFileSync(new URL("../src/features/expenses/components/ExpenseForm.module.css", import.meta.url), "utf8");
  assert.match(formCss, /\.choiceCards \.member \{[^}]*min-height: 3rem/);
  assert.match(formCss, /\.choiceCards \.member:has\(input:checked\)[^}]*color-state-selected-indicator/);
  assert.match(formCss, /\.choiceCards \.member:has\(input:focus-visible\)[^}]*color-focus-ring/);
  for (const date of ["2026-02-29", "2024-02-30", "1900-02-29", "0000-01-01", "10000-01-01", "2026-13-01", "2026-1-01", "2026-01-00", "bad"]) {
    assert.ok(choicesModule.validateExpenseForm({ ...editedForm, date }).date, date);
  }
  for (const date of ["2024-02-29", "2000-02-29", "0001-01-01", "0099-12-31", "9999-12-31"]) {
    assert.equal(choicesModule.validateExpenseForm({ ...editedForm, date }).date, undefined, date);
  }
  const mountAdd = () => {
    const h = hookHarness();
    const { AddExpenseModal } = load("../src/features/expenses/components/AddExpenseModal.tsx", {
      react: h.hooks, "../../../api/client": { ApiError }, "./ExpenseForm": formModule,
      "../../../hooks/useAccessibleDialog": { useAccessibleDialog: stub },
    });
    return (values) => h.render(AddExpenseModal, values);
  };
  const formNode = (tree) => nodes(tree).find((node) => node.type === formModule.ExpenseForm);
  let submitted;
  const addProps = { projectName: detail.name, currencyLabel: "JPY", members: detail.members,
    initialDate: "2026-09-30", onSubmit: async (request) => { submitted = request; }, onClose: stub };
  const addRender = mountAdd();
  let form = formNode(addRender(addProps));
  assert.equal(form.props.form.date, "2026-09-30");
  form.props.onChange({ ...form.props.form, date: "2026-09-14", amount: "1000", content: "手入力" }, "date");
  form = formNode(addRender({ ...addProps, initialDate: "2024-02-29" }));
  assert.equal(form.props.form.date, "2026-09-14", "rerender never overwrites manual entry");
  await nodes(addRender(addProps)).find((node) => node.type === "form").props.onSubmit({ preventDefault: stub });
  assert.equal(submitted.paidOn, "2026-09-14", "save uses the user-entered business date");
  assert.equal(formNode(mountAdd()({ ...addProps, initialDate: "2024-02-29" })).props.form.date, "2024-02-29");
  assert.equal(formNode(mountAdd()({ ...addProps, initialDate: undefined })).props.form.date, "2026-11-01");

  const eventHarness = hookHarness();
  const { EventProjectDetail } = load("../src/features/projects/components/EventProjectDetail.tsx", {
    react: eventHarness.hooks, "../../../api/client": { ApiError },
    "../../../api/settlementApi": { SETTLEMENT_STRATEGY_LABELS: { FEWER_TRANSFERS: "送金回数を少なくする", UNDERSTANDABLE: "わかりやすく精算" } },
    "../../expenses/components/AddExpenseModal": { AddExpenseModal: stub },
    "../../expenses/components/ExpenseDetailDialog": { ExpenseDetailDialog: stub },
    "../../../utils/formatMoney": money, "../../settlements/settlementQueries": { SettlementSourceChangedError: class extends Error {} },
    "./ProjectDetailHeader": { ProjectDetailHeader: stub }, "./ProjectExpenseList": { ProjectExpenseList: stub },
    "./SettlementComparison": { SettlementComparison: stub }, "./SettlementCompletionDialog": { SettlementCompletionDialog: stub },
    "./SettlementExplanation": { SettlementExplanation: stub }, "./SettlementStrategySelector": { SettlementStrategySelector: stub },
  });
  const eventRender = () => eventHarness.render(EventProjectDetail, { detail: { ...detail, type: "EVENT", status: "ACTIVE" } });
  const eventHtml = renderToStaticMarkup(eventRender());
  assert.match(eventHtml, /未精算/);
  assert.ok(!nodes(eventRender()).find((node) => node.props.id === "event-expense-list-title")?.props.adaptToWidth);
  const completedEventHtml = renderToStaticMarkup(eventHarness.render(EventProjectDetail, { detail: { ...detail,
    type: "EVENT", status: "ARCHIVED", settlementTransfers: detail.settlementTransfers.map((transfer) => ({ ...transfer, completed: true })),
  }, archived: true }));
  assert.match(completedEventHtml, /完了/);
  assert.ok(!completedEventHtml.includes("記録済み"), "Continuous completion-history exception does not change Event labels");
  nodes(eventRender()).find((node) => node.props.onAddExpense).props.onAddExpense();
  const eventAdd = nodes(eventRender()).find((node) => node.props.onSubmit !== undefined || node.props.currencyLabel);
  assert.equal(eventAdd.props.initialDate, undefined);
  assert.equal(formNode(mountAdd()(eventAdd.props)).props.form.date, "2026-11-01", "Event still starts Today");

  const editHarness = hookHarness();
  const { ExpenseDetailDialog } = load("../src/features/expenses/components/ExpenseDetailDialog.tsx", {
    react: editHarness.hooks, "../../../api/client": { ApiError }, "./ExpenseForm": formModule,
    "../../../hooks/useAccessibleDialog": { useAccessibleDialog: stub }, "../../../utils/formatMoney": money,
    "../expenseCategories": categories,
  });
  const editProps = { projectName: detail.name, expense: detail.expenses[0], members: detail.members,
    onUpdate: async () => {}, onDelete: async () => {}, onClose: stub };
  const editRender = () => editHarness.render(ExpenseDetailDialog, editProps);
  nodes(editRender()).find((node) => node.type === "button" && node.props.children === "編集する").props.onClick();
  assert.equal(formNode(editRender()).props.form.date, expenses[0].paidOn, "Edit keeps saved paidOn");
  assert.equal(formNode(editRender()).props.form.payerId, editProps.expense.persistedState.payerMemberId);
  assert.equal(formNode(editRender()).props.form.categoryKey, editProps.expense.categoryKey ?? "");
  assert.equal(formNode(editRender()).props.useChoiceCards, false, "default/Event editing keeps its presentation");
  const refinedEdit = editHarness.render(ExpenseDetailDialog, { ...editProps, useChoiceCards: true });
  assert.equal(formNode(refinedEdit).props.useChoiceCards, true);
  assert.equal(formNode(refinedEdit).props.form.date, expenses[0].paidOn);
  const historicalPayer = editProps.expense.persistedState.payerMemberId;
  const inactiveTree = editHarness.render(ExpenseDetailDialog, { ...editProps, members: [
    ...detail.members.map((member) => member.id === historicalPayer ? { ...member, active: false } : member),
    { id: "inactive-unreferenced", displayName: "無効な別メンバー", active: false },
  ] });
  assert.ok(formNode(inactiveTree).props.members.some((member) => member.id === historicalPayer && member.active === false));
  assert.ok(!formNode(inactiveTree).props.members.some((member) => member.id === "inactive-unreferenced"));
  let invalidUpdates = 0;
  const validationProps = { ...editProps, onUpdate: async () => { invalidUpdates++; } };
  let validationTree = editHarness.render(ExpenseDetailDialog, validationProps);
  formNode(validationTree).props.onChange({ ...formNode(validationTree).props.form, date: "2026-02-30" }, "date");
  validationTree = editHarness.render(ExpenseDetailDialog, validationProps);
  await nodes(validationTree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  validationTree = editHarness.render(ExpenseDetailDialog, validationProps);
  assert.equal(invalidUpdates, 0, "Edit never sends an impossible paidOn");
  assert.ok(formNode(validationTree).props.errors.date);
  let invalidCreates = 0;
  const validationAdd = mountAdd();
  const validationAddProps = { ...addProps, onSubmit: async () => { invalidCreates++; } };
  let validationAddTree = validationAdd(validationAddProps);
  formNode(validationAddTree).props.onChange({ ...formNode(validationAddTree).props.form,
    payerId: detail.members[0].id, amount: "1001", content: "追加", date: "2026-02-30" }, "date");
  validationAddTree = validationAdd(validationAddProps);
  await nodes(validationAddTree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(invalidCreates, 0, "Add never sends an impossible paidOn");
  assert.ok(formNode(validationAdd(validationAddProps)).props.errors.date);

  // Calendar arithmetic and actual component callbacks, without browser layout claims.
  const { parseCalendarDate, calendarWeekday, moveCalendarDate, moveCalendarMonth } = calendarDates;
  assert.equal(calendarWeekday("0001-01-01"), 1);
  assert.equal(calendarWeekday("2000-01-01"), 6);
  assert.equal(calendarWeekday("2024-02-29"), 4);
  for (const [date, offset, expected] of [
    ["2026-01-31", 1, "2026-02-28"], ["2024-01-31", 1, "2024-02-29"],
    ["2026-12-31", 1, "2027-01-31"], ["0100-01-31", -1, "0099-12-31"],
    ["0001-01-01", -1, null], ["9999-12-31", 1, null],
  ]) assert.equal(moveCalendarMonth(date, offset), expected);
  for (const [date, offset, expected] of [
    ["2024-02-28", 1, "2024-02-29"], ["2024-02-29", 1, "2024-03-01"],
    ["2026-02-28", 1, "2026-03-01"], ["0099-12-31", 1, "0100-01-01"],
    ["0001-01-01", -1, null], ["9999-12-31", 1, null],
  ]) assert.equal(moveCalendarDate(date, offset), expected);
  for (const year of [1, 4, 99, 100, 400, 1900, 2000, 2024, 2026, 9999]) {
    for (let month = 1; month <= 12; month++) {
      const end = calendarDates.daysInMonth(year, month);
      const reference = new NativeDate(0);
      reference.setUTCFullYear(year, month, 0);
      assert.equal(end, reference.getUTCDate(), `${year}-${month} month end`);
      assert.ok(parseCalendarDate(calendarDates.calendarDate(year, month, end)));
      assert.equal(parseCalendarDate(calendarDates.calendarDate(year, month, end + 1)), null);
    }
  }
  const calendarHarness = hookHarness();
  const pickerFor = (h, overrides = {}) => load("../src/features/expenses/components/useExpensePicker.ts", {
    react: { ...h.hooks, useLayoutEffect: () => {}, ...overrides },
  });
  const { ExpenseDateInput } = load("../src/features/expenses/components/ExpenseDateInput.tsx", {
    react: calendarHarness.hooks, "./calendarDates": calendarDates,
    "./useExpensePicker": pickerFor(calendarHarness),
  });
  let calendarValue = "2024-02-29", returns = 0;
  const calendarProps = () => ({ id: "paidOn", value: calendarValue, invalid: false,
    describedBy: "date-help", onChange: (value) => { calendarValue = value; } });
  const calendarRender = () => calendarHarness.render(ExpenseDateInput, calendarProps());
  const calendarTrigger = () => nodes(calendarRender()).find((node) => node.props["aria-haspopup"] === "dialog");
  const calendarPanel = () => nodes(calendarRender()).find((node) => node.props.role === "dialog");
  const dayButton = (date) => nodes(calendarRender()).find((node) => node.props["data-date"] === date);
  const focusedDay = () => nodes(calendarRender()).find((node) => node.props["data-date"] && node.props.tabIndex === 0).props["data-date"];
  calendarTrigger().props.ref.current = { focus: () => { returns++; } };
  calendarTrigger().props.onClick();
  assert.equal(calendarPanel().props.popover, "manual");
  assert.equal(focusedDay(), "2024-02-29");
  assert.equal(dayButton("2024-02-29").props["aria-pressed"], true);
  assert.match(dayButton("2024-02-29").props["aria-label"], /2024年2月29日 木曜日/);
  assert.equal(nodes(calendarRender()).filter((node) => node.type === "th").length, 7);
  const keyEvent = (key, shiftKey = false) => ({ key, shiftKey, prevented: false, stopped: false,
    preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } });
  let key = keyEvent("ArrowRight");
  dayButton("2024-02-29").props.onKeyDown(key);
  assert.ok(key.prevented && key.stopped);
  assert.equal(focusedDay(), "2024-03-01");
  assert.equal(calendarValue, "2024-02-29", "navigation must not change the saved selection");
  for (const [keyName, expected] of [["ArrowUp", "2024-02-23"], ["Home", "2024-02-18"],
    ["End", "2024-02-24"], ["PageDown", "2024-03-24"], ["PageUp", "2024-02-24"]]) {
    dayButton(focusedDay()).props.onKeyDown(keyEvent(keyName));
    assert.equal(focusedDay(), expected);
  }
  dayButton(focusedDay()).props.onKeyDown(keyEvent("PageDown", true));
  assert.equal(focusedDay(), "2025-02-24");
  dayButton("2025-02-24").props.onClick();
  assert.equal(calendarValue, "2025-02-24");
  assert.equal(calendarPanel(), undefined);
  assert.equal(returns, 1, "selection returns focus to calendar trigger");
  calendarTrigger().props.onClick();
  assert.equal(focusedDay(), "2025-02-24", "reopen uses the latest controlled value");
  key = keyEvent("Escape");
  calendarRender().props.onKeyDownCapture(key);
  assert.ok(key.prevented && key.stopped, "Escape must not bubble to parent Expense dialog");
  assert.equal(calendarPanel(), undefined);
  assert.equal(returns, 2);
  const dateText = () => nodes(calendarRender()).find((node) => node.props["data-expense-field"] === "date");
  dateText().props.onChange({ target: { value: "2026-02-30" } });
  assert.equal(dateText().props.value, "2026-02-30", "invalid direct input is retained for correction");
  calendarTrigger().props.onClick();
  assert.equal(focusedDay(), "2026-11-01", "invalid input opens at local Today without replacing input");
  assert.equal(dayButton("2026-11-01").props["aria-current"], "date");
  assert.equal(dayButton("2026-11-01").props["aria-pressed"], false);
  assert.equal(dateText().props.value, "2026-02-30");
  dateText().props.onFocus();
  assert.equal(calendarPanel(), undefined, "direct entry dismisses the calendar without stealing focus");
  assert.equal(calendarValue, "2026-02-30");
  calendarTrigger().props.onClick();
  calendarRender().props.onKeyDownCapture(keyEvent("Escape"));
  for (const [value, disabledLabel] of [["0001-01-01", "前の月"], ["9999-12-31", "次の月"]]) {
    calendarValue = value;
    calendarTrigger().props.onClick();
    assert.equal(nodes(calendarRender()).find((node) => node.props["aria-label"] === disabledLabel).props.disabled, true);
    dayButton(value).props.onKeyDown(keyEvent(value.startsWith("0001") ? "ArrowLeft" : "ArrowRight"));
    assert.equal(focusedDay(), value);
    calendarRender().props.onKeyDownCapture(keyEvent("Escape"));
  }
  calendarValue = "2026-05-31";
  calendarTrigger().props.onClick();
  assert.equal(nodes(calendarRender()).filter((node) => node.props.role === "gridcell").length, 42, "six weeks are rendered without dropping month-end dates");
  assert.ok(dayButton("2026-05-01") && dayButton("2026-05-31"));
  calendarRender().props.onKeyDownCapture(keyEvent("Escape"));

  const overlayHarness = hookHarness();
  let overlayCloses = 0;
  const { ExpenseDateInput: OverlayCalendar } = load("../src/features/expenses/components/ExpenseDateInput.tsx", {
    react: overlayHarness.hooks, "./calendarDates": calendarDates,
    "./useExpensePicker": { useExpensePicker: () => ({ open: true, inline: false, overlay: true,
      root: { current: null }, trigger: { current: null }, panel: { current: null },
      close: () => { overlayCloses++; }, setOpen() {} }) },
  });
  const overlayTree = overlayHarness.render(OverlayCalendar, calendarProps());
  const overlayPanel = nodes(overlayTree).find((node) => node.props.role === "dialog");
  assert.equal(overlayPanel.props["aria-modal"], true);
  const backdrop = {}, contentTarget = {};
  const backdropEvent = { target: backdrop, currentTarget: backdrop, prevented: false, preventDefault() { this.prevented = true; } };
  overlayPanel.props.onMouseDown(backdropEvent);
  assert.equal(backdropEvent.prevented, true, "backdrop press keeps calendar focus and shields the form actions");
  overlayPanel.props.onClick({ target: contentTarget, currentTarget: backdrop });
  assert.equal(overlayCloses, 0, "calendar content clicks are not backdrop dismissal");
  overlayPanel.props.onClick(backdropEvent);
  assert.equal(overlayCloses, 1, "independent backdrop closes the calendar instead of submitting the underlying form");

  // Stubbed viewport/DOM checks exercise positioning, listeners and focus wiring only.
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  const layoutHarness = hookHarness();
  let layoutEffect;
  const layoutHooks = { ...layoutHarness.hooks, useLayoutEffect: (fn, deps) => {
    layoutHarness.hooks.useEffect(() => { layoutEffect = fn; }, deps);
  } };
  const layoutModule = pickerFor(layoutHarness, { useLayoutEffect: layoutHooks.useLayoutEffect });
  let desktopWidth = 336;
  const layoutRender = () => layoutHarness.render(() => layoutModule.useExpensePicker(desktopWidth), {});
  layoutRender().setOpen(true);
  let layoutState = layoutRender();
  let topLayer = false, focusCalls = 0;
  const content = { scrollHeight: 420, offsetHeight: 422, clientHeight: 420 };
  let calendarContent = content;
  const popup = { style: { setProperty(name, value) { this[name] = value; },
    removeProperty(name) { delete this[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; delete this[name]; } },
    attributes: {}, getAttribute(name) { return this.attributes[name]; },
    setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
    querySelector: () => calendarContent,
    get offsetWidth() { return parseFloat(this.style.width) || 300; }, scrollHeight: 360, matches: () => topLayer,
    showPopover: () => { topLayer = true; }, getBoundingClientRect: () => ({ height: Math.min(360, parseFloat(popup.style.maxHeight) || 360) }) };
  layoutState.panel.current = popup;
  layoutState.trigger.current = { focus: () => { focusCalls++; } };
  const bounds = { left: 100, right: 800, top: 100, bottom: 720 };
  let anchorTop = 500;
  layoutState.root.current = { getBoundingClientRect: () => ({ left: 130, right: 430, top: anchorTop, bottom: anchorTop + 48, width: 300 }),
    closest: () => ({ getBoundingClientRect: () => bounds }), contains: () => false };
  const listeners = new Map();
  const eventTarget = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type) => listeners.delete(type) };
  try {
    globalThis.window = { innerWidth: 1024, innerHeight: 900, ...eventTarget,
      matchMedia: () => ({ matches: window.innerWidth <= 767 || window.innerHeight <= 560 }) };
    globalThis.document = eventTarget;
    let cleanup = layoutEffect();
    assert.equal(topLayer, true);
    assert.equal(popup.style.width, "336px");
    assert.equal(popup.style.left, "130px");
    assert.equal(popup.style.top, "70px", "full six-week calendar flips above the trigger");
    assert.equal(popup.style.maxHeight, "none", "form scroll-body boundaries do not truncate a calendar");
    assert.equal(popup.attributes["data-overlay"], "false");
    assert.equal(popup.style.visibility, "visible");
    cleanup();
    // Full viewport availability, including scroll/resize and visual viewport offsets.
    for (const width of [768, 820, 1024, 1440]) {
      for (const height of [560, 600, 768, 900]) {
        window.innerWidth = width; window.innerHeight = height;
        for (const anchor of [40, Math.floor(height / 2), height - 100, height + 200]) {
          anchorTop = anchor;
          layoutState = layoutRender();
          assert.equal(layoutState.inline, false, "short Desktop/iPad calendars do not enter form flow");
          cleanup = layoutEffect();
          const overlay = popup.attributes["data-overlay"] === "true";
          const panelTop = parseFloat(popup.style.top);
          assert.ok(panelTop >= 0);
          assert.ok(panelTop + (overlay ? height : 422) <= height,
            `${width}x${height} calendar fits above/below or uses the independent overlay`);
          assert.equal(parseFloat(popup.style["--expense-calendar-max-height"]), height - 16);
          assert.equal(layoutRender().overlay, overlay);
          assert.ok(listeners.has("scroll") && listeners.has("resize"), "open calendars reposition on scroll and resize");
          cleanup();
        }
      }
    }
    window.innerWidth = 1024; window.innerHeight = 600; anchorTop = 300;
    layoutState = layoutRender(); cleanup = layoutEffect();
    assert.equal(popup.attributes["data-overlay"], "true", "neither adjacent side fits: use a viewport overlay");
    anchorTop = 40; listeners.get("scroll")();
    assert.equal(popup.attributes["data-overlay"], "false", "scroll can return to an anchored full calendar");
    assert.equal(popup.style.top, "96px");
    window.innerHeight = 300; listeners.get("resize")();
    assert.equal(popup.attributes["data-overlay"], "true");
    assert.equal(popup.style["--expense-calendar-max-height"], "284px", "only physically short viewports constrain the overlay content");
    cleanup();
    window.innerHeight = 900; anchorTop = 300;
    window.visualViewport = { width: 820, height: 560, offsetLeft: 12, offsetTop: 30, ...eventTarget };
    layoutState = layoutRender(); cleanup = layoutEffect();
    assert.equal(popup.style.left, "12px"); assert.equal(popup.style.top, "30px");
    assert.equal(popup.style.width, "820px"); assert.equal(popup.style.height, "560px");
    cleanup(); delete window.visualViewport;
    desktopWidth = undefined; anchorTop = 500;
    calendarContent = null;
    layoutState = layoutRender();
    cleanup = layoutEffect();
    assert.equal(popup.style.width, "300px", "Select popup follows its entire field width");
    cleanup();
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      globalThis.window.innerWidth = width;
      layoutState = layoutRender();
      assert.equal(layoutState.inline, width < 768, `${width}px chooses inline form expansion`);
      assert.equal(layoutState.open, true, "resize does not close or reset a picker");
      cleanup = layoutEffect();
      if (layoutState.inline) {
        assert.equal(popup.style.width, undefined);
        assert.equal(popup.style.maxHeight, undefined, "inline size comes from responsive CSS");
      } else {
        assert.ok(parseFloat(popup.style.left) >= Math.max(bounds.left, 0) + 8);
        assert.ok(parseFloat(popup.style.left) + popup.offsetWidth <= Math.min(bounds.right, width) - 8);
      }
      cleanup();
    }
    globalThis.window.innerHeight = 400;
    assert.equal(layoutRender().inline, true, "low-height landscape also expands inside the scrolling form");
    globalThis.window.innerHeight = 900;
    globalThis.window.visualViewport = { width: 1024, height: 420, offsetLeft: 0, offsetTop: 30, ...eventTarget };
    assert.equal(layoutRender().inline, true, "a reduced visible viewport uses inline presentation");
    delete globalThis.window.visualViewport;
    layoutState = layoutRender();
    cleanup = layoutEffect();
    listeners.get("pointerdown")({ target: {} });
    assert.equal(layoutRender().open, false, "outside pointer closes the picker");
    assert.equal(focusCalls, 1, "outside dismissal restores trigger focus before pointer default behavior");
    cleanup();
    assert.equal(listeners.size, 0);

    calendarValue = "2024-02-29";
    calendarTrigger().props.onClick();
    for (const [width, height] of [[1440, 900], [1024, 768], [820, 600], [768, 560], [390, 700], [375, 560], [320, 400], [1024, 900]]) {
      window.innerWidth = width; window.innerHeight = height;
      assert.equal(calendarPanel().props.popover, width <= 767 ? undefined : "manual");
      assert.equal(focusedDay(), "2024-02-29", "calendar resize preserves focus date and selected day");
      assert.equal(dayButton("2024-02-29").props["aria-pressed"], true);
    }
    calendarRender().props.onKeyDownCapture(keyEvent("Escape"));
    calendarTrigger().props.onClick();
    const calendarTree = calendarRender();
    const last = {};
    calendarPanel().props.ref.current = { contains: () => true, querySelectorAll: () => [last] };
    key = { ...keyEvent("Tab"), target: last };
    calendarTree.props.onKeyDownCapture(key);
    assert.ok(key.prevented && key.stopped, "calendar boundary Tab closes and returns to its trigger");
    assert.equal(calendarPanel(), undefined);

    // The same Expense calendar now adapts dates to Analytics YYYY-MM values.
    for (const width of [320,390,820,1024,1280,1536]) {
      window.innerWidth=width;window.innerHeight=900;
      const h=hookHarness();
      const {ExpenseDateInput:MonthInput}=load('../src/features/expenses/components/ExpenseDateInput.tsx',{
        react:h.hooks,'./calendarDates':calendarDates,'./useExpensePicker':pickerFor(h),
      });
      let value='2024-10',active=true,focusReturns=0;
      const render=()=>h.render(MonthInput,{id:'analytics-start',precision:'month',label:'開始年月',value,min:'2024-10',max:'2026-10',active,invalid:false,describedBy:'period-help',onChange:next=>{value=next;}});
      const trigger=()=>nodes(render()).find(n=>n.props['aria-haspopup']==='dialog');
      const dialog=()=>nodes(render()).find(n=>n.props.role==='dialog');
      const button=date=>nodes(render()).find(n=>n.props['data-date']===date);
      trigger().props.ref.current={focus(){focusReturns++;}};
      const input=nodes(render()).find(n=>n.type==='input');assert.equal(input.props.type,'text');assert.equal(input.props.placeholder,'YYYY-MM');assert.equal(input.props.maxLength,7);
      trigger().props.onClick();assert.equal(dialog().props.popover,width<=767?undefined:'manual');
      assert.equal(nodes(render()).find(n=>n.props['aria-label']==='前の月').props.disabled,true);
      nodes(render()).find(n=>n.props['aria-label']==='次の月').props.onClick();assert.equal(value,'2024-10','month navigation does not apply a draft');
      button('2024-11-28').props.onClick();assert.equal(value,'2024-11');assert.equal(dialog(),undefined);assert.equal(focusReturns,1);
      value='2026-10';trigger().props.onClick();assert.equal(nodes(render()).find(n=>n.props['aria-label']==='次の月').props.disabled,true);
      render().props.onKeyDownCapture(keyEvent('Escape'));assert.equal(dialog(),undefined);assert.equal(focusReturns,2);
      trigger().props.onClick();active=false;render();assert.equal(dialog(),undefined,'filter collapse dismisses the calendar without stealing heading focus');assert.equal(focusReturns,2);
      active=true;value='2026-13';assert.equal(nodes(render()).find(n=>n.type==='input').props.value,'2026-13','invalid text remains a draft for existing Apply validation');
      trigger().props.onClick();assert.ok(button('2026-10-01'),'invalid draft opens within coverage instead of an out-of-range current day');
      render().props.onKeyDownCapture(keyEvent('Escape'));
    }

    // Real single-select component: saved value, active descendant, keyboard, pointer, and inline mode.
    const longName = "長い名前のメンバー".repeat(15);
    for (const options of [dropdown("category").props.options,
      [{ value: "member-a", label: longName }, { value: "member-b", label: "別のメンバー" }, { value: "member-c", label: "もう一人" }]]) {
      const selectHarness = hookHarness();
      const { ExpenseSelect } = load("../src/features/expenses/components/ExpenseSelect.tsx", {
        react: selectHarness.hooks, "./useExpensePicker": pickerFor(selectHarness),
      });
      let selected = options[1].value, selectFocusReturns = 0;
      const selectRender = () => selectHarness.render(ExpenseSelect, { id: "choice", labelId: "choice-label", value: selected,
        options, placeholder: "選択してください", clearLabel: options[0].value === "FOOD" ? "カテゴリーの選択をクリア" : undefined,
        required: true, invalid: true, describedBy: "choice-error", expenseField: "payer",
        onChange: (value) => { selected = value; } });
      const selectTrigger = () => nodes(selectRender()).find((node) => node.props.role === "combobox");
      const listbox = () => nodes(selectRender()).find((node) => node.props.role === "listbox");
      const selectOptions = () => nodes(selectRender()).filter((node) => node.props.role === "option");
      selectTrigger().props.ref.current = { focus: () => { selectFocusReturns++; } };
      assert.equal(selectTrigger().props["aria-expanded"], false);
      assert.equal(selectTrigger().props["aria-required"], true);
      assert.equal(selectTrigger().props["aria-invalid"], true);
      assert.equal(selectTrigger().props["aria-describedby"], "choice-error");
      assert.ok(renderToStaticMarkup(selectRender()).includes(options[1].label), "selected labels are never truncated in markup");
      key = keyEvent("ArrowDown");
      selectTrigger().props.onKeyDown(key);
      assert.equal(key.prevented, true);
      assert.equal(selectTrigger().props["aria-activedescendant"], "choice-option-1");
      assert.equal(selectOptions().filter((node) => node.props["aria-selected"]).length, 1);
      assert.equal(selectOptions()[1].props["aria-selected"], true);
      selectTrigger().props.onKeyDown(keyEvent("ArrowDown"));
      assert.equal(selectTrigger().props["aria-activedescendant"], "choice-option-2");
      assert.equal(selected, options[1].value, "moving the active option does not silently save it");
      const focusBeforeCommit = selectFocusReturns;
      selectTrigger().props.onKeyDown(keyEvent("Enter"));
      assert.equal(selected, options[2].value);
      assert.equal(listbox(), undefined);
      assert.equal(selectFocusReturns, focusBeforeCommit + 1);
      selectTrigger().props.onClick();
      selectTrigger().props.onKeyDown(keyEvent("Home"));
      assert.equal(selectTrigger().props["aria-activedescendant"], "choice-option-0");
      selectTrigger().props.onKeyDown(keyEvent("End"));
      assert.equal(selectTrigger().props["aria-activedescendant"], `choice-option-${options.length - 1}`);
      key = keyEvent("Escape");
      selectRender().props.onKeyDownCapture(key);
      assert.ok(key.prevented && key.stopped, "Select Escape does not close the Expense dialog");
      assert.equal(selected, options[2].value);
      selectTrigger().props.onClick();
      key = keyEvent("Tab");
      const returnsBeforeTab = selectFocusReturns;
      selectRender().props.onKeyDownCapture(key);
      assert.equal(key.prevented, false, "Tab continues normal dialog traversal");
      assert.equal(selectFocusReturns, returnsBeforeTab);
      assert.equal(listbox(), undefined);
      selectTrigger().props.onClick();
      selectOptions()[0].props.onClick();
      assert.equal(selected, options[0].value, "every selectable row has a real member/category value");
      const clearButton = nodes(selectRender()).find((node) => node.props["aria-label"] === "カテゴリーの選択をクリア");
      if (options[0].value === "FOOD") {
        assert.ok(clearButton, "category clear is a separate labelled button");
        selectTrigger().props.onClick();
        assert.ok(!nodes(listbox()).includes(clearButton), "clear is outside the seven-option listbox");
        const focusBeforeClear = selectFocusReturns;
        clearButton.props.onClick();
        assert.equal(selectFocusReturns, focusBeforeClear + 1, "clear restores focus to the field trigger");
        assert.equal(selected, ""); assert.equal(listbox(), undefined);
        assert.equal(nodes(selectRender()).some((node) => node.props["aria-label"] === "カテゴリーの選択をクリア"), false);
        assert.ok(renderToStaticMarkup(selectRender()).includes("選択してください"));
      } else assert.equal(clearButton, undefined, "payer cannot be cleared via a fake option");
      selectTrigger().props.onClick();
      for (const [width, height] of [[320, 700], [375, 700], [390, 400], [768, 900], [1024, 900], [1440, 900]]) {
        window.innerWidth = width; window.innerHeight = height;
        assert.equal(listbox().props.popover, width <= 767 || height <= 560 ? undefined : "manual");
        assert.equal(selectOptions().filter((node) => node.props["aria-selected"]).length, selected ? 1 : 0, "Select resize preserves the selection");
      }
      selectOptions()[1].props.onClick();
      assert.equal(selected, options[1].value);
      assert.equal(listbox(), undefined);
      selected = "";
      assert.ok(renderToStaticMarkup(selectRender()).includes("選択してください"));
      selectTrigger().props.onClick();
      assert.equal(selected, "", "opening an unselected field does not select a real member/category implicitly");
      assert.equal(selectOptions().filter((node) => node.props["aria-selected"]).length, 0);
      assert.equal(selectOptions().length, options.length);
      selectTrigger().props.onKeyDown(keyEvent("Enter"));
      assert.equal(selected, options[0].value, "only an explicit commit selects the first real option");
    }
    const emptyHarness = hookHarness();
    const { ExpenseSelect: EmptySelect } = load("../src/features/expenses/components/ExpenseSelect.tsx", {
      react: emptyHarness.hooks, "./useExpensePicker": pickerFor(emptyHarness),
    });
    const emptyRender = () => emptyHarness.render(EmptySelect, { id: "empty-payer", labelId: "payer-label", value: "",
      options: [], placeholder: "支払者を選択", required: true, onChange: () => assert.fail("must not auto-select a payer") });
    for (const key of ["ArrowDown", "Enter", " ", "End"]) {
      nodes(emptyRender()).find((node) => node.props.role === "combobox").props.onKeyDown(keyEvent(key));
      assert.equal(nodes(emptyRender()).some((node) => node.props.role === "listbox"), false);
    }
    assert.ok(renderToStaticMarkup(emptyRender()).includes("支払者を選択"));
  } finally {
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
  const dateCss = readFileSync(new URL("../src/features/expenses/components/ExpenseDateInput.module.css", import.meta.url), "utf8");
  const pickerCss = readFileSync(new URL("../src/features/expenses/components/ExpensePicker.module.css", import.meta.url), "utf8");
  assert.match(pickerCss, /\.panel \{[^}]*position: fixed[^}]*color-background-elevated[^}]*overflow-y: auto/);
  assert.match(pickerCss, /\.inline \{[^}]*position: static[^}]*width: 100%/);
  assert.match(dateCss, /\.inlineCalendar \{ max-height: none; overflow: visible/);
  assert.match(dateCss, /data-overlay="true"[^}]*display: grid[^}]*color-background-overlay/);
  assert.match(dateCss, /data-overlay="true"[^}]*max-height: var\(--expense-calendar-max-height\)[^}]*overflow-y: auto/);
  assert.match(dateCss, /\.grid \{[^}]*table-layout: fixed[^}]*font-size: var\(--font-size-md\)/);
  assert.match(dateCss, /aria-current="date"[^}]*color-state-selected-indicator/);
  assert.match(dateCss, /aria-pressed="true"[^}]*color-action-primary[^}]*color-text-on-primary/);
  const selectCss = readFileSync(new URL("../src/features/expenses/components/ExpenseSelect.module.css", import.meta.url), "utf8");
  assert.match(selectCss, /\.trigger \{[^}]*font-size: var\(--font-size-md\)/);
  assert.match(selectCss, /\.option \{[^}]*min-height: 3rem/);
  assert.match(selectCss, /overflow-wrap: anywhere/);
  assert.match(selectCss, /\.menu \{[^}]*max-height: min\(20rem, 50dvh\)/);
  assert.match(dateCss, /\.panel\.inlineCalendar button \{ min-height: 3rem/);
  for (const file of ["AddExpenseModal.tsx", "ExpenseDetailDialog.tsx"]) {
    const source = readFileSync(new URL(`../src/features/expenses/components/${file}`, import.meta.url), "utf8");
    assert.match(source, /className=\{styles.body\} ref=\{fieldsRef\} data-expense-picker-boundary/);
  }
} finally {
  globalThis.Date = NativeDate;
}
console.log("Project Analytics fixtures, states, query races, invalidation, responsive markup, colors/contrast, disclosures and Expense dates: PASS");
