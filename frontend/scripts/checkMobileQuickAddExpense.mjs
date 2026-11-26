import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { createMemoryRouter } from "react-router-dom";

// Executes source components/hooks with deterministic effects; no browser APIs launched.
function harness(path, imports = {}) {
  let index = 0, writes = 0, lateWrites = 0, disposed = false;
  const slots = [], effects = [];
  const effect = (callback, deps) => {
    const i = index++, old = slots[i];
    if (!old || !deps || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
      slots[i] = { deps, callback, cleanup: old?.cleanup };
      effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = callback(); });
    }
  };
  const react = { ...React, useId: () => "test", useEffect: effect, useLayoutEffect: effect,
    useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
    useState(value) { const i = index++; slots[i] ??= { value: typeof value === "function" ? value() : value };
      return [slots[i].value, next => { writes++; if (disposed) lateWrites++; slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; } };
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, name => {
    if (name === "react") return react;
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    assert.ok(name in imports, `Missing stub ${name}`); return imports[name];
  });
  return { module: module.exports, run(name, ...args) { index = 0; return module.exports[name](...args); },
    flush() { while (effects.length) effects.shift()(); },
    replayEffects() { slots.forEach(s => { if (s?.callback) { s.cleanup?.(); s.cleanup = s.callback(); } }); },
    get writes() { return writes; }, get lateWrites() { return lateWrites; },
    dispose() { disposed = true; slots.forEach(s => s?.cleanup?.()); } };
}
const walk = node => [node, ...React.Children.toArray(node?.props?.children).flatMap(walk)];
const text = node => typeof node === "string" ? node : React.Children.toArray(node?.props?.children).map(text).join("");
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
globalThis.document = { body: {} };

