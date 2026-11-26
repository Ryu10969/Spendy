import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { createServer } from "vite";

function load(relative, imports = {}, dev = false) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8").replaceAll("import.meta.env.DEV", String(dev));
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, (name) => {
    if (name === "react/jsx-runtime") return jsxRuntime;
    if (name === "react") return imports.react ?? React;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  });
  return module.exports;
}
const base = "../src/pages/HomePage/monthlyOverview/";
const months = load("../src/features/projects/monthSelection.ts");
const presentation = load(`${base}monthlyOverviewPresentation.ts`);
const fixtures = load(`${base}monthlyOverviewPreviewData.ts`);
const overviewImports = {
  "../../../features/projects/monthSelection": months,
  "../../../utils/formatMoney": load("../src/utils/formatMoney.ts"),
  "./monthlyOverviewPresentation": presentation,
};
const { MonthlyOverview, compositionBarMotion } = load(`${base}MonthlyOverview.tsx`, overviewImports);
const { MonthlyOverview: DevelopmentOverview } = load(`${base}MonthlyOverview.tsx`, overviewImports, true);
const normal = fixtures.previewState("2026-10", "normal");
const props = { month: "2026-10", latestMonth: "2026-10", state: normal, onMonthChange() {} };
const markup = (overrides = {}) => renderToStaticMarkup(React.createElement(MonthlyOverview, { ...props, ...overrides }));
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (predicate(tree)) return tree;
  return React.Children.toArray(tree.props?.children).map((child) => find(child, predicate)).find(Boolean);
}
assert.equal(months.currentMonth(new Date(2026, 0, 1)), "2026-01");
for (const [month, previous, next] of [
  ["2026-01", "2025-12", "2026-02"], ["2025-12", "2025-11", "2026-01"],
  ["0001-01", null, "0001-02"], ["9999-12", "9999-11", null],
]) {
  const changes = [];
  const tree = MonthlyOverview({ ...props, month, latestMonth: "9999-12", state: fixtures.previewState(month, "normal"), onMonthChange: (value) => changes.push(value) });
  for (const [label, expected] of [["前月", previous], ["翌月", next]]) {
    const button = find(tree, (node) => node.props["aria-label"] === label);
    assert.equal(button.props.disabled, expected === null);
    button.props.onClick();
    if (expected) assert.equal(changes.at(-1), expected);
  }
  assert.ok(!changes.includes("0000-12"));
}
assert.equal(find(MonthlyOverview(props), (node) => node.props["aria-label"] === "翌月").props.disabled, true);
assert.equal(months.nextMonth("2027-01", "2026-10"), null);
const html = markup();
assert.doesNotMatch(html, /分析を見る|href="\/analytics"/, "production presentation never offers an available Analytics link");
const devHtml = renderToStaticMarkup(React.createElement(DevelopmentOverview, props));
assert.doesNotMatch(devHtml, /分析を見る|href="\/analytics"/);
const devTop = DevelopmentOverview(props);
const analyticsLink = find(devTop, (node) => node.props.to === "/analytics");
assert.equal(analyticsLink, undefined);
assert.equal(find(devTop, (node) => node.props.className === "monthNavigation").props.children.length, 3, "month controls remain separate from the link");
assert.equal(devTop.props.onClick, undefined, "the overview card is not a navigation target");
for (const text of ["¥153,800", "¥108,500", "¥45,300", "¥128,600", "+¥25,200", "-¥8,100", "-6.95%", "+277.50%", "70.55%", "29.45%", "90.67%", "9.33%", "対象イベント 2件（前月 1件）", "Project全体の支出", "今月・集計途中"]) assert.ok(html.includes(text), text);
assert.match(html, /flex-grow:108500/);
assert.match(html, /flex-grow:45300/);
assert.match(html, /class="barFill"/, "one stable fill contains both proportional segments");
assert.match(html, /aria-live="polite"/);
assert.match(markup({ month: "2026-09", state: fixtures.previewState("2026-09", "normal") }), /2026年9月/);
assert.doesNotMatch(markup({ month: "2026-09" }), /¥153,800|70.55%/, "stale month result is suppressed");
for (const scenario of Object.keys(fixtures.previewScenarios)) {
  const state = fixtures.previewState("2026-10", scenario);
  const result = markup({ state });
  if (state.status !== "ready") assert.doesNotMatch(result, /[¥%]|対象イベント/);
  if (scenario === "zero") { assert.match(result, /¥0/); assert.match(result, /-100.00%/); assert.match(result, /支出0円のため構成比なし/); }
  if (scenario === "previousZero") { assert.match(result, /—（前月の支出が0円）/); assert.doesNotMatch(result, /\+100.00%|Infinity|NaN/); }
  if (scenario === "bothZero") { assert.match(result, /—（両月の支出が0円）/); assert.doesNotMatch(result, /0.00%/); }
  if (scenario === "empty") assert.match(result, /集計対象のプロジェクトはありません/);
}
assert.match(markup({ state: fixtures.previewState("2026-10", "bothZero") }), /対象プロジェクトのこの月の支出はありません/);
const unavailable = { status: "unavailable", data: normal.data }; // Runtime caller retaining old data still cannot expose it.
assert.doesNotMatch(markup({ state: unavailable }), /[¥%]|対象イベント/);
assert.match(markup({ state: { status: "loading" } }), /aria-busy="true"/);
assert.match(markup({ state: { status: "error" } }), /role="alert"/);
let retried = false;
const errorTree = MonthlyOverview({ ...props, state: { status: "error", onRetry: () => { retried = true; } } });
find(errorTree, (node) => node.type === "button" && node.props.children === "再試行").props.onClick();
assert.ok(retried);
const first = markup({ month: "0001-01", state: fixtures.previewState("0001-01", "normal") });
assert.match(first, /—（比較対象月なし）/);
assert.doesNotMatch(first, /前月 ¥|0000/);
const rounded = structuredClone(normal);
rounded.data.selected = { totalExpense: 32, continuousExpense: 1, eventExpense: 31, eventProjectCount: 1, contribution: { continuousPercentage: "3.13", eventPercentage: "96.88" } };
assert.match(markup({ state: rounded }), /3.13%/);
assert.match(markup({ state: rounded }), /96.88%/);
rounded.data.selected = { totalExpense: Number.MAX_SAFE_INTEGER, continuousExpense: Number.MAX_SAFE_INTEGER, eventExpense: 0, eventProjectCount: 0, contribution: { continuousPercentage: "100.00", eventPercentage: "0.00" } };
assert.match(markup({ state: rounded }), /¥9,007,199,254,740,991/);

