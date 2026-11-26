import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";

function load(path, imports = {}) {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, (specifier) => {
    assert.ok(specifier in imports, `Unexpected import: ${specifier}`);
    return imports[specifier];
  });
  return module.exports;
}

const requests = [];
const api = load("../src/api/projectApi.ts", {
  "./client": { apiRequest: async (...args) => { requests.push(args); return {}; } },
});
await api.addProjectMember("project/token", "Alice");
await api.renameProjectMember("project/token", "member/id", "Alicia");
assert.deepEqual(requests, [
  ["/api/projects/project%2Ftoken/members", { method: "POST", body: '{"name":"Alice"}' }],
  ["/api/projects/project%2Ftoken/members/member%2Fid", {
    method: "PATCH", body: '{"name":"Alicia"}',
  }],
]);

const queryClient = new QueryClient();
const invalidated = [];
const invalidateQueries = queryClient.invalidateQueries.bind(queryClient);
queryClient.invalidateQueries = (filters) => {
  invalidated.push(filters.queryKey);
  return invalidateQueries(filters);
};
const { projectKeys, reconcileProjectMember, useProjectMemberMutations } =
  load("../src/features/projects/projectQueries.ts", {
    "@tanstack/react-query": {
      useMutation: (options) => options,
      useQueryClient: () => queryClient,
    },
    "../../api/expenseApi": {},
    "../../api/client": { ApiError: class ApiError extends Error {} },
    "../../api/projectApi": {},
    "../settlements/settlementQueries": {},
    "../analytics/analyticsQueries": { invalidateProjectAnalytics: async () => {} },
  });
const { toProjectDetail } = load("../src/features/projects/projectDetailAdapter.ts");
const first = { id: "a", name: "Alice", displayOrder: 1, active: true };
const second = { id: "b", name: "Bob", displayOrder: 4, active: true };
const project = {
  publicToken: "token", name: "Trip", description: null, type: "EVENT", currency: "JPY",
  roundingUnit: 1, status: "ACTIVE", members: [second, first],
};
const added = { id: "c", name: "Carol", displayOrder: 5, active: true };
const afterAdd = reconcileProjectMember(project, added);
assert.deepEqual(afterAdd.members.map((member) => [member.id, member.displayOrder]),
  [["a", 1], ["b", 4], ["c", 5]]);
const afterRename = reconcileProjectMember(afterAdd, { ...first, name: "Alicia" });
assert.deepEqual(afterRename.members.map((member) => member.id), ["a", "b", "c"]);
assert.equal(afterRename.members[0].active, true);
assert.equal(afterRename.members[0].displayOrder, 1);
queryClient.setQueryData(projectKeys.detail("token"), project);
const mutations = useProjectMemberMutations("token");
await mutations.add.onSuccess(added);
assert.deepEqual(queryClient.getQueryData(projectKeys.detail("token")).members,
  afterAdd.members);
await mutations.rename.onSuccess({ ...first, name: "Alicia" });
assert.deepEqual(queryClient.getQueryData(projectKeys.detail("token")).members,
  afterRename.members);
assert.deepEqual(invalidated, [projectKeys.detail("token"), projectKeys.list,
  projectKeys.detail("token"), projectKeys.list]);

const expenses = [{ id: "expense", content: "Dinner", category: null, payerMemberId: "a",
  amount: 100, paidOn: "2026-10-06", note: null, version: 0,
  participants: [{ memberId: "a", allocatedShare: 50, allocationOrder: 1 },
    { memberId: "b", allocatedShare: 50, allocationOrder: 2 }] }];
const settlement = { transfers: [{ id: "transfer", fromMemberId: "b", toMemberId: "a",
  finalRoundedAmount: 50, status: "OUTSTANDING" }],
  balances: [{ memberId: "a", paidAmount: 100, burdenAmount: 50, exactBalance: 50 },
    { memberId: "b", paidAmount: 0, burdenAmount: 50, exactBalance: -50 }] };
const detail = toProjectDetail(afterRename, expenses, settlement);
assert.deepEqual(detail.members.map((member) => member.displayName), ["Alicia", "Bob", "Carol"]);
assert.equal(detail.expenses[0].payerName, "Alicia");
assert.deepEqual(detail.expenses[0].participantNames, ["Alicia", "Bob"]);
assert.equal(detail.settlementTransfers[0].toMemberName, "Alicia");
assert.equal(detail.memberBalances[0].name, "Alicia");
console.log("Project member API, ordering, and derived names passed.");