// Picker states, server page identity (including duplicate names), cancellation.
let query, queryArgs, retried = 0, picked;
const picker = harness("components/navigation/QuickAddProjectChoices.tsx", {
  "../../features/projects/quickAddProjectQueries": { useQuickAddProjectPageQuery: (...args) => { queryArgs = args; return query; } },
});
const navigateCalls = [];
const navigate = (...args) => navigateCalls.push(args);
const nav = harness("components/navigation/ResponsiveNavigation.tsx", {
  "react-dom": { createPortal: n => n },
  "react-router-dom": { Link: "a", useLocation: () => ({ pathname: "/" }), useNavigate: () => navigate },
  "./QuickAddProjectChoices": picker.module,
  "../../hooks/useAccessibleDialog": { useAccessibleDialog() {} },
});
let closed = 0;
const props = { theme: "light", triggerId: "plus", onClose: () => closed++, onSelectProject: token => { picked = token; } };
let sheet = nav.run("QuickAddSheet", props);
walk(sheet).find(n => n.type === "button" && text(n).includes("支出を追加")).props.onClick();
sheet = nav.run("QuickAddSheet", props);
assert.equal(walk(sheet).find(n => n.props?.role === "dialog").props["aria-label"], "プロジェクトを選択");
assert.ok(walk(sheet).some(n => n.type?.name === "QuickAddProjectChoices"));
function renderChoices() { return picker.run("QuickAddProjectChoices", { onSelect: props.onSelectProject }); }
const pageData = (items, totalElements = items.length, page = 0) => ({ items, totalElements, totalPages: Math.ceil(totalElements / 5), page, size: 5 });
const success = data => ({ data, isSuccess: true, isFetching: false });
const projectButtons = tree => walk(tree).filter(n => n.type === "button" && n.props.children?.[0]?.props?.className === "projectName");
const pageButton = (tree, label) => walk(tree).find(n => n.type === "button" && text(n) === label);
const search = (tree, value) => walk(tree).find(n => n.type === "input").props.onChange({ target: { value } });
query = { isPending: true };
assert.match(text(renderChoices()), /読み込んでいます/);
assert.deepEqual(queryArgs, ["", 0]);
assert.ok(walk(renderChoices()).some(n => n.type === "input"), "search stays visible while loading");
query = { isError: true, data: pageData([{ status: "ACTIVE", name: "stale" }]), refetch: () => retried++ };
let tree = renderChoices(); assert.match(text(tree), /読み込めません/); assert.doesNotMatch(text(tree), /stale|ありません/);
walk(tree).find(n => n.type === "button").props.onClick(); assert.equal(retried, 1);
for (const items of [[], [{ status: "ARCHIVED", name: "old" }]]) {
  query = success(pageData(items)); assert.match(text(renderChoices()), /選択できるプロジェクトがありません/);
}
query = success(pageData([
  { publicToken: "continuous", name: "同じ名前", status: "ACTIVE", type: "CONTINUOUS" },
  { publicToken: "event", name: "同じ名前", status: "ACTIVE", type: "EVENT" },
  { publicToken: "old", name: "除外", status: "ARCHIVED", type: "EVENT" },
]));
tree = renderChoices(); const buttons = projectButtons(tree);
assert.equal(buttons.length, 2); assert.doesNotMatch(text(tree), /除外/);
buttons.forEach((button, i) => { button.props.onClick(); assert.equal(picked, i ? "event" : "continuous"); });
const allProjects = Array.from({ length: 100 }, (_, i) => ({ publicToken: `p${i}`, name: `Project ${i}`, status: "ACTIVE", type: i % 2 ? "EVENT" : "CONTINUOUS" }));
for (const count of [0, 1, 5, 6, 100]) {
  query = success(pageData(allProjects.slice(0, Math.min(count, 5)), count));
  tree = renderChoices(); assert.equal(projectButtons(tree).length, Math.min(count, 5));
  assert.equal(pageButton(tree, "前へ").props.disabled, true);
  assert.equal(pageButton(tree, "次へ").props.disabled, count <= 5);
  if (count > 5) {
    const totalPages = Math.ceil(count / 5);
    for (let page = 1; page < totalPages; page++) {
      pageButton(tree, "次へ").props.onClick();
      query = { isPending: true, isFetching: true }; tree = renderChoices();
      assert.deepEqual(queryArgs, ["", page]); assert.equal(projectButtons(tree).length, 0);
      assert.equal(pageButton(tree, "次へ").props.disabled, true);
      query = success(pageData(allProjects.slice(page * 5, Math.min(count, (page + 1) * 5)), count, page));
      tree = renderChoices();
      assert.equal(projectButtons(tree).length, Math.min(5, count - page * 5));
      assert.equal(pageButton(tree, "次へ").props.disabled, page === totalPages - 1);
    }
    assert.equal(pageButton(tree, "前へ").props.disabled, false);
    // Changing a search atomically resets the page, even during a page fetch.
    query = { isPending: true, isFetching: true }; tree = renderChoices(); search(tree, "  Target  ");
    tree = renderChoices(); assert.deepEqual(queryArgs, ["Target", 0]); assert.equal(projectButtons(tree).length, 0);
    query = success(pageData([])); tree = renderChoices(); assert.match(text(tree), /選択できるプロジェクトがありません/);
    search(tree, ""); tree = renderChoices();
  }
}
// No selectable stale rows, even if a cached/refetch result is supplied.
query = { ...success(pageData(allProjects.slice(0, 5), 100)), isFetching: true };
tree = renderChoices(); search(tree, "a"); tree = renderChoices(); search(tree, "ab"); tree = renderChoices();
assert.deepEqual(queryArgs, ["ab", 0]); assert.equal(projectButtons(tree).length, 0);
assert.equal(pageButton(tree, "前へ").props.disabled, true); assert.equal(pageButton(tree, "次へ").props.disabled, true);
query = success(pageData(allProjects.slice(0, 5), 100)); tree = renderChoices(); search(tree, ""); tree = renderChoices();
pageButton(tree, "次へ").props.onClick(); tree = renderChoices(); assert.deepEqual(queryArgs, ["", 1]);
// Shrink page 2 away: hide it immediately, then refetch page 1.
query = success(pageData([], 5, 1)); tree = renderChoices(); assert.equal(projectButtons(tree).length, 0); picker.flush();
tree = renderChoices(); assert.deepEqual(queryArgs, ["", 0]);
query = success(pageData(allProjects.slice(0, 5), 5)); tree = renderChoices(); assert.equal(projectButtons(tree).length, 5);
query = success(pageData([], 0)); tree = renderChoices(); assert.equal(pageButton(tree, "次へ").props.disabled, true);
walk(sheet).find(n => n.type === "button" && text(n) === "キャンセル").props.onClick(); assert.equal(closed, 1);
console.log("Quick Add picker component PASS: ACTIVE 0/1/5/6/100, maximum 5 rows, archived exclusion, duplicate names, first/last pages, always-visible search, loading/error/retry, pending selection/paging blocked, search resets page 0, last-page shrink and empty results.");