// Smartphone-only DOM: header caption owns status, the footer/previous type rows
// are absent, while amounts, bounds, states and existing handlers are retained.
for (const scenario of Object.keys(fixtures.previewScenarios)) {
  const state = fixtures.previewState("2026-10", scenario);
  const result = markup({ state, smartphone: true });
  assert.match(result, /data-monthly-overview-card/);
  assert.doesNotMatch(result, /<footer|前月の構成比|管理中・Homeに保存済み/);
  assert.match(result, /class="monthCaption"><strong[^>]*>2026年10月<\/strong><span class="currentMonth">今月・集計途中<\/span>/);
  assert.doesNotMatch(result, /class="actions"/);
  if (state.status === "ready") {
    assert.equal((result.match(/class="typeHeading"/g) ?? []).length, 2);
    assert.equal((result.match(/class="previous"/g) ?? []).length, 1, "only hero keeps a separate previous total");
    for (const amount of [state.data.selected.totalExpense, state.data.selected.continuousExpense, state.data.selected.eventExpense]) {
      assert.ok(result.includes(overviewImports["../../../utils/formatMoney"].formatYen(amount)));
    }
    assert.match(result, /class="count">対象 /);
  } else assert.doesNotMatch(result, /[¥%]|class="typeHeading"/);
}
assert.match(html, /<footer/);assert.match(html, /前月の構成比/);
const mobileTree = MonthlyOverview({ ...props, smartphone: true });
const mobileChanges = [];
const mobileControls = MonthlyOverview({ ...props, smartphone: true, onMonthChange: month => mobileChanges.push(month) });
find(mobileControls, n => n.props["aria-label"] === "前月").props.onClick();
assert.deepEqual(mobileChanges, ["2026-09"]);
assert.equal(find(mobileTree, n => n.props["aria-label"] === "翌月").props.disabled, true);
assert.doesNotMatch(markup({ smartphone: true, month: "2026-09", state: fixtures.previewState("2026-09", "normal") }), /今月・集計途中/);
assert.match(markup({ smartphone: true, state: rounded }), /¥9,007,199,254,740,991/);

