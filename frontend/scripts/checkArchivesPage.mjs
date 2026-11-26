import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";

function load(relative, imports = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, name => {
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    assert.ok(name in imports, "Unexpected import: " + name);
    return imports[name];
  });
  return module.exports;
}
const walk = node => [node, ...React.Children.toArray([node?.props?.children, node?.props?.action]).flatMap(walk)];
const Link = ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children);
const { ApiError } = load("../src/api/client.ts");
const money = load("../src/utils/formatMoney.ts");
const { ProjectTypeBadge } = load("../src/features/projects/components/ProjectTypeBadge.tsx");
const { ProjectCard } = load("../src/features/projects/components/ProjectCard.tsx", {
  "react-router-dom": { Link }, "../../../utils/formatMoney": money, "./ProjectTypeBadge": { ProjectTypeBadge },
  "../../../assets/projects/default-continuous.webp": { __esModule: true, default: "continuous.webp" },
  "../../../assets/projects/default-event.webp": { __esModule: true, default: "event.webp" },
});
const { EmptyState } = load("../src/components/common/EmptyState.tsx");
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
let deleteRequest = async () => {}, deleteCalls = [];
const queries = load("../src/features/projects/projectQueries.ts", {
  "@tanstack/react-query": { useMutation: options => options, useQueryClient: () => client },
  "../../api/expenseApi": {}, "../../api/projectApi": { deleteProject: token => { deleteCalls.push(token); return deleteRequest(); } },
  "../../api/client": { ApiError }, "../settlements/settlementQueries": {}, "../analytics/analyticsQueries": { invalidateProjectAnalytics: async () => {} },
});
async function mutateAsync(project) {
  const mutation = queries.useDeleteProjectMutation();
  try {
    await mutation.mutationFn(project);
  } catch (error) {
    await mutation.onError(error, project);
    throw error;
  }
  await mutation.onSuccess(undefined, project);
}
let states = [], effects = [], stateIndex = 0, effectIndex = 0, pending = [];
const hooks = {
  ...React,
  useId: () => ":archives-test:",
  useRef(initial) {
    const i = stateIndex++;
    if (!(i in states)) states[i] = { current: initial };
    return states[i];
  },
  useState(initial) {
    const i = stateIndex++;
    const slots = states;
    if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
    return [slots[i], next => { slots[i] = typeof next === "function" ? next(slots[i]) : next; }];
  },
  useEffect(callback, deps) {
    const i = effectIndex++;
    if (!effects[i] || deps.some((value, j) => !Object.is(value, effects[i][j]))) pending.push(callback);
    effects[i] = deps;
  },
};
// Keep the real dialog's pending/error/confirmation behavior, with the existing
// focus hook stubbed: native focus is covered only by the separate model checks.
let fallbackId;
const { ProjectDeleteDialog } = load("../src/features/projects/components/ProjectDeleteDialog.tsx", {
  react: hooks, "../../../hooks/useAccessibleDialog": { useAccessibleDialog(_ref, _close, id) { fallbackId = id; } },
});
let status = "ready", requested = [], retries = 0;
const { ArchivesPage } = load("../src/pages/ArchivesPage/ArchivesPage.tsx", {
  react: hooks, "../../api/client": { ApiError }, "../../components/common/EmptyState": { EmptyState },
  "../../features/projects/components/ProjectCard": { ProjectCard },
  "../../features/projects/components/ProjectDeleteDialog": { ProjectDeleteDialog },
  "../../features/projects/projectQueries": {
    useDeleteProjectMutation: () => ({ mutateAsync }),
    useProjectPageQuery(...args) {
      requested.push(args);
      const data = client.getQueryData(queries.projectKeys.page(...args));
      return { data, isPending: status === "loading" || !data, isError: status === "error", refetch() { retries++; } };
    },
  },
});
function render() {
  stateIndex = 0; effectIndex = 0; pending = [];
  const tree = ArchivesPage(); pending.forEach(effect => effect()); return tree;
}
function project(index, type = "EVENT") {
  return { id: "archived-" + index, publicToken: "archived-" + index, name: "Archived " + index,
    type, status: "ARCHIVED", members: [], summary: { totalExpenseYen: 1234n, expenseCount: 1, lastUpdatedLabel: "11月3日" } };
}
function seed(total) {
  client.clear(); states = []; effects = []; status = "ready"; requested = []; retries = 0; deleteCalls = []; deleteRequest = async () => {};
  for (let page = 0; page <= Math.max(1, Math.ceil(total / 5)); page++) {
    client.setQueryData(queries.projectKeys.page("ARCHIVED", "", page, 5), {
      items: Array.from({ length: Math.max(0, Math.min(5, total - page * 5)) }, (_, i) => project(page * 5 + i)),
      page, size: 5, totalElements: total, totalPages: Math.ceil(total / 5),
    });
  }
}
const cards = tree => walk(tree).filter(n => n.type === ProjectCard);
const button = (tree, label) => walk(tree).find(n => n.type === "button" && n.props.children === label);
const dialog = tree => walk(tree).find(n => n.type === ProjectDeleteDialog);
for (const total of [0, 1, 5, 6, 12]) {
  seed(total);
  const tree = render(), html = renderToStaticMarkup(tree);
  assert.deepEqual(requested.at(-1), ["ARCHIVED", "", 0, 5]);
  assert.equal(cards(tree).length, Math.min(total, 5));
  assert.ok(html.includes("全" + total + "件"));
  if (!total) assert.match(html, /アーカイブ済みプロジェクトはありません/);
  if (total > 5) {
    assert.equal(button(tree, "前へ").props.disabled, true);
    button(tree, "次へ").props.onClick();
    const second = render();
    assert.deepEqual(requested.at(-1), ["ARCHIVED", "", 1, 5]);
    assert.equal(cards(second).length, Math.min(5, total - 5));
    assert.equal(button(second, "次へ").props.disabled, total <= 10);
    button(second, "前へ").props.onClick(); render(); assert.equal(requested.at(-1)[2], 0);
  } else assert.equal(button(tree, "次へ"), undefined);
  if (total) {
    assert.match(html, /href="\/p\/archived-0"/);
    assert.match(html, /アーカイブ済み・閲覧のみ/);
  }
}
seed(12);
button(render(), "次へ").props.onClick(); button(render(), "次へ").props.onClick();
assert.equal(cards(render()).length, 2); assert.equal(requested.at(-1)[2], 2);
// No Event-only filtering or new Continuous archive mutation is introduced.
seed(1);
const key = queries.projectKeys.page("ARCHIVED", "", 0, 5);
client.setQueryData(key, current => ({ ...current, items: [project(0, "CONTINUOUS")] }));
assert.match(renderToStaticMarkup(render()), /継続/);
status = "loading"; assert.match(renderToStaticMarkup(render()), /読み込んでいます/); assert.equal(cards(render()).length, 0);
status = "error"; const errorTree = render();
assert.match(renderToStaticMarkup(errorTree), /読み込めませんでした/); assert.equal(cards(errorTree).length, 0);
button(errorTree, "再試行").props.onClick(); assert.equal(retries, 1);
status = "ready"; assert.equal(cards(render()).length, 1);