// Real source hook: fresh detail validation, errors/retry, consumed history and demo exclusion.
for (const status of ["ACTIVE", "ARCHIVED", "deleted", "error"]) {
  let location = { key: "entry", pathname: "/p/token", search: "", hash: "", state: { quickAddExpense: true, keep: 1 } };
  let fetches = 0, result = { isSuccess: status === "ACTIVE" || status === "ARCHIVED", data: { status } };
  let finish;
  const h = harness("features/projects/useQuickAddExpense.ts", {
    "react-router-dom": { useLocation: () => location, useNavigationType: () => "REPLACE", useNavigate: () => (path, options) => {
      assert.equal(path, "/p/token"); assert.equal(options.replace, true); assert.deepEqual(options.state, { keep: 1, quickAddExpenseEntry: "entry" });
      location = { ...location, key: "consumed", state: options.state };
    } },
  });
  const refetch = () => { fetches++; return new Promise(resolve => { finish = resolve; }); };
  let value = h.run("useQuickAddExpense", "token", true, refetch); assert.equal(value.loading, true); h.flush(); h.replayEffects();
  assert.equal(fetches, 1, "StrictMode effect replay must retain the single verification request");
  finish(result); await tick(); value = h.run("useQuickAddExpense", "token", true, refetch); h.flush();
  assert.equal(Boolean(value.requestId), status === "ACTIVE"); assert.equal(value.error, !result.isSuccess); assert.equal(fetches, 1);
  if (!result.isSuccess) {
    value.retry(); result = { isSuccess: true, data: { status: "ACTIVE" } }; finish(result); await tick();
    value = h.run("useQuickAddExpense", "token", true, refetch); assert.equal(value.requestId, "entry");
  }
  value.handled(); value = h.run("useQuickAddExpense", "token", true, refetch); h.flush(); assert.equal(value.requestId, undefined);
  // History POP returns to the replaced entry, whose intent was removed.
  location = { ...location, key: "consumed" }; value = h.run("useQuickAddExpense", "token", true, refetch); h.flush(); assert.equal(value.requestId, undefined);
  value = h.run("useQuickAddExpense", "other-project", true, refetch); assert.equal(value.requestId, undefined);
}
let demoFetch = 0;
const demo = harness("features/projects/useQuickAddExpense.ts", { "react-router-dom": {
  useLocation: () => ({ key: "demo", pathname: "/p/demo", search: "", hash: "", state: { quickAddExpense: true } }), useNavigate: () => () => {},
  useNavigationType: () => "PUSH",
} });
demo.run("useQuickAddExpense", "demo", false, async () => { demoFetch++; }); demo.flush(); assert.equal(demoFetch, 0);