// One comparison pill serves every total/type and viewport, retaining exact
// signed amounts, precision and explicit unavailable-rate reasons.
const comparisons = [
  [{ comparisonState: "COMPARABLE", difference: 25200, percentageChange: "19.60" }, "increase", "↑ ", "+¥25,200 (+19.60%)"],
  [{ comparisonState: "COMPARABLE", difference: -8100, percentageChange: "-6.95" }, "decrease", "↓ ", "-¥8,100 (-6.95%)"],
  [{ comparisonState: "COMPARABLE", difference: 0, percentageChange: "0.00" }, "unchanged", "→ ", "¥0 (0.00%)"],
  [{ comparisonState: "NO_PREVIOUS_DATA", difference: 100, percentageChange: null }, "increase", "↑ ", "+¥100 —（前月の支出が0円）"],
  [{ comparisonState: "BOTH_MONTHS_EMPTY", difference: 0, percentageChange: null }, "unchanged", "→ ", "¥0 —（両月の支出が0円）"],
  [{ comparisonState: "NO_PREVIOUS_MONTH", difference: null, percentageChange: null }, "unavailable", "", "—（比較対象月なし）"],
  [{ comparisonState: "COMPARABLE", difference: 1, percentageChange: "0.00" }, "increase", "↑ ", "+¥1 (0.00%)"],
  [{ comparisonState: "COMPARABLE", difference: -1, percentageChange: "-0.00" }, "decrease", "↓ ", "-¥1 (-0.00%)"],
  [{ comparisonState: "COMPARABLE", difference: Number.MAX_SAFE_INTEGER, percentageChange: "99999999999999.99" }, "increase", "↑ ", "+¥9,007,199,254,740,991 (+99999999999999.99%)"],
];
for (const [value, direction, arrow, text] of comparisons) {
  const state = structuredClone(normal);
  state.data.comparison = { total: value, continuous: value, event: value };
  for (const smartphone of [false, true]) {
    const result = markup({ state, smartphone });
    const pills = [...result.matchAll(/<p class="comparison" data-direction="([^"]+)">([\s\S]*?)<\/p>/g)];
    assert.equal(pills.length, 3, "total, Continuous and Event share exactly one pill each");
    for (const [, actualDirection, pill] of pills) {
      assert.equal(actualDirection, direction);
      assert.equal(pill.replace(/<[^>]*>/g, ""), arrow + "前月比 " + text);
      if (value.difference === null) assert.doesNotMatch(pill, /↑|↓|→|<strong>/);
      else {
        assert.match(pill, /class="comparisonArrow" aria-hidden="true"/);
        const emphasized = pill.match(/<strong>(.*?)<\/strong>/)?.[1];
        assert.equal(emphasized, value.comparisonState === "COMPARABLE" ? text : overviewImports["../../../utils/formatMoney"].formatSignedYen(value.difference));
      }
      if (value.percentageChange === null) assert.doesNotMatch(pill, /%|Infinity|NaN/);
    }
    assert.doesNotMatch(result, /desktopComparison|mobileComparison/, "no duplicated viewport-specific content");
  }
}

// Both production entry branches (including the preview query) remain preparation-only.
const lazyModules = [];
const imports = { react: { ...React, lazy: () => { const component = () => null; lazyModules.push(component); return component; } } };
const production = load(`${base}HomeMonthlyOverview.tsx`, imports).HomeMonthlyOverview;
for (const search of ["", "?monthlyOverviewPreview=1"]) {
  globalThis.window = { location: { search } };
  const productionHtml = renderToStaticMarkup(React.createElement(production));
  assert.match(productionHtml, /準備中/);
  assert.doesNotMatch(productionHtml, /分析を見る|href="\/analytics"/);
  const phoneProduction = renderToStaticMarkup(React.createElement(production, { smartphone: true }));
  assert.match(phoneProduction, /準備中/);
  assert.doesNotMatch(phoneProduction, /[¥%]|data-monthly-overview-card|開発用データ/);
}
assert.equal(lazyModules.length, 0);
const development = load(`${base}HomeMonthlyOverview.tsx`, imports, true).HomeMonthlyOverview;
assert.equal(lazyModules.length, 2);
for (const [search, showControls] of [["", false], ["?monthlyOverviewPreview=1", true], ["?monthlyOverviewPreview=0", false]]) {
  globalThis.window.location.search = search;
  const tree = development();
  assert.equal(tree.type, React.Suspense);
  assert.equal(tree.props.children.type, lazyModules[showControls ? 0 : 1]);
  assert.equal(tree.props.children.props.showControls, showControls ? true : undefined);
  assert.equal(development({ smartphone: true }).props.children.props.smartphone, true);
}

