import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// Run with a local backend using an empty, disposable PostgreSQL database.
const origin = process.env.SPENDINGMATE_ANALYTICS_PARITY_ORIGIN;
assert.match(origin ?? "", /^http:\/\/127\.0\.0\.1:\d+$/);
async function request(path, method = "GET", body) {
  const response = await fetch(origin + path, {
    method,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : undefined;
}

assert.deepEqual(await request("/api/projects"), [], "use a fresh, disposable database");
const createProject = (name, type = "CONTINUOUS") => request("/api/projects", "POST", {
  name, type, roundingUnit: 1, members: [{ name: "Alice" }, { name: "Bob" }],
});
const first = await createProject("Parity Alpha");
const second = await createProject("Parity Beta");
const event = await createProject("Parity Event", "EVENT");
const expensePath = project => `/api/projects/${project.publicToken}/expenses`;
const expenseBody = (project, amount, paidOn, category) => ({
  payerMemberId: project.members[0].id,
  participantMemberIds: project.members.map(member => member.id),
  amount, paidOn, category, content: "Analytics parity",
});
const createExpense = (project, amount, paidOn, category) =>
  request(expensePath(project), "POST", expenseBody(project, amount, paidOn, category));
const firstExpense = await createExpense(first, 1200, "2026-09-01", "FOOD");
assert.deepEqual(firstExpense.participants.map(row => row.allocatedShare), [600, 600]);
const previousExpense = await createExpense(second, 600, "2026-10-01", "UTILITIES");
await createExpense(first, 250, "2026-11-30", null);
const movedExpense = await createExpense(second, 950, "2026-11-01", "FOOD");
await createExpense(event, 99999, "2026-11-01", "OTHER");

const root = fileURLToPath(new URL("../", import.meta.url));
const server = await createServer({ root, server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
try {
  const { DedicatedAnalytics } = await server.ssrLoadModule("/src/pages/AnalyticsPage/DedicatedAnalytics.tsx");
  const search = new URLSearchParams({ startMonth: "2026-09", endMonth: "2026-11", projectType: "CONTINUOUS" });
  for (const project of [second, event, first]) search.append("projectToken", project.publicToken);
  const path = `/api/analytics?${search}`;
  const yen = value => `¥${value.toLocaleString("ja-JP")}`;
  async function check({ total, count, trend, rate, categories, projectTotals }) {
    const data = await request(path);
    assert.equal(data.totalExpense, total);
    assert.equal(data.expenseCount, count);
    assert.equal(data.endMonthComparison.percentageChange, rate);
    assert.deepEqual(data.monthlyTrend.map(row => row.totalExpense), trend);
    assert.deepEqual(data.categoryBreakdown.map(row => [row.category, row.totalExpense]), categories);
    assert.deepEqual(Object.fromEntries(data.projectComparison.map(row => [row.publicToken, row.totalExpense])), {
      [first.publicToken]: projectTotals[0], [second.publicToken]: projectTotals[1],
    });
    assert.deepEqual(data.excludedProjects, [{
      publicToken: event.publicToken, projectType: "EVENT", reason: "EVENT_EXCLUDED",
    }]);

    const html = renderToStaticMarkup(createElement(DedicatedAnalytics, {
      state: { status: "ready", data, live: true }, categoryView: "donut", onCategoryViewChange() {},
    }));
    const metric = label => html.split(`data-kpi="${label}"`)[1].split("</article>")[0];
    assert.ok(metric("期間支出総額").includes(`>${yen(data.totalExpense)}</div>`));
    assert.ok(metric("支出件数").includes(`>${data.expenseCount}<span`));
    assert.ok(metric("終了月の前月比").includes(rate.replace(/^-/, "−") + "%"));
    for (const row of data.monthlyTrend) {
      const month = `2026年${Number(row.month.slice(5))}月`;
      assert.ok(html.includes(`<td class="">${month}</td><td class="num">${yen(row.totalExpense)}</td>`));
    }
    for (const row of [...data.categoryBreakdown, ...data.projectComparison]) {
      assert.ok(html.includes(`data-key="${row.publicToken ?? row.category ?? "unclassified"}" data-amount="${row.totalExpense}"`));
    }
    const order = ["分析サマリー", "カテゴリ別支出", "月次支出推移", "プロジェクト別支出"].map(label => html.indexOf(label));
    assert.ok(order[0] >= 0 && order.every((position, index) => index === 0 || position > order[index - 1]));
    assert.match(html, /イベントProjectを1件除外/);
    assert.doesNotMatch(html, /Parity Event|¥99,999|¥2,861,000|デモデータ/);
  }

  await check({ total: 3000, count: 4, trend: [1200, 600, 1200], rate: "100.00",
    categories: [["FOOD", 2150], ["UTILITIES", 600], [null, 250]], projectTotals: [1450, 1550] });
  await request(`${expensePath(second)}/${movedExpense.id}`, "PATCH", {
    ...expenseBody(second, 1000, "2026-10-05", "OTHER"), version: movedExpense.version,
  });
  await check({ total: 3050, count: 4, trend: [1200, 1600, 250], rate: "-84.38",
    categories: [["FOOD", 1200], ["UTILITIES", 600], ["OTHER", 1000], [null, 250]], projectTotals: [1450, 1600] });
  await request(`${expensePath(second)}/${previousExpense.id}`, "DELETE");
  await check({ total: 2450, count: 3, trend: [1200, 1000, 250], rate: "-75.00",
    categories: [["FOOD", 1200], ["OTHER", 1000], [null, 250]], projectTotals: [1450, 1000] });
  await createExpense(second, 300, "2026-11-01", null);
  await check({ total: 2750, count: 4, trend: [1200, 1000, 550], rate: "-45.00",
    categories: [["FOOD", 1200], ["OTHER", 1000], [null, 550]], projectTotals: [1450, 1300] });
  console.log("Dedicated Analytics HTTP/PostgreSQL to rendered Current parity PASS: totals/count, exact comparison, trend, categories, Projects, Event exclusion and Expense CRUD.");
} finally {
  await server.close();
}
