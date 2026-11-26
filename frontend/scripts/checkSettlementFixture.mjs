import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const fixturesDir = fileURLToPath(new URL("../src/mocks/fixtures/", import.meta.url));
function loadFixture(filename, imports = {}) {
  const source = readFileSync(join(fixturesDir, filename), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", code)(module.exports, (specifier) => {
    assert.ok(specifier in imports, `Unexpected fixture import: ${specifier}`);
    return imports[specifier];
  });
  return module.exports;
}

async function checkFixture() {
  const { sameSettlementFingerprint, sameSettlementSource } =
    loadFixture("../../features/settlements/settlementSource.ts");
  const settlementModule = loadFixture("settlementResponses.ts");
  const { demoSettlementPublicToken, getSettlementFixture } = settlementModule;
  const { getEventProjectDetail } = loadFixture("eventProjectDetails.ts", {
    "./settlementResponses": settlementModule,
  });
  const project = getEventProjectDetail(demoSettlementPublicToken);
  assert.ok(project);
  assert.equal(project.expenses.length, 5);
  assert.equal(project.kpi.expenseCount, 5);
  assert.equal(project.kpi.totalExpenseYen, 50000);
  assert.equal(project.kpi.perMemberAverageYen, 10000);
  assert.equal(project.expenses.reduce((sum, expense) => sum + expense.amountYen, 0), 50000);

  const paidByName = new Map(project.members.map((member) => [member.displayName, 0]));
  const burdenPerMember = project.expenses.reduce((sum, expense) => sum + expense.perPersonYen, 0);
  for (const expense of project.expenses) {
    assert.equal(expense.perPersonYen * expense.participantCount, expense.amountYen);
    assert.deepEqual(expense.participantNames, project.members.map((member) => member.displayName));
    paidByName.set(expense.payerName, paidByName.get(expense.payerName) + expense.amountYen);
  }

  const fewer = getSettlementFixture(demoSettlementPublicToken, "FEWER_TRANSFERS");
  const understandable = getSettlementFixture(demoSettlementPublicToken, "UNDERSTANDABLE");
  assert.equal(getSettlementFixture(demoSettlementPublicToken, "FEWER_TRANSFERS"), fewer);
  assert.equal(getSettlementFixture(demoSettlementPublicToken, "UNDERSTANDABLE"), understandable);
  assert.notEqual(fewer.runId, understandable.runId);
  assert.match(fewer.sourceStateFingerprint, /^[0-9a-f]{64}$/);
  assert.equal(fewer.sourceStateFingerprint, understandable.sourceStateFingerprint);
  assert.equal(sameSettlementFingerprint(fewer, understandable), true);
  const otherSource = { ...understandable, sourceStateFingerprint: "b".repeat(64) };
  assert.equal(sameSettlementFingerprint(fewer, otherSource), false);
  let responses = [];
  const { getSettlementComparison } = loadFixture(
    "../../features/settlements/settlementQueries.ts",
    {
      "../../api/settlementApi": {
        getSettlement: async () => responses.shift(),
      },
      "../../mocks/fixtures/settlementResponses": { getSettlementFixture: () => null },
      "./settlementSource": { sameSettlementFingerprint },
      "@tanstack/react-query": { useQuery: () => {} },
    },
  );
  responses = [fewer, understandable, fewer];
  assert.deepEqual(await getSettlementComparison("project"), {
    FEWER_TRANSFERS: fewer, UNDERSTANDABLE: understandable,
  });
  responses = [fewer, otherSource, fewer];
  await assert.rejects(getSettlementComparison("project"), /source changed/);
  const { sourceStateFingerprint: _fewerFingerprint, ...normalFewer } = fewer;
  const { sourceStateFingerprint: _understandableFingerprint, ...normalUnderstandable } = understandable;
  responses = [normalFewer, normalUnderstandable, normalFewer];
  assert.deepEqual(await getSettlementComparison("project"), {
    FEWER_TRANSFERS: normalFewer, UNDERSTANDABLE: normalUnderstandable,
  });
  responses = [normalFewer, normalUnderstandable, normalFewer];
  await assert.rejects(getSettlementComparison("project", true), /source changed/);
  responses = [fewer, normalUnderstandable, fewer];
  await assert.rejects(getSettlementComparison("project"), /source changed/);
  const emptyFewer = { ...fewer, balances: [], transfers: [] };
  const emptyUnderstandable = { ...understandable, balances: [], transfers: [] };
  responses = [emptyFewer, emptyUnderstandable, emptyFewer];
  assert.deepEqual(await getSettlementComparison("project"), {
    FEWER_TRANSFERS: emptyFewer, UNDERSTANDABLE: emptyUnderstandable,
  });
  const sourceProject = {
    publicToken: "project", type: "EVENT", status: "ACTIVE", roundingUnit: 10, members: [],
  };
  const sourceExpenses = { items: [] };
  assert.equal(sameSettlementSource(sourceProject, sourceExpenses, sourceProject, sourceExpenses), true);
  // An intermediate source can return to the same A/B Expense set (ABA).
  // Its Settlement fingerprint must still fail the final source check.
  const intermediateRun = { ...fewer, sourceStateFingerprint: "b".repeat(64) };
  assert.equal(sameSettlementFingerprint(intermediateRun, fewer), false);
  // Likewise, a pre-recovery in-flight response cannot stand in for the final GET.
  const oldInFlightRun = { ...fewer, sourceStateFingerprint: "c".repeat(64) };
  assert.equal(sameSettlementFingerprint(oldInFlightRun, fewer), false);
  assert.equal(getSettlementFixture("other-token", "FEWER_TRANSFERS"), null);
  assert.equal(fewer.transfers.length, 3);
  assert.equal(understandable.transfers.length, 4);
  assert.deepEqual(fewer.balances, understandable.balances);
  assert.equal(fewer.balances.reduce((sum, balance) => sum + balance.exactBalance, 0), 0);
  assert.equal(fewer.balances.reduce((sum, balance) => sum + balance.burdenAmount, 0), 50000);

  for (const result of [fewer, understandable]) {
    const remaining = new Map(result.balances.map((balance) => [balance.memberId, balance.exactBalance]));
    const net = new Map(result.balances.map((balance) => [balance.memberId, 0]));
    for (const balance of result.balances) {
      const name = project.members.find((member) => member.id === balance.memberId)?.displayName;
      assert.equal(paidByName.get(name), balance.paidAmount);
      assert.equal(balance.burdenAmount, burdenPerMember);
      assert.equal(balance.paidAmount - balance.burdenAmount, balance.exactBalance);
      assert.equal(balance.roundedTransferNet, balance.exactBalance);
      assert.equal(balance.roundingDifference, 0);
    }
    result.transfers.forEach((transfer, index) => {
      assert.equal(transfer.transferOrder, index + 1);
      assert.equal(transfer.status, "OUTSTANDING");
      assert.equal(transfer.completedAt, null);
      assert.equal(transfer.explanation.kind, "NET_BALANCE_MATCH");
      assert.equal(transfer.explanation.fromExactBalanceBefore, remaining.get(transfer.fromMemberId));
      assert.equal(transfer.explanation.toExactBalanceBefore, remaining.get(transfer.toMemberId));
      assert.equal(transfer.exactAmount, transfer.initiallyRoundedAmount);
      assert.equal(transfer.exactAmount, transfer.finalRoundedAmount);
      assert.equal(transfer.roundingAdjustment, 0);
      remaining.set(transfer.fromMemberId, remaining.get(transfer.fromMemberId) + transfer.exactAmount);
      remaining.set(transfer.toMemberId, remaining.get(transfer.toMemberId) - transfer.exactAmount);
      net.set(transfer.fromMemberId, net.get(transfer.fromMemberId) - transfer.finalRoundedAmount);
      net.set(transfer.toMemberId, net.get(transfer.toMemberId) + transfer.finalRoundedAmount);
    });
    for (const balance of result.balances) {
      assert.equal(remaining.get(balance.memberId), 0);
      assert.equal(net.get(balance.memberId), balance.exactBalance);
    }
  }
  console.log("Settlement comparison fixture arithmetic: PASS");
}

await checkFixture();