const previewImports = {
  react: React,
  "../../../features/projects/monthSelection": months,
  "./MonthlyOverview": { MonthlyOverview: DevelopmentOverview },
  "./monthlyOverviewPreviewData": fixtures,
};
const Preview = load(`${base}MonthlyOverviewPreview.tsx`, previewImports).default;
for (const showControls of [false, true]) {
  const result = renderToStaticMarkup(React.createElement(Preview, { showControls }));
  assert.match(result, /開発用データ — 実際の支出ではありません/);
  assert.match(result, /¥153,800/);
  assert.match(result, /70.55%/);
  assert.match(result, /aria-label="前月"/);
  assert.doesNotMatch(result, /分析を見る|href="\/analytics"/);
  assert.equal(result.includes("<select"), showControls);
  assert.equal(result.includes("比較不可（0001年1月）"), showControls);
  assert.equal(result.includes("今月に戻る"), showControls);
  const mobile = renderToStaticMarkup(React.createElement(Preview, { showControls, smartphone: true }));
  assert.match(mobile, /開発用データ — 実際の支出ではありません/);
  assert.ok(mobile.indexOf("</aside>") < mobile.indexOf("data-monthly-overview-card"), "warning stays outside the monthly card");
  assert.doesNotMatch(mobile, /<footer|前月の構成比|管理中・Homeに保存済み/);
}

// Exercise the retained validation controls and month changes without a browser.
let previewValues = [], previewIndex = 0;
const InteractivePreview = load(`${base}MonthlyOverviewPreview.tsx`, {
  ...previewImports,
  "./MonthlyOverview": { MonthlyOverview },
  react: { useState: (initial) => {
    const index = previewIndex++;
    if (!(index in previewValues)) previewValues[index] = typeof initial === "function" ? initial() : initial;
    return [previewValues[index], (next) => { previewValues[index] = next; }];
  } },
}).default;
function previewTree() { previewIndex = 0; return InteractivePreview({ showControls: true }); }
for (const scenario of Object.keys(fixtures.previewScenarios)) {
  find(previewTree(), (node) => node.type === "select").props.onChange({ target: { value: scenario } });
  const overview = find(previewTree(), (node) => node.type === MonthlyOverview);
  assert.equal(overview.props.state.status, ["loading", "error", "unavailable"].includes(scenario) ? scenario : "ready");
  if (scenario === "error") {
    overview.props.state.onRetry();
    assert.equal(find(previewTree(), (node) => node.type === MonthlyOverview).props.state.status, "ready");
  }
}
find(previewTree(), (node) => node.type === "button" && node.props.children === "比較不可（0001年1月）").props.onClick();
assert.equal(find(previewTree(), (node) => node.type === MonthlyOverview).props.month, "0001-01");
find(previewTree(), (node) => node.type === "button" && node.props.children === "今月に戻る").props.onClick();
assert.equal(find(previewTree(), (node) => node.type === MonthlyOverview).props.month, months.currentMonth());
find(previewTree(), (node) => node.type === MonthlyOverview).props.onMonthChange("2025-12");
assert.equal(find(previewTree(), (node) => node.type === MonthlyOverview).props.state.data.month, "2025-12");