// Real memory history + actual Hook, with API completions controlled by each case.
async function historyFixture() {
  const router = createMemoryRouter([{ path: "/p/:publicToken", element: null }], {
    initialEntries: [
      { pathname: "/p/A", key: "prior-A", state: { prior: true } },
      { pathname: "/p/A", key: "intent-A", state: { quickAddExpense: true, keep: 1 } },
    ], initialIndex: 1,
  });
  const requests = [];
  const h = harness("features/projects/useQuickAddExpense.ts", {
    "react-router-dom": {
      useLocation: () => router.state.location,
      useNavigationType: () => router.state.historyAction,
      useNavigate: () => (path, options) => router.navigate(path, options),
    },
  });
  const refetch = () => new Promise((resolve, reject) => { requests.push({ resolve, reject }); });
  const commit = () => {
    const token = router.state.location.pathname.split("/").at(-1);
    const value = h.run("useQuickAddExpense", token, true, refetch); h.flush(); return value;
  };
  commit(); await tick(); commit();
  return {
    router, h, requests, commit,
    async move(to, options) { await router.navigate(to, options); commit(); await tick(); return commit(); },
    dispose() { h.dispose(); router.dispose(); },
  };
}
function idle(value) {
  assert.equal(Boolean(value.loading), false); assert.equal(Boolean(value.error), false); assert.equal(value.requestId, undefined);
}
const activeResult = { isSuccess: true, data: { status: "ACTIVE" } };

// A/F: our replace changes the real history key, preserves state, and opens once.
{
  const f = await historyFixture();
  assert.equal(f.requests.length, 1); assert.notEqual(f.router.state.location.key, "intent-A");
  assert.equal(f.router.state.historyAction, "REPLACE");
  assert.deepEqual(f.router.state.location.state, { keep: 1, quickAddExpenseEntry: "intent-A" });
  assert.equal(f.commit().loading, true);
  f.h.replayEffects(); assert.equal(f.requests.length, 1, "StrictMode replay reuses the verification");
  f.requests[0].resolve(activeResult); await tick();
  let value = f.commit(); assert.equal(value.requestId, "intent-A");
  value.handled(); value = f.commit(); idle(value); idle(f.commit());
  // G: POP to the same-token past entry and forward to the consumed entry.
  idle(await f.move(-1)); assert.equal(f.router.state.location.key, "prior-A");
  idle(await f.move(1)); assert.equal(f.requests.length, 1); f.dispose();
}

// B: leaving for another Project invalidates even before the response arrives.
{
  const f = await historyFixture(); idle(await f.move("/p/B"));
  const writes = f.h.writes; f.requests[0].resolve(activeResult); await tick();
  assert.equal(f.h.writes, writes); idle(f.commit()); f.dispose();
}

// C/D: same-token Back clears loading; late success, error result and rejection do nothing.
for (const outcome of ["success", "error-result", "reject"]) {
  const f = await historyFixture(); const previousValue = f.commit();
  idle(await f.move(-1)); assert.equal(f.router.state.location.pathname, "/p/A"); assert.equal(f.router.state.location.key, "prior-A");
  previousValue.retry(); assert.equal(f.requests.length, 1, "a stale retry callback cannot restart a canceled request");
  const writes = f.h.writes;
  if (outcome === "reject") f.requests[0].reject(new Error("late network failure"));
  else f.requests[0].resolve(outcome === "success" ? activeResult : { isSuccess: false });
  await tick(); assert.equal(f.h.writes, writes); idle(f.commit());
  idle(await f.move(1)); assert.equal(f.requests.length, 1, "returning to consumed history cannot revive the request"); f.dispose();
}

// E: a new Quick Add on either A or B owns the UI, regardless of completion order.
for (const token of ["A", "B"]) for (const order of ["old-first", "new-first"]) {
  const f = await historyFixture();
  await f.move(`/p/${token}`, { state: { quickAddExpense: true } });
  assert.equal(f.requests.length, 2); const newestId = f.router.state.location.state.quickAddExpenseEntry;
  assert.notEqual(newestId, "intent-A");
  if (order === "old-first") {
    f.requests[0].resolve(activeResult); await tick();
    const pending = f.commit(); assert.equal(pending.loading, true); assert.equal(pending.error, false); assert.equal(pending.requestId, undefined);
  }
  f.requests[1].resolve(activeResult); await tick(); assert.equal(f.commit().requestId, newestId);
  if (order === "new-first") {
    const writes = f.h.writes; f.requests[0].reject(new Error("superseded failure")); await tick(); assert.equal(f.h.writes, writes);
  }
  const newest = f.commit(); assert.equal(newest.requestId, newestId); newest.handled(); idle(f.commit()); f.dispose();
}

