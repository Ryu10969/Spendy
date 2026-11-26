import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";

function load(relative, imports = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const code = ts.transpileModule(source.replaceAll("import.meta.env.DEV", "false"), {
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

const { revealHomeTheme } = load("../src/pages/HomePage/homeThemeTransition.ts");
for (const mode of ["supported", "reduced", "unsupported", "no-animation", "no-clip-path", "no-css", "no-match-media", "start-error", "snapshot-error", "animation-error", "update-error"]) {
  let updates = 0;
  let starts = 0;
  let animation;
  let skipped = false;
  const attributes = new Map();
  globalThis.window = { innerWidth: 1536, innerHeight: 1024, location:{hash:""}, matchMedia: () => ({ matches: mode === "reduced" }) };
  globalThis.CSS = { supports: () => mode !== "no-clip-path" };
  if (mode === "no-css") delete globalThis.CSS;
  if (mode === "no-match-media") delete globalThis.window.matchMedia;
  globalThis.getComputedStyle = () => ({ getPropertyValue: (key) => key.endsWith("duration") ? "560ms" : "ease-in-out" });
  globalThis.document = {
    documentElement: {
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
      animate: mode === "no-animation" ? undefined : (frames, options) => {
        if (mode === "animation-error") throw new Error("pseudo-element animation unsupported");
        animation = { frames, options };
      },
    },
    startViewTransition: mode === "unsupported" ? undefined : (update) => {
      starts++;
      if (mode === "start-error") throw new Error("unavailable");
      if (mode !== "update-error") update();
      return {
        ready: mode === "snapshot-error" || mode === "update-error" ? Promise.reject(new Error("skipped")) : Promise.resolve(),
        updateCallbackDone: mode === "update-error" ? Promise.reject(new Error("update failed")) : Promise.resolve(),
        finished: mode === "snapshot-error" ? Promise.reject(new Error("skipped")) : Promise.resolve(),
        skipTransition: () => { skipped = true; },
      };
    },
  };
  await revealHomeTheme(() => updates++, {});
  assert.equal(updates, 1, `${mode}: switch exactly once`);
  assert.equal(attributes.size, 0, `${mode}: remove document animation scope`);
  assert.equal(starts, ["reduced", "unsupported", "no-animation", "no-clip-path", "no-css", "no-match-media"].includes(mode) ? 0 : 1);
  if (mode === "supported") {
    assert.deepEqual(animation.frames.clipPath, ["circle(0px at 0px 0px)", `circle(${Math.hypot(1536, 1024)}px at 0px 0px)`]);
    assert.equal(animation.options.pseudoElement, "::view-transition-new(root)");
    assert.equal(animation.options.duration, 560);
    assert.equal(animation.options.easing, "ease-in-out");
  }
  if (["snapshot-error", "animation-error", "update-error"].includes(mode)) assert.ok(skipped);
}

const Link = ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children);
const Outlet = () => null;
const { ThemeToggle } = load("../src/components/navigation/ThemeToggle.tsx");
let sidebarTheme = "light";
const sharedTheme = { useTheme: () => ({ theme: sidebarTheme, toggleTheme() {} }) };
const { AppSidebar: HomeSidebar } = load("../src/components/navigation/AppSidebar.tsx", { "react-router-dom": { Link }, "./ThemeToggle": { ThemeToggle } });
const { AppHeader } = load("../src/components/navigation/AppHeader.tsx", {
  "react-router-dom": { Link }, "../../app/ThemeProvider": sharedTheme,
  "../../assets/brand/spendy-logo.png": { __esModule: true, default: "spendy-logo.png" },
  "./ThemeToggle": { ThemeToggle },
});
const { AppShell: HomeShell } = load("../src/components/layout/AppShell.tsx", {
  "react-router-dom": { Outlet, useLocation:()=>({pathname:"/"}) },
  "../../app/ThemeProvider": sharedTheme,
  "../navigation/AppSidebar": { AppSidebar: HomeSidebar },
  "../navigation/AppHeader": { AppHeader },
  "../navigation/AppContextNavigation": { AppContextNavigation:()=>null },
  "../navigation/ResponsiveNavigation": { ResponsiveNavigation:()=>null },
});
const shellMarkup = renderToStaticMarkup(React.createElement(HomeShell));
assert.match(shellMarkup, /data-home-theme="light"/);
assert.match(shellMarkup, /src="spendy-logo.png"/);
assert.match(shellMarkup, /alt="Spendy"/);
assert.match(shellMarkup, /<a href="\/"[^>]* aria-label="Spendy ホーム">/);
assert.match(shellMarkup, /href="\/projects\/new"/);
assert.doesNotMatch(shellMarkup, /existingHeader/);
assert.match(shellMarkup, /href="#main-content"/);
assert.equal((shellMarkup.match(/<header/g)??[]).length,1,"one common official-logo header");
for (const file of ["HomePage.tsx", "HomePage.module.css"]) {
  const source = readFileSync(new URL(`../src/pages/HomePage/${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(source, /createProjectLink|existingHeader/);
  if (file === "HomePage.tsx") assert.doesNotMatch(source, /新規プロジェクト|react-router-dom/);
  if (file === "HomePage.module.css") assert.match(source, /\.primaryAction\s*\{/);
}

const shellWithoutHooks = HomeShell;
const shellTree = shellWithoutHooks();
const navigation = find(shellTree, (node) => node.type === "nav");
const items = React.Children.toArray(navigation.props.children);
assert.equal(items.length, 6);
const labels = items.map((item) => React.Children.toArray(item.props.children).filter((child) => typeof child === "string").join(""));
assert.deepEqual(labels, ["ホーム", "支出分析", "プロジェクト作成", "レシート読み取り", "共有リンクの作成", "アカウント"]);
assert.equal(items[0].props.to, "/");
assert.equal(items[0].props["aria-current"], "page");
assert.equal(items[1].props.to, "/analytics");
assert.equal(items[2].props.to, "/projects/new");
assert.equal(items[5].props.className, items[3].props.className);
for (const item of items.slice(3)) {
  assert.equal(item.type, "button");
  assert.equal(item.props.disabled, true);
  assert.equal(item.props.onClick, undefined);
  assert.match(renderToStaticMarkup(item), /準備中/);
}
assert.equal(find(shellTree, (node) => node.type === "details"), undefined);
assert.doesNotMatch(renderToStaticMarkup(navigation), /検索|未接続|アーカイブ|区切り/);
const themeControl = find(shellTree, (node) => node.props.className === "themeControl");
const sidebarTop = find(shellTree, (node) => node.props.className === "sidebarTop");
assert.deepEqual(React.Children.toArray(sidebarTop.props.children).map((node) => node.type === ThemeToggle ? "themeControl" : node.props.className), ["themeControl", "navigation"]);
const shareMarkup = renderToStaticMarkup(items[4]);
assert.equal((shareMarkup.match(/<circle /g) ?? []).length, 3);
assert.match(shareMarkup, /stroke-width="1.8"/);
assert.match(shareMarkup, /stroke="currentColor"/);
assert.equal(themeControl.props["aria-label"], "ダークモードに切り替える");
assert.equal(themeControl.props["aria-pressed"], undefined);
assert.doesNotMatch(renderToStaticMarkup(themeControl), /Light|Dark/);
assert.match(renderToStaticMarkup(themeControl), /M21 12\.8A9/);
assert.doesNotMatch(renderToStaticMarkup(themeControl), /<circle|themeTrack/);
sidebarTheme = "dark";
const darkThemeControl = find(shellWithoutHooks(), (node) => node.props.className === "themeControl");
assert.equal(darkThemeControl.props["aria-pressed"], undefined);
assert.equal(darkThemeControl.props["aria-label"], "ライトモードに切り替える");
assert.doesNotMatch(renderToStaticMarkup(darkThemeControl), /Light|Dark/);
assert.match(renderToStaticMarkup(darkThemeControl), /<circle cx="12" cy="12" r="4"/);
assert.doesNotMatch(renderToStaticMarkup(darkThemeControl), /themeTrack/);

const AppShell = () => null;
const { router } = load("../src/app/router.tsx", {
  "react-router-dom": { createBrowserRouter: (routes) => routes },
  "../components/layout/AppShell": { AppShell },
  ...Object.fromEntries([
    ["AnalyticsPage/AnalyticsPage", "AnalyticsPage"], ["ExpenseCreatePage/GlobalExpenseCreatePage", "GlobalExpenseCreatePage"],
    ["ExpenseCreatePage/ProjectExpenseCreatePage", "ProjectExpenseCreatePage"], ["HomePage/HomePage", "HomePage"],
    ["ProjectCreatePage/ProjectCreatePage", "ProjectCreatePage"], ["ProjectDetailPage/ProjectDetailPage", "ProjectDetailPage"],
    ["ProjectEditPage/ProjectEditPage", "ProjectEditPage"],
    ["ArchivesPage/ArchivesPage", "ArchivesPage"],
  ].map(([path, name]) => [`../pages/${path}`, { [name]: () => null }])),
});
assert.equal(router.length,1);
assert.equal(router[0].element.type,AppShell);
assert.deepEqual(router[0].children.map(route=>route.path),["/","/archives","/analytics","/projects/new","/p/:publicToken","/p/:publicToken/expenses/new","/expenses/new","/p/:publicToken/edit"]);

// Exercise existing search and paging through the real HomePage without a browser.
let state = [], stateIndex = 0, effectIndex = 0, effects = [], pendingEffects = [], calls = [];
let smartphone = false;
let searchFocusRequests = 0;
const SearchInput = () => null;
const Card = () => null;
const DeleteDialog = () => null;
const data = { items: [
  { id: "event-first", type: "EVENT", status: "ACTIVE" },
  { id: "continuous-first", type: "CONTINUOUS", status: "ACTIVE" },
  { id: "continuous-second", type: "CONTINUOUS", status: "ACTIVE" },
  { id: "event-second", type: "EVENT", status: "ACTIVE" },
  { id: "archive", type: "EVENT", status: "ARCHIVED" },
], totalElements: 12, totalPages: 3 };
const query = { data, isPending: false, isError: false };
let archivedState = {};
let deleted;
const { HomeMonthlyOverview } = load("../src/pages/HomePage/monthlyOverview/HomeMonthlyOverview.tsx", {
  react: React,
});
const { HomePage } = load("../src/pages/HomePage/HomePage.tsx", {
  react: {
    useState: (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
    },
    useEffect: (callback, dependencies) => {
      const index = effectIndex++;
      if (!effects[index] || dependencies.some((value, i) => !Object.is(value, effects[index][i]))) pendingEffects.push(callback);
      effects[index] = dependencies;
    },
    useSyncExternalStore: () => smartphone,
  },
  "../../components/common/EmptyState": { EmptyState: () => null },
  "../../components/common/SearchInput": { SearchInput },
  "../../components/navigation/ResponsiveNavigation": { focusHomeProjectSearch(){searchFocusRequests++;} },
  "../../features/projects/components/ProjectCard": { ProjectCard: Card },
  "../../features/projects/components/ProjectDeleteDialog": { ProjectDeleteDialog: DeleteDialog },
  "../../features/projects/projectQueries": {
    useDeleteProjectMutation: () => ({ mutateAsync: async (project) => { deleted = project; } }),
    useProjectPageQuery: (...args) => {
      calls.push(args);
      return args[0] === undefined ? query : { ...query, ...(args[0] === "ARCHIVED" ? archivedState : {}), data: { ...query.data,
        items: query.data.items.filter((project) => project.status === args[0]) } };
    },
  },
  "../../api/client": { ApiError: class extends Error {} },
  "./monthlyOverview/HomeMonthlyOverview": { HomeMonthlyOverview },
});
function render() {
  stateIndex = 0; effectIndex = 0; calls = []; pendingEffects = [];
  const tree = HomePage();
  pendingEffects.forEach((effect) => effect());
  return tree;
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (tree.type === HomeSidebar) return find(HomeSidebar(tree.props), predicate);
  if (tree.type === ThemeToggle) return find(ThemeToggle(tree.props), predicate);
  if (predicate(tree)) return tree;
  return React.Children.toArray(tree.props?.children).map((child) => find(child, predicate)).find(Boolean);
}
render();
assert.deepEqual(calls[0], ["ACTIVE", "", 0, 10, true]);
assert.deepEqual(calls[1], ["ARCHIVED", "", 0, 5, true]);
let tree = render();
function all(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...React.Children.toArray(tree.props?.children).flatMap((child) => all(child, predicate))];
}
assert.deepEqual(all(tree, (node) => node.type === Card).map((node) => node.props.project.id),
  ["continuous-first", "continuous-second", "event-first", "event-second", "archive"]);
assert.deepEqual(all(tree, (node) => node.props.className === "sectionCount").map((node) => node.props.children), [[2, "件"], [2, "件"]]);
const archiveToggle = find(tree, (node) => node.props["aria-controls"] === "archived-projects-panel");
archiveToggle.props.onClick();
tree = render();
assert.equal(find(tree, (node) => node.props.id === "archived-projects-panel").props.hidden, true);
find(tree, (node) => node.type === SearchInput).props.onChange("  trip  ");
tree = render();
assert.deepEqual(calls[2], [undefined, "trip", 0, 10, true]);
find(tree, (node) => node.type === "button" && node.props.children === "次へ").props.onClick();
render();
assert.deepEqual(calls[2], [undefined, "trip", 1, 10, true]);
find(tree, (node) => node.type === SearchInput).props.onChange("changed");
render();
assert.deepEqual(calls[2], [undefined, "changed", 0, 10, true]);
find(tree, (node) => node.type === SearchInput).props.onChange("");
tree = render();
assert.deepEqual(calls[2], [undefined, "", 0, 10, false]);
find(tree, (node) => node.type === Card).props.onDelete(data.items[1]);
tree = render();
const dialog = find(tree, (node) => node.type === DeleteDialog);
await dialog.props.onConfirm();
assert.equal(deleted, data.items[1]);
dialog.props.onClose();
assert.equal(find(render(), (node) => node.type === DeleteDialog), undefined);
tree = render();
find(tree, (node) => node.type === "button" && node.props.children === "次へ").props.onClick();
render();
assert.equal(calls[0][2], 1);
query.data = { ...data, totalPages: 1 };
render();
render();
assert.equal(calls[0][2], 0, "active page reconciles when deletion shrinks the catalog");
query.data = data;
find(render(), (node) => node.type === SearchInput).props.onChange("trip");
tree = render();
find(tree, (node) => node.type === "button" && node.props.children === "次へ").props.onClick();
render();
query.data = { ...data, totalPages: 1 };
render();
render();
assert.equal(calls[2][2], 0, "search page reconciles when deletion shrinks results");
query.data = data;
query.isError = true;
assert.ok(find(render(), (node) => node.type === SearchInput));
query.isError = false;
query.data = { ...data, items: [], totalPages: 0, totalElements: 0 };
find(render(), (node) => node.type === SearchInput).props.onChange("missing");
assert.ok(find(render(), (node) => node.type === SearchInput));
query.data = data;
smartphone = true;
tree = render();
assert.equal(find(tree, (node) => node.type === Link && node.props.to === "/projects/new"), undefined, "Home has no obsolete hidden project CTA; sidebar/Quick Add own creation");
find(tree, (node) => node.type === SearchInput).props.onChange("mobile");
render();
assert.deepEqual(calls[2], [undefined, "mobile", 0, 5, true]);
assert.equal(all(render(), node => node.type === Card && node.props.project.status === "ARCHIVED").length, 1, "mobile search retains matching archived cards");
assert.equal(find(render(), node => node.props.id === "archived-projects-title"), undefined, "mobile search has no separate archive preview heading");
find(render(), node => node.type === SearchInput).props.onChange("");
archivedState = { isPending: true, isError: true };
tree = render();
assert.deepEqual(calls[1], ["ARCHIVED", "", 0, 5, false], "smartphone does not fetch the archive preview");
assert.equal(all(tree, node => node.type === Card && node.props.project.status === "ARCHIVED").length, 0, "cached archived rows cannot leak into normal smartphone Home");
assert.equal(find(tree, node => node.props.id === "archived-projects-title"), undefined);
assert.equal(all(tree, node => /読み込/.test(node.props.title ?? "")).length, 0, "disabled archive pending/error does not block active cards");
assert.equal(all(tree, node => node.type === Card).length, 4);
query.data = { ...data, items: [data.items.at(-1)], totalElements: 0, totalPages: 0 };
assert.ok(find(render(), node => node.props.title === "利用中のプロジェクトはありません"), "only archived cached records still mean empty smartphone Home");
query.data = data;
archivedState = {};
smartphone = false;
tree = render();
assert.deepEqual(calls[1], ["ARCHIVED", "", 0, 5, true], "tablet/desktop still fetch archived preview after resizing");
assert.ok(find(tree, node => node.props.id === "archived-projects-title"));
smartphone = true;
tree = render();
const monthly = find(tree, (node) => node.props["aria-labelledby"] === "monthly-overview-title");
assert.equal(React.Children.toArray(monthly.props.children)[0].props.smartphone, true, "Home passes its existing viewport subscription into monthly presentation");
const monthlyMarkup = renderToStaticMarkup(monthly);
assert.match(monthlyMarkup, /準備中/);
assert.doesNotMatch(monthlyMarkup, /[¥￥%]|前月|件/);

// Analytics returns to the existing Home input; remount focuses once, not per fetch.
state=[];effects=[];globalThis.window.location.hash="#home-search-panel";
render();assert.equal(searchFocusRequests,1);render();assert.equal(searchFocusRequests,1);
globalThis.window.location.hash="";

const money = load("../src/utils/formatMoney.ts");
const { ProjectTypeBadge } = load("../src/features/projects/components/ProjectTypeBadge.tsx");
const { ProjectCard } = load("../src/features/projects/components/ProjectCard.tsx", {
  "react-router-dom": { Link }, "../../../utils/formatMoney": money, "./ProjectTypeBadge": { ProjectTypeBadge },
  "../../../assets/projects/default-continuous.webp": { __esModule: true, default: "continuous.webp" },
  "../../../assets/projects/default-event.webp": { __esModule: true, default: "event.webp" },
});
const project = { id: "test", publicToken: "test-token", name: "Test Project", type: "EVENT", status: "ACTIVE", members: [{ id: "member" }],
  summary: { totalExpenseYen: 1234n, expenseCount: 2, balanceYen: 0n, pendingSettlementCount: 0, lastUpdatedLabel: "10月22日" } };
for (const [type, status, image] of [["CONTINUOUS", "ACTIVE", "continuous.webp"], ["EVENT", "ACTIVE", "event.webp"], ["EVENT", "ARCHIVED", "event.webp"]]) {
  for (const balanceYen of [0n, 10500n, -10500n]) {
    const markup = renderToStaticMarkup(ProjectCard({ project: { ...project, type, status, summary: { ...project.summary, balanceYen } }, onDelete() {} }));
    assert.ok(markup.includes(`src="${image}"`));
    assert.match(markup, /href="\/p\/test-token"/);
    assert.match(markup, /全期間の支出/);
    assert.match(markup, /¥1,234/);
    assert.doesNotMatch(markup, /未精算残高|利用中|進行中/);
    assert.match(markup, type === "CONTINUOUS" ? /継続/ : /イベント/);
    assert.match(markup, /未精算 0件/);
    if (status === "ARCHIVED") assert.match(markup, /アーカイブ済み・閲覧のみ/);
    else assert.doesNotMatch(markup, /アーカイブ済み/);
  }
}
assert.doesNotMatch(renderToStaticMarkup(ProjectCard({
  project: { ...project, summary: { ...project.summary, balanceYen: undefined, pendingSettlementCount: undefined } }, onDelete() {},
})), /未精算/);
const cardTree = ProjectCard({ project, onDelete: (target) => { deleted = target; } });
const cardDetails = find(cardTree, (node) => node.type === "details");
let summaryFocused = false;
const menu = { open: true, querySelector: () => ({ focus: () => { summaryFocused = true; } }) };
cardDetails.props.onKeyDown({ key: "Escape", currentTarget: menu });
assert.equal(menu.open, false);
assert.ok(summaryFocused);
menu.open = true;
find(cardTree, (node) => node.type === "button").props.onClick({ currentTarget: { closest: () => menu } });
assert.equal(menu.open, false);
assert.equal(deleted, project);

// Real QueryClient verifies retained deletion cache reconciliation and refetch invalidation.
const client = new QueryClient();
let invalidated = false;
const invalidate = client.invalidateQueries.bind(client);
client.invalidateQueries = (filters) => { invalidated = true; return invalidate(filters); };
const { useDeleteProjectMutation, projectKeys } = load("../src/features/projects/projectQueries.ts", {
  "@tanstack/react-query": { useMutation: (options) => options, useQueryClient: () => client },
  "../../api/expenseApi": {}, "../../api/projectApi": {}, "../../api/client": { ApiError: class extends Error {} },
  "../settlements/settlementQueries": {}, "../analytics/analyticsQueries": { invalidateProjectAnalytics: async () => {} },
});
const pageKey = projectKeys.page(undefined, "Test", 0, 10);
client.setQueryData(pageKey, { items: [project], totalElements: 1, totalPages: 1, size: 10 });
await useDeleteProjectMutation().onSuccess(undefined, project);
assert.equal(client.getQueryData(pageKey).totalElements, 0);
assert.equal(client.getQueryData(pageKey).totalPages, 0);
assert.deepEqual(client.getQueryData(pageKey).items, []);
assert.ok(invalidated);
client.clear();
console.log("Home: six-item Desktop sidebar/Analytics/direct creation/preparation states, theme fallbacks, route isolation, search/reset/paging/empty/error, grouping/order/counts, archive disclosure, card assets/deletion and cache reconciliation passed.");