// The real query observer owns request lifetimes. Supply controllable HTTP completions.
const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
const analytics = load("../src/features/analytics/analyticsQueries.ts", {
  "@tanstack/react-query": {}, "../../api/analyticsApi": {}, "./analyticsPresentation": {},
});
const reads = [];
let activeMonth = "2026-10", query, options;
const Local = load(`${base}LocalMonthlyOverview.tsx`, {
  react: { useState: (initial) => typeof initial === "function" ? [initial()] : [activeMonth, (next) => { activeMonth = next; }] },
  "@tanstack/react-query": { useQueryClient: () => client, useQuery: (next) => {
    options = next;
    return query?.getCurrentResult() ?? { fetchStatus: "fetching", isPending: true };
  } },
  "../../../api/client": { apiRequest: (path, { signal }) => new Promise((resolve, reject) => reads.push({ path, signal, resolve, reject })) },
  "../../../features/analytics/analyticsQueries": analytics,
  "../../../features/projects/monthSelection": { currentMonth: () => "2026-10" },
  "./MonthlyOverview": { MonthlyOverview },
}).default;
const localView = () => Local({ smartphone: true }).props;
const reply = (month, scenario = "normal") => {
  const { population, ...data } = fixtures.previewState(month, scenario).data;
  return { projectCount: population.projectCount, ...data };
};
const tick = () => new Promise(setImmediate);
assert.equal(localView().state.status, "loading");
query = new QueryObserver(client, options);
const unsubscribe = query.subscribe(() => {});
assert.match(reads[0].path, /\/api\/local\/home\/monthly-overview\?month=2026-10$/);
localView().onMonthChange("2026-09");
localView();
query.setOptions(options);
assert.equal(reads[0].signal.aborted, true);
reads[1].reject(new Error("offline"));
await tick();
assert.equal(localView().state.status, "error");
localView().state.onRetry();
assert.equal(localView().state.status, "loading");
reads[2].resolve(reply("2026-09", "empty"));
reads[0].resolve(reply("2026-10"));
await tick();
assert.equal(localView().state.data.month, "2026-09");
assert.equal(localView().state.data.population.projectCount, 0);
assert.match(renderToStaticMarkup(React.createElement(MonthlyOverview, localView())), /集計対象のプロジェクトはありません/);
const olderFetch = query.refetch();
const invalidation = analytics.invalidateProjectAnalytics(client, "affected-project");
assert.equal(localView().state.status, "loading");
assert.equal(reads[3].signal.aborted, true);
await tick();
reads[4].resolve(reply("2026-09"));
await invalidation;
reads[3].resolve(reply("2026-09", "empty"));
await olderFetch;
assert.equal(localView().state.data.selected.totalExpense, 153800);
const localMarkup = renderToStaticMarkup(React.createElement(MonthlyOverview, localView()));
assert.match(localMarkup, /開発用DBの支出/);
assert.match(localMarkup, /¥153,800/);
assert.doesNotMatch(localMarkup, /管理中・Homeに保存済み/);
unsubscribe();
client.clear();

// Verify the actual production bundle excludes the dev module, marker and trigger.
const assets = new URL("../dist/assets/", import.meta.url);
const built = readdirSync(assets).filter((name) => name.endsWith(".js")).map((name) => readFileSync(new URL(name, assets), "utf8")).join("\n");
assert.ok(built.length > 0);
assert.doesNotMatch(built, /monthlyOverviewPreview|開発用データ — 実際の支出ではありません|比較不可（0001年1月）|70\.55|277\.50/);
assert.doesNotMatch(built, /\/api\/local\/home\/monthly-overview|開発用DBの支出/);
assert.doesNotMatch(built, /分析を見る/);