// Other history changes must cancel, including a later external REPLACE copying the marker.
for (const move of [
  f => f.move("/p/A"),
  f => f.move("/p/A", { replace: true, state: { ...f.router.state.location.state } }),
  f => f.move("/p/A?tab=members#section"),
]) {
  const f = await historyFixture(); idle(await move(f));
  f.requests[0].resolve(activeResult); await tick(); idle(f.commit()); f.dispose();
}

// Existing error/open state is discarded too, even before the modal acknowledges it.
for (const result of [activeResult, { isSuccess: false }]) {
  const f = await historyFixture(); f.requests[0].resolve(result); await tick();
  const value = f.commit(); assert.ok(value.requestId || value.error);
  idle(await f.move(-1)); idle(await f.move(1)); assert.equal(f.requests.length, 1); f.dispose();
}

// H: no state setter is invoked by a response after the Hook has unmounted.
for (const outcome of ["success", "error-result", "reject"]) {
  const f = await historyFixture(); f.dispose(); const writes = f.h.writes;
  if (outcome === "reject") f.requests[0].reject(new Error("unmounted failure"));
  else f.requests[0].resolve(outcome === "success" ? activeResult : { isSuccess: false });
  await tick(); assert.equal(f.h.writes, writes); assert.equal(f.h.lateWrites, 0);
}
console.log("Quick Add history P1 PASS: real Memory Router and source Hook A–H, marked own REPLACE/StrictMode, same-token Back, different Project, stale success/error/rejection, newest-request wins in both orders, external PUSH/REPLACE/search/hash, cleared loading/error/open, consumed return and zero state writes after unmount.");

// Actual AddExpenseModal: active members, validation, double-submit, error draft, success.
let validation = {}, closeCount = 0, calls = 0, rejectSave, resolveSave;
const form = { ExpenseForm: () => null, focusFirstExpenseError() {}, validateExpenseForm: () => validation,
  toExpenseRequest: state => ({ ...state }) };
const modal = harness("features/expenses/components/AddExpenseModal.tsx", {
  "../../../api/client": { ApiError: class extends Error {} },
  "../../../hooks/useAccessibleDialog": { useAccessibleDialog() {} }, "./ExpenseForm": form,
});
const modalProps = { projectName: "Real project", currencyLabel: "JPY", members: [{ id: "a", active: true }, { id: "inactive", active: false }],
  onClose: () => closeCount++, onSubmit: () => { calls++; return new Promise((resolve, reject) => { resolveSave = resolve; rejectSave = reject; }); } };
let view = modal.run("AddExpenseModal", modalProps); modal.flush();
let field = walk(view).find(n => n.type === form.ExpenseForm); assert.deepEqual(field.props.members.map(m => m.id), ["a"]);
assert.deepEqual(field.props.form.participantIds, ["a"]);
const draft = { ...field.props.form, amount: "1200", content: "Lunch", memo: "keep" };
field.props.onChange(draft, "amount"); view = modal.run("AddExpenseModal", modalProps);
const submit = () => walk(view).find(n => n.type === "form").props.onSubmit({ preventDefault() {} });
validation = { amount: "invalid" }; await submit(); assert.equal(calls, 0);
validation = {}; const pending = submit(); await submit(); assert.equal(calls, 1);
view = modal.run("AddExpenseModal", modalProps); assert.ok(walk(view).filter(n => n.type === "button").every(n => n.props.disabled));
rejectSave(new Error("network")); await pending; view = modal.run("AddExpenseModal", modalProps);
assert.equal(closeCount, 0); assert.deepEqual(walk(view).find(n => n.type === form.ExpenseForm).props.form, draft);
assert.match(text(view), /支出を保存できませんでした/);
const saveSuccess = submit(); resolveSave(); await saveSuccess; assert.equal(closeCount, 1);
const emptyModal = harness("features/expenses/components/AddExpenseModal.tsx", {
  "../../../api/client": { ApiError: class extends Error {} }, "../../../hooks/useAccessibleDialog": { useAccessibleDialog() {} }, "./ExpenseForm": form,
});
view = emptyModal.run("AddExpenseModal", { ...modalProps, members: [] });
assert.match(text(view), /有効なメンバーが必要/); assert.equal(walk(view).find(n => n.props?.type === "submit").props.disabled, true);