// Real shared mutation callbacks + QueryClient reconcile every archived page,
// Home's preview and matching search caches on both success and 404.
for (const missing of [false, true]) {
  seed(6);
  const searchKey = queries.projectKeys.page(undefined, "Archived", 0, 10);
  client.setQueryData(searchKey, { items: [project(5)], size: 10, totalElements: 6, totalPages: 1 });
  button(render(), "次へ").props.onClick();
  cards(render())[0].props.onDelete(project(5));
  const sheet = dialog(render()); assert.equal(sheet.props.focusFallbackId, "archives-title");
  if (missing) deleteRequest = async () => { throw new ApiError(404, "PROJECT_NOT_FOUND", "missing"); };
  await sheet.props.onConfirm(); sheet.props.onClose();
  render(); const corrected = render();
  assert.equal(requested.at(-1)[2], 0); assert.equal(cards(corrected).length, 5); assert.equal(dialog(corrected), undefined);
  assert.equal(client.getQueryData(key).totalElements, 5);
  assert.equal(client.getQueryData(queries.projectKeys.page("ARCHIVED", "", 1, 5)).totalPages, 1);
  assert.deepEqual(client.getQueryData(searchKey).items, []);
  assert.equal(client.getQueryState(key).isInvalidated, true);
  assert.deepEqual(deleteCalls, ["archived-5"]);
  if (missing) assert.match(renderToStaticMarkup(corrected), /すでに削除されています/);
}
// External shrink/out-of-range metadata also returns to the last available page.
seed(12); button(render(), "次へ").props.onClick(); button(render(), "次へ").props.onClick(); render();
client.setQueryData(queries.projectKeys.page("ARCHIVED", "", 2, 5), { items: [], page: 2, size: 5, totalElements: 1, totalPages: 1 });
render(); render(); assert.equal(requested.at(-1)[2], 0);
seed(1); cards(render())[0].props.onDelete(project(0));
const last = dialog(render()); await last.props.onConfirm(); last.props.onClose();
assert.match(renderToStaticMarkup(render()), /アーカイブ済みプロジェクトはありません/);

// Exercise the actual shared dialog with the Archives callback: pending blocks
// cancellation, failures keep the dialog and show the existing retryable error.
seed(1); cards(render())[0].props.onDelete(project(0));
const archiveDialogProps = dialog(render()).props;
let dialogStates = [], dialogEffects = [];
function renderDialog() {
  const saved = [states, effects]; states = dialogStates; effects = dialogEffects;
  stateIndex = 0; effectIndex = 0;
  const tree = ProjectDeleteDialog(archiveDialogProps);
  [dialogStates, dialogEffects] = [states, effects]; [states, effects] = saved;
  return tree;
}
let rejectDelete;
deleteRequest = () => new Promise((_resolve, reject) => { rejectDelete = reject; });
globalThis.window = { requestAnimationFrame: callback => callback() };
walk(renderDialog()).find(n => n.props?.className === "danger").props.onClick();
const waiting = renderDialog(); assert.match(renderToStaticMarkup(waiting), /削除中…/);
assert.ok(walk(waiting).filter(n => n.type === "button").every(n => n.props.disabled));
button(waiting, "キャンセル").props.onClick(); assert.ok(dialog(render()));
waiting.props.onMouseDown({ target: 1, currentTarget: 1 }); assert.ok(dialog(render()));
rejectDelete(new ApiError(500, "SERVER_ERROR", "failed"));
for (let i = 0; i < 12; i++) await Promise.resolve();
const failed = renderDialog();
assert.match(renderToStaticMarkup(failed), /削除できませんでした/);
assert.equal(walk(failed).find(n => n.props?.className === "danger").props.disabled, false);
assert.equal(client.getQueryData(key).totalElements, 1);
assert.equal(fallbackId, "archives-title");
deleteRequest = async () => {};
walk(failed).find(n => n.props?.className === "danger").props.onClick();
for (let i = 0; i < 20; i++) await Promise.resolve();
assert.equal(dialog(render()), undefined);
assert.equal(client.getQueryData(key).totalElements, 0);
client.clear();
console.log("Archives: 0/1/5/6/12 records, multi-page navigation, exact query contract, archived detail links/types, loading/error/retry, real deletion cache reconciliation/404/last-page correction, shared dialog pending/error/retry/focus target PASS. Native input/layout unverified.");
