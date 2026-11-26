import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import postcss from "postcss";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

function load(path, imports) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, name => {
    assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name];
  });
  return module.exports;
}
const urls = [];
const api = load("api/projectApi.ts", { "./client": { apiRequest: async url => { urls.push(url); return {}; } } });
await api.getProjectPage(0, 5, "ACTIVE", "");
await api.getProjectPage(19, 5, "ACTIVE", "同じ名前 & /?");
for (const [i, url] of urls.entries()) {
  const parsed = new URL(url, "https://example.test");
  assert.equal(parsed.pathname, "/api/projects/page");
  assert.equal(parsed.searchParams.get("status"), "ACTIVE"); assert.equal(parsed.searchParams.get("size"), "5");
  assert.equal(parsed.searchParams.get("page"), i ? "19" : "0");
  assert.equal(parsed.searchParams.get("query") ?? "", i ? "同じ名前 & /?" : "");
}

const requests = [];
const { useQuickAddProjectPageQuery } = load("features/projects/quickAddProjectQueries.ts", {
  "@tanstack/react-query": { useQuery: options => options },
  "../../api/projectApi": { getProjectPage: (...args) => new Promise(resolve => { requests.push({ args, resolve }); }) },
});
const options = (search, page) => useQuickAddProjectPageQuery(search, page);
const first = options("", 0);
assert.deepEqual(first.queryKey, ["projects", "list", "quick-add", "", 0, 5]);
assert.equal(first.gcTime, 0); assert.equal(first.placeholderData, undefined); assert.equal(first.staleTime, 0);
const client = new QueryClient();
const observer = new QueryObserver(client, first);
const observed = [];
const unsubscribe = observer.subscribe(result => observed.push(result.data?.items.map(item => item.publicToken)));
const flush = async () => { await new Promise(resolve => setTimeout(resolve, 5)); };
const response = (name, page = 0, totalElements = 100) => ({
  items: Array.from({ length: 5 }, (_, i) => ({ publicToken: `${name}-${i}`, name, status: "ACTIVE", type: i % 2 ? "EVENT" : "CONTINUOUS" })),
  page, size: 5, totalElements, totalPages: Math.ceil(totalElements / 5),
});
assert.deepEqual(requests[0].args, [0, 5, "ACTIVE", ""]);
requests[0].resolve(response("initial")); await flush();
assert.equal(observer.getCurrentResult().data.items.length, 5);

// Page changes expose no prior page; search changes expose no prior search.
observer.setOptions(options("", 1));
assert.equal(observer.getCurrentResult().data, undefined);
assert.deepEqual(requests[1].args, [1, 5, "ACTIVE", ""]);
observer.setOptions(options("a", 0)); assert.equal(observer.getCurrentResult().data, undefined);
observer.setOptions(options("ab", 0)); assert.equal(observer.getCurrentResult().data, undefined);
assert.deepEqual(requests[2].args, [0, 5, "ACTIVE", "a"]);
assert.deepEqual(requests[3].args, [0, 5, "ACTIVE", "ab"]);
requests[3].resolve(response("newest")); await flush();
const afterNewest = observed.length;
requests[2].resolve(response("old-search")); requests[1].resolve(response("old-page", 1)); await flush();
assert.deepEqual(observer.getCurrentResult().data.items.map(item => item.publicToken), response("newest").items.map(item => item.publicToken));
assert.ok(observed.slice(afterNewest).every(items => !items || items.every(token => token.startsWith("newest"))), "late responses cannot reverse current selection");
assert.equal(client.getQueryCache().getAll().length, 1, "inactive pages/searches are discarded, not accumulated");

// Only the requested last page is fetched for a hundred-Project catalog.
observer.setOptions(options("", 19)); assert.deepEqual(requests[4].args, [19, 5, "ACTIVE", ""]);
requests[4].resolve(response("last-page", 19)); await flush();
assert.equal(observer.getCurrentResult().data.page, 19); assert.equal(observer.getCurrentResult().data.items.length, 5);
unsubscribe(); await flush(); assert.equal(client.getQueryCache().getAll().length, 0); client.clear();

// Source guards tie the short-height structure to the existing themed sheet.
const css = postcss.parse(readFileSync(new URL("../src/components/navigation/ResponsiveNavigation.module.css", import.meta.url), "utf8"));
const declarations = selector => {
  const values = {}; css.walkRules(rule => { if (rule.selectors.includes(selector)) rule.walkDecls(d => { values[d.prop] = d.value; }); }); return values;
};
assert.equal(declarations(".sheet[data-project-selection]").display, "flex");
assert.equal(declarations(".picker")["min-height"], "0");
assert.equal(declarations(".pickerResults")["overflow-y"], "auto");
assert.equal(declarations(".pickerResults")["overscroll-behavior"], "contain");
assert.equal(declarations(".sheet")["overflow-y"], "auto", "outer sheet remains scrollable if enlarged controls alone exceed the viewport");
assert.match(declarations(".sheet")["max-height"], /100dvh.*safe-area-inset-top.*safe-area-inset-bottom/);
assert.equal(declarations(".pickerHeader input").background, "var(--nav-input)");
assert.equal(declarations(".pickerHeader input").color, "var(--nav-text)");
assert.equal(declarations(".pickerPagination button")["min-height"], "44px");
const service = readFileSync(new URL("../../backend/src/main/java/com/splitmate/project/service/ProjectService.java", import.meta.url), "utf8");
assert.match(service, /findByStatusAndDeletedAtIsNull\(status, pageable\)/);
assert.match(service, /findByStatusAndDeletedAtIsNullAndNameContainingIgnoreCase\(status, search, pageable\)/);
assert.match(service, /PageRequest.of\(page, effectiveSize, PROJECT_ORDER\)/);
assert.match(service, /Sort.Order.desc\("updatedAt"\)/);
console.log("Quick Add paging PASS: existing encoded page API, ACTIVE/size=5/search/page parameters, real QueryObserver page/search races and late responses, no previous-result placeholder, discarded inactive pages, 100-Project last-page request; themed/internal-scroll structure and server deletion/order guards. Static/component checks only; browser/API-server round trip unverified.");