// Wiring guards supplement executed behavior above; not visual/browser verification.
const read = path => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
for (const type of ["Continuous", "Event"]) {
  const source = read(`features/projects/components/${type}ProjectDetail.tsx`);
  assert.match(source, /openedRequest.current === quickAddRequestId/);
  assert.match(source, /archived \|\| !onCreateExpense/);
  assert.match(source, /onQuickAddHandled\?\.\(\)/);
  const stubImports = {};
  const parsed = ts.createSourceFile("detail.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const Stub = () => null;
  for (const statement of parsed.statements) {
    if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
    const name = statement.moduleSpecifier.text;
    if (name === "react" || name.endsWith(".module.css")) continue;
    stubImports[name] = Object.fromEntries((statement.importClause?.namedBindings?.elements ?? []).map(binding => [binding.name.text, Stub]));
  }
  if (type === "Event") stubImports["../../../api/settlementApi"].SETTLEMENT_STRATEGY_LABELS = { FEWER_TRANSFERS: "少ない送金" };
  const h = harness(`features/projects/components/${type}ProjectDetail.tsx`, stubImports);
  const data = { name: "Actual target", type: type.toUpperCase(), status: "ACTIVE", members: [{ id: "target" }],
    expenses: [], settlementTransfers: [], memberBalances: [], kpi: {} };
  let acknowledged = 0;
  const values = { detail: data, quickAddRequestId: "one", onCreateExpense: async () => {}, onQuickAddHandled: () => acknowledged++ };
  h.run(`${type}ProjectDetail`, values); h.flush();
  let result = h.run(`${type}ProjectDetail`, values); h.flush();
  const addType = stubImports["../../expenses/components/AddExpenseModal"].AddExpenseModal;
  // Identify it by its save callback, which is forwarded only to AddExpenseModal.
  const findModal = tree => walk(tree).find(n => n.type === addType && n.props?.onSubmit === values.onCreateExpense);
  assert.ok(findModal(result)); assert.equal(acknowledged, 1);
  assert.deepEqual(findModal(result).props.members, data.members);
  findModal(result).props.onClose(); result = h.run(`${type}ProjectDetail`, { ...values, onCreateExpense: values.onCreateExpense }); h.flush();
  assert.equal(findModal(result), undefined); assert.equal(acknowledged, 1);
  walk(result).find(n => n.props?.onAddExpense).props.onAddExpense();
  result = h.run(`${type}ProjectDetail`, values); h.flush();
  assert.ok(findModal(result), "Project-local Add opens the existing modal directly");
  assert.equal(acknowledged, 1, "Local Add does not consume a global selection intent");
  // A new selection can open again, while archived targets cannot.
  h.run(`${type}ProjectDetail`, { ...values, quickAddRequestId: "two" }); h.flush();
  result = h.run(`${type}ProjectDetail`, { ...values, quickAddRequestId: "two" }); assert.ok(findModal(result));
  h.run(`${type}ProjectDetail`, { ...values, archived: true, detail: { ...data, status: "ARCHIVED" }, quickAddRequestId: "blocked" }); h.flush();
  result = h.run(`${type}ProjectDetail`, { ...values, archived: true, detail: { ...data, status: "ARCHIVED" }, quickAddRequestId: "blocked" });
  assert.equal(findModal(result), undefined); assert.equal(acknowledged, 2);
}
assert.equal((read("pages/ProjectDetailPage/ProjectDetailPage.tsx").match(/key=\{publicToken\}/g) ?? []).length, 2);
assert.match(read("components/navigation/ResponsiveNavigation.tsx"), /if \(open \|\| destination === null\) return/);

// Execute the new modal's background inert lifecycle, including previously inert nodes.
class Element {
  constructor(children = [], inert = false) { this.children = children; this.inert = inert; children.forEach(child => { child.parentElement = this; }); }
}
globalThis.HTMLElement = Element;
const overlay = new Element(), content = new Element(), navBackground = new Element(), priorInert = new Element([], true);
const page = new Element([content, overlay]), shell = new Element([page, navBackground, priorInert]), body = new Element([shell]);
document.body = body;
const inertModal = harness("features/expenses/components/AddExpenseModal.tsx", {
  "../../../api/client": { ApiError: class extends Error {} }, "../../../hooks/useAccessibleDialog": { useAccessibleDialog() {} }, "./ExpenseForm": form,
});
view = inertModal.run("AddExpenseModal", modalProps); view.props.ref.current = overlay; inertModal.flush();
assert.equal(content.inert, true); assert.equal(navBackground.inert, true); assert.equal(priorInert.inert, true);
assert.equal(page.inert, false); assert.equal(shell.inert, false); inertModal.dispose();
assert.equal(content.inert, false); assert.equal(navBackground.inert, false); assert.equal(priorInert.inert, true);

// Execute the parent handoff: no navigation until the sheet is absent and effects flush.
globalThis.window = { matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }) };
const handoff = harness("components/navigation/ResponsiveNavigation.tsx", {
  "react-dom": { createPortal: n => n },
  "react-router-dom": { Link: "a", useLocation: () => ({ pathname: "/" }), useNavigate: () => navigate },
  "./QuickAddProjectChoices": picker.module,
  "../../hooks/useAccessibleDialog": { useAccessibleDialog() {} },
});
tree = handoff.run("ResponsiveNavigation", { theme: "light", active: "home" }); handoff.flush();
walk(tree).find(n => n.props?.["aria-label"] === "追加メニュー").props.onClick();
tree = handoff.run("ResponsiveNavigation", { theme: "light", active: "home" }); handoff.flush();
walk(tree).find(n => n.type?.name === "QuickAddSheet").props.onSelectProject("token/encoded");
assert.equal(navigateCalls.length, 0);
tree = handoff.run("ResponsiveNavigation", { theme: "light", active: "home" });
assert.ok(!walk(tree).some(n => n.type?.name === "QuickAddSheet")); handoff.flush();
assert.deepEqual(navigateCalls, [["/p/token%2Fencoded", { state: { quickAddExpense: true } }]]);