// Vite's development transform resolves the preview module; no browser or port is used.
const server = await createServer({ root: new URL("../", import.meta.url).pathname, server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
try {
  for (const path of ["HomeMonthlyOverview.tsx", "LocalMonthlyOverview.tsx", "MonthlyOverviewPreview.tsx", "MonthlyOverview.tsx"]) {
    const result = await server.transformRequest(`/src/pages/HomePage/monthlyOverview/${path}`);
    assert.ok(result?.code);
    if (path === "HomeMonthlyOverview.tsx") { assert.match(result.code, /"DEV":\s*true/); assert.match(result.code, /import\("\/src\/pages\/HomePage\/monthlyOverview\/MonthlyOverviewPreview.tsx"\)/); }
  }
} finally { await server.close(); }

const css = readFileSync(new URL(`${base}MonthlyOverview.module.css`, import.meta.url), "utf8");
assert.match(css, /data-home-theme="dark"/);
assert.match(css, /grid-template-columns: 1fr auto 1fr/);
assert.match(css, /overflow-wrap: anywhere/);
assert.doesNotMatch(css, /analyticsLink/);
assert.doesNotMatch(css, /animation:|transition:/, "frame controller owns motion and live reduced-motion cancellation");
assert.match(css, /transform-origin: left center/);

// Exercise the actual controller with deterministic frames/viewport/media events.
// These are DOM-style writes, not native browser layout/paint verification.
const savedGlobals = Object.fromEntries(["window", "performance", "requestAnimationFrame", "cancelAnimationFrame", "IntersectionObserver"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  let now = 0, id = 0, reduced = false, observer, disconnected = false;
  const frames = new Map(), mediaListeners = new Set();
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = cb => { frames.set(++id, cb); return id; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  globalThis.window = { matchMedia: () => ({ get matches() { return reduced; }, addEventListener: (_, cb) => mediaListeners.add(cb), removeEventListener: (_, cb) => mediaListeners.delete(cb) }) };
  globalThis.IntersectionObserver = class {
    constructor(cb, options) { observer = cb; assert.equal(options.threshold, 0); }
    observe(node) { assert.ok(node); }
    disconnect() { disconnected = true; }
  };
  const step = ms => { now += ms; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(now)); };
  const enter = value => observer([{ isIntersecting: value }]);
  const reduce = value => { reduced = value; [...mediaListeners].forEach(cb => cb()); };
  const fill = { style: {} }, continuous = { style: {} }, event = { style: {} };
  const controller = compositionBarMotion({}, fill, continuous, event, 0.7);
  const ratio = () => Number(continuous.style.flexGrow);
  const reveal = () => Number(fill.style.transform.match(/scaleX\(([^)]+)\)/)[1]);
  const conserved = () => assert.ok(Math.abs(ratio() + Number(event.style.flexGrow) - 1) < 1e-12);
  assert.equal(reveal(), 0); assert.equal(frames.size, 0);
  controller.update(0.35); // Latest month before first visibility.
  assert.equal(frames.size, 0);
  enter(true); assert.equal(reveal(), 0); assert.equal(frames.size, 1);
  step(275); assert.ok(reveal() > 0 && reveal() < 1); assert.equal(ratio(), 0.35); conserved();
  controller.update(0.72); // Retarget during the initial reveal, without a reset.
  const partial = reveal(); step(100);
  assert.ok(reveal() > partial && reveal() < 1); assert.ok(ratio() > 0.35 && ratio() < 0.72); conserved();
  const current = ratio(); controller.update(0.2); assert.equal(ratio(), current);
  step(275); assert.ok(ratio() < current && ratio() > 0.2); conserved();
  step(275); assert.equal(ratio(), 0.2); assert.equal(reveal(), 1); assert.equal(frames.size, 0);
  controller.update(0.2); assert.equal(frames.size, 0, "same ratio/month/theme cannot restart motion");
  enter(false); enter(true); assert.equal(frames.size, 0, "scroll re-entry cannot replay entrance");
  controller.update(1); step(550); assert.equal(ratio(), 1); conserved();
  controller.update(0); step(550); assert.equal(ratio(), 0); conserved();
  controller.update(null); assert.equal(reveal(), 0); assert.equal(frames.size, 0);
  controller.update(0.6); step(550); assert.equal(ratio(), 0.6); assert.equal(reveal(), 1);
  controller.update(0.9); step(100); reduce(true);
  assert.equal(ratio(), 0.9); assert.equal(reveal(), 1); assert.equal(frames.size, 0);
  controller.update(0.1); assert.equal(ratio(), 0.1); assert.equal(frames.size, 0);
  reduce(false); assert.equal(frames.size, 0);
  enter(false); controller.update(0.8); assert.equal(ratio(), 0.8); assert.equal(frames.size, 0);
  enter(true); assert.equal(frames.size, 0);
  controller.update(0.4); const stale = [...frames.values()]; controller.dispose();
  assert.equal(frames.size, 0); assert.equal(mediaListeners.size, 0); assert.ok(disconnected);
  const stopped = ratio(); stale.forEach(cb => cb(now + 1000)); assert.equal(ratio(), stopped);
  reduce(true);
  const immediate = compositionBarMotion({}, fill, continuous, event, 1);
  assert.equal(ratio(), 1); assert.equal(reveal(), 1); assert.equal(frames.size, 0); immediate.dispose();
  reduce(false);
  delete globalThis.IntersectionObserver;
  const unsupported = compositionBarMotion({}, fill, continuous, event, 0.3);
  assert.equal(ratio(), 0.3); assert.equal(reveal(), 1); unsupported.dispose();
} finally {
  for (const [key, descriptor] of Object.entries(savedGlobals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}
console.log("Home composition motion: viewport waiting/entry/partial/complete, live-share retarget, conservation, same-value/re-entry, 0/100/empty, reduced-motion changes, offscreen, cleanup and unsupported fallback PASS (controlled DOM/frame model; native paint unverified).");
console.log("Home monthly overview: month boundaries/callbacks, money/percentages, all display states, stale data suppression, retry, dev transform and production exclusion passed. Theme/responsiveness checked structurally only.");