// Restore the pre-inert snapshot even if the browser blurred the trigger.
const keys = new Map(), focusTrigger = { isConnected: true, focus() { document.activeElement = this; } };
const firstFocus = { focus() { document.activeElement = this; } }, lastFocus = { focus() { document.activeElement = this; } };
const dialogFocus = { focus() { document.activeElement = this; }, querySelectorAll: () => [firstFocus, lastFocus] };
globalThis.document = { activeElement: {}, body: { style: { overflow: "auto" } },
  addEventListener: (name, fn) => keys.set(name, fn), removeEventListener: name => keys.delete(name) };
const focus = harness("hooks/useAccessibleDialog.ts"); let escaped = 0;
focus.run("useAccessibleDialog", { current: dialogFocus }, () => escaped++, undefined, { current: focusTrigger }); focus.flush();
assert.equal(document.activeElement, dialogFocus); assert.equal(document.body.style.overflow, "hidden");
document.activeElement = lastFocus; keys.get("keydown")({ key: "Tab", preventDefault() {} }); assert.equal(document.activeElement, firstFocus);
keys.get("keydown")({ key: "Tab", shiftKey: true, preventDefault() {} }); assert.equal(document.activeElement, lastFocus);
keys.get("keydown")({ key: "Escape", stopPropagation() {} }); assert.equal(escaped, 1);
focus.dispose(); assert.equal(document.activeElement, focusTrigger); assert.equal(document.body.style.overflow, "auto"); assert.equal(keys.size, 0);
console.log("Mobile Quick Add PASS: picker loading/empty/error/retry/types/archive/duplicate names/cancel; fresh detail active/archive/deletion/error/retry; consumed intent/Back/project isolation/demo; modal active members/validation/double submit/error draft/success/no members. Component/hook model and wiring guards only; browser unverified.");
