import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PassThrough } from "node:stream";
import ts from "typescript";
import { createPortal } from "react-dom";
import postcss from "postcss";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import * as Motion from "motion/react";
import { renderToPipeableStream, renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { build, createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = "src/pages/AnalyticsPage/";
function load(relative, { dev = false, react = React, lazy = React.lazy, motionReact = Motion } = {}) {
  const cache = new Map();
  function read(path) {
    if (cache.has(path)) return cache.get(path);
    const code = ts.transpileModule(readFileSync(path, "utf8").replaceAll("import.meta.env.DEV", String(dev)), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const module = { exports: {} }; cache.set(path, module.exports);
    new Function("exports", "require", code)(module.exports, (name) => {
      if (name.endsWith("/ThemeProvider")) return { useTheme: () => ({ theme: "light", toggleTheme() {} }) };
      if (name === "react/jsx-runtime") return jsxRuntime;
      if (name === "motion/react") return motionReact;
      if (name === "react-dom") return {createPortal};
      if (name === "react") return { ...react, lazy };
      if (name === "react-router-dom") return { Link: ({ to, children, ...props }) => React.createElement("a", { href: to, ...props }, children) };
      if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
      if (name.endsWith(".css")) return {};
      if (name.endsWith(".png")) return { __esModule: true, default: "/logo.png" };
      assert.ok(name.startsWith("."), `Unexpected import ${name}`);
      const candidate = resolve(dirname(path), name);
      const file = [candidate, `${candidate}.ts`, `${candidate}.tsx`].find((value) => existsSync(value));
      assert.ok(file, `Missing ${name}`);
      return read(file);
    });
    return module.exports;
  }
  return read(resolve(root, relative));
}
const model = load(`${base}dedicatedAnalyticsPresentation.ts`);
const demo = load(`${base}dedicatedAnalyticsDemoData.ts`);
const { demoExpenses } = load(`${base}dedicatedAnalyticsDemoExpenses.ts`);
const { aggregateDemo: aggregate, initialSelection: initial, demoProjects: projects } = demo;
const data = aggregate(initial);
assert.equal(demoExpenses.length, 5800);
assert.equal(new Set(demoExpenses.map((e) => e.id)).size, 5800);
// Canonical Current fields extracted from the deployed Sites v4 commit, not a checksum of generated totals.
assert.equal(createHash("sha256").update(JSON.stringify(demoExpenses)).digest("hex"), "3fad88ea061c9dd0af1e497ba1fa86bc512c6064e73c4eb293493c600fa7b046");
for (const expense of demoExpenses) {
  assert.ok(Number.isSafeInteger(expense.amount) && expense.amount > 0);
  assert.match(expense.paidOn, /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/);
  assert.ok(model.analyticsCategories.some((c) => c.category === expense.category));
}
assert.equal(data.totalExpense, 2861000); assert.equal(data.expenseCount, 230);
assert.deepEqual([data.endMonthComparison.totalExpense, data.endMonthComparison.previousTotalExpense, data.endMonthComparison.difference, data.endMonthComparison.percentageChange], [534000, 486000, 48000, "9.88"]);
assert.equal(aggregate({ ...initial, projectTokens: ["p1", "p2"] }).totalExpense, 2460460);
assert.equal(aggregate({ ...initial, projectTokens: ["p1", "p2"] }).expenseCount, 158);
const summer = aggregate({ ...initial, startMonth: "2026-06", endMonth: "2026-07" });
assert.equal(summer.totalExpense, 920000); assert.equal(summer.expenseCount, 77);
assert.equal(summer.endMonthComparison.difference, -16000); assert.equal(summer.endMonthComparison.percentageChange, "-3.42");
assert.deepEqual(aggregate({ ...initial, projectTokens: [...initial.projectTokens].reverse() }), data);
assert.ok(data.categoryBreakdown.some((c) => c.category === null));
assert.ok(data.categoryBreakdown.some((c) => c.category === "OTHER"));
function conservation(value) {
  for (const key of ["monthlyTrend", "categoryBreakdown", "projectComparison"]) {
    assert.equal(value[key].reduce((sum, item) => sum + BigInt(item.totalExpense), 0n), BigInt(value.totalExpense), key);
    assert.equal(value[key].reduce((sum, item) => sum + item.expenseCount, 0), value.expenseCount, key);
  }
  assert.equal(value.monthlyTrend.at(-1).totalExpense, value.endMonthComparison.totalExpense);
}
for (const project of projects) {
  for (const [startMonth, endMonth] of [["2024-11", "2026-10"], ["2026-05", "2026-10"], ["2025-02", "2025-02"], ["2026-10", "2026-10"]]) {
    conservation(aggregate({ projectTokens: [project.publicToken], startMonth, endMonth }));
  }
}
for (let count = 1; count <= 20; count++) conservation(aggregate({ ...initial, projectTokens: projects.slice(0, count).map((p) => p.publicToken) }));
assert.equal(aggregate({ ...initial, projectTokens: ["p21"] }).expenseCount, 0);
assert.equal(aggregate({ ...initial, startMonth: "2025-02", endMonth: "2025-02" }).totalExpense, 0);
for (const selection of [
  { ...initial, projectTokens: [] }, { ...initial, projectTokens: projects.map((p) => p.publicToken) },
  { ...initial, projectTokens: ["p1", "p1"] }, { ...initial, projectTokens: ["unknown"] },
  { ...initial, startMonth: "2026-11" }, { ...initial, startMonth: "2024-10" },
  ...["", "2026-1", "0000-01", "10000-01", "2026-13"].map((startMonth) => ({ ...initial, startMonth })),
]) assert.throws(() => aggregate(selection));
assert.throws(() => model.selectionMonths(initial, projects.map((p) => ({ ...p, projectType: "EVENT" }))));
assert.equal(model.selectionMonths({ ...initial, startMonth: "0001-01", endMonth: "0001-01" }, projects).length, 1);
assert.equal(model.selectionMonths({ ...initial, startMonth: "9998-01", endMonth: "9999-12" }, projects).length, 24);
assert.equal(model.percentage(1n, 32n), "3.13"); assert.equal(model.percentage(-1n, 32n), "-3.13");
assert.equal(model.percentage(-1n, 10000000n), "0.00"); assert.equal(model.percentage(1n, 3n), "33.33");
assert.equal(model.percentage(9007199254740991n, 1n), "900719925474099100.00");
const sample = { id: "x", projectToken: "p1", paidOn: "2026-10-01", amount: 10, category: "FOOD", createdAt: "2025-01-01" };
assert.equal(aggregate(initial, [sample]).totalExpense, 10, "paidOn controls scope despite different createdAt");
assert.throws(() => aggregate(initial, [sample, sample]), /重複/);
assert.throws(() => aggregate(initial, [{ ...sample, amount: 1.5 }]), /不正/);
assert.throws(() => aggregate(initial, [{ ...sample, amount: Number.MAX_SAFE_INTEGER }, { ...sample, id: "y", amount: 1 }]), /範囲/);
assert.equal(aggregate(initial, [{ ...sample, amount: Number.MAX_SAFE_INTEGER }]).totalExpense, Number.MAX_SAFE_INTEGER);
const oneMonth = aggregate({ ...initial, startMonth: "2026-10" });
assert.equal(oneMonth.endMonthComparison.previousTotalExpense, 486000, "comparison reads the predecessor outside the displayed range");
for (const scenario of ["normal", "empty", "previousZero", "noPrevious"]) conservation(demo.demoResult(initial, scenario));
assert.equal(demo.demoResult(initial, "previousZero").totalExpense, 2375000);
assert.equal(demo.demoResult(initial, "previousZero").endMonthComparison.percentageChange, null);
assert.equal(demo.demoResult(initial, "previousZero").endMonthComparison.difference, 534000);
assert.equal(demo.demoResult(initial, "noPrevious").endMonthComparison.comparisonState, "UNAVAILABLE");
assert.equal(aggregate({ ...initial, startMonth: "0001-01", endMonth: "0001-01" }).endMonthComparison.comparisonState, "NO_PREVIOUS_MONTH");

const view = load(base + "DedicatedAnalytics.tsx");
const charts = load(base + "AnalyticsV4Charts.tsx");
const chartInteraction = load(base + "AnalyticsChartInteraction.tsx");
const { chartPointComparison, chartPreviousValue, chartBadgePosition } = chartInteraction;
assert.deepEqual(chartPointComparison(1,null), {direction:"unavailable",text:"比較不可",rate:"—",arrow:"—"});
assert.equal(chartPointComparison(33,32).rate,"+3.13%", "existing exact HALF_UP rate");
assert.equal(chartPointComparison(31,32).rate,"−3.13%");
assert.equal(chartPointComparison(32,32).rate,"0.00%");
assert.equal(chartPointComparison(999999,1000000).rate,"0.00%");
assert.equal(chartPointComparison(0,32).rate,"−100.00%");
assert.equal(chartPointComparison(Number.MAX_SAFE_INTEGER,1).rate,"+900719925474099000.00%", "no floating-point difference/rate");
for (const current of [0,1,Number.MAX_SAFE_INTEGER]) assert.equal(chartPointComparison(current,0).rate,"—");
const monthComparison=load(base+'AnalyticsMonthComparison.tsx');
const homeComparison=load('src/pages/HomePage/monthlyOverview/MonthlyOverview.tsx');
for(const [current,previous,state,direction] of [[200,100,'COMPARABLE','increase'],[50,100,'COMPARABLE','decrease'],[100,100,'COMPARABLE','unchanged'],[100,0,'NO_PREVIOUS_DATA','increase'],[0,0,'BOTH_MONTHS_EMPTY','unchanged'],[100,null,'NO_PREVIOUS_MONTH','unavailable'],[Number.MAX_SAFE_INTEGER,1,'COMPARABLE','increase'],[1,Number.MAX_SAFE_INTEGER,'COMPARABLE','decrease'],[Number.MAX_SAFE_INTEGER-1,Number.MAX_SAFE_INTEGER,'COMPARABLE','decrease']]){
 const value=monthComparison.monthDetailComparison(current,previous);assert.equal(value.comparisonState,state);
 if(previous!==null)assert.equal(BigInt(value.difference),BigInt(current)-BigInt(previous));
 if(state==='COMPARABLE')assert.equal(value.percentageChange,chartPointComparison(current,previous).rate.slice(0,-1).replace('−','-').replace(/^\+/,''));
 const actual=renderToStaticMarkup(React.createElement(monthComparison.AnalyticsMonthComparison,{current,previous,counts:false}));
 assert.equal(actual,renderToStaticMarkup(React.createElement(homeComparison.Comparison,{value})),'Analytics uses the exact Home renderer');
 assert.ok(actual.includes(`data-direction="${direction}"`));assert.doesNotMatch(actual,/増加|減少/);
}
const countComparison=renderToStaticMarkup(React.createElement(monthComparison.AnalyticsMonthComparison,{current:3,previous:1,counts:true}));assert.match(countComparison,/\+2件/);assert.doesNotMatch(countComparison,/¥/);
assert.equal(chartPreviousValue([100,150],["2025-12","2026-01"],1),100);
assert.equal(chartPreviousValue([100,150],["2026-01","2026-03"],1),null,"different adjacent indices are not necessarily adjacent months");
assert.equal(chartPreviousValue([100],["2026-01"],0),null,"no hidden-month values are fabricated");
for (const [left,right,viewport] of [[0,740,740],[40,340,360],[-100,320,360],[200,740,640]]) {
  const bounds={left,top:30,right,bottom:330},size={width:120,height:100};
  for(const [px,py] of [[left-100,-100],[right+100,900],[left,30],[right,330]]){
    const position=chartBadgePosition(px,py,bounds,size,viewport);
    assert.ok(position.x+left>=Math.max(left,0)+8);
    assert.ok(position.x+left+size.width<=Math.min(right,viewport)-8);
    assert.ok(position.y>=8&&position.y+size.height<=292);
  }
}
const interactionCss=readFileSync(resolve(root,base+"analyticsChartInteraction.css"),"utf8");
postcss.parse(interactionCss).walkRules(rule=>assert.ok(rule.selector.includes("[data-analytics-v4]"),"all interaction CSS remains scoped"));
assert.match(interactionCss,/data-direction=increase[^}]*var\(--red\)/);
assert.match(interactionCss,/data-direction=decrease[^}]*var\(--negative\)/);
assert.match(interactionCss,/data-theme=dark[^}]*--chart-area-opacity:\.12/);
const overlayMarkup=renderToStaticMarkup(React.createElement(React.Fragment,null,...[0,1].map(key=>React.createElement(charts.Chart,{key,series:[{id:"a",name:"A",values:[100,150]},{id:"b",name:"B",values:[75,125]}],labels:["2026-09","2026-10"]}))));
const gradients=[...overlayMarkup.matchAll(/<linearGradient id="([^"]+)"/g)].map(match=>match[1]);
assert.equal(gradients.length,4);assert.equal(new Set(gradients).size,4,"gradient IDs do not collide across charts/series");
for(const id of gradients)assert.ok(overlayMarkup.includes(`fill="url(#${id})"`));
assert.equal((overlayMarkup.match(/class="chart-point-hit"/g)??[]).length,8);
assert.equal((overlayMarkup.match(/role="group"/g)??[]).length,2,"interactive SVG descendants remain accessible");
assert.equal((overlayMarkup.match(/role="tooltip" aria-hidden="true"/g)??[]).length,2);
const future = load(base + "analyticsFuturePreviewData.ts");
const linkedCategories = load(base + "AnalyticsLinkedCategories.tsx");
assert.notEqual(charts.rankCategoryKey(null),charts.rankCategoryKey("unclassified"));
let linkedConservationCases=0;
for (const months of [1,6,12,24]) for (const projectTokens of [["p1"],["p2"],["p3"],["p1","p2","p3"]]) for (const tab of ["all","living","utilities"]) for (const scenario of ["normal","empty","previous-zero","unavailable"]) {
  const selection={...initial,projectTokens,startMonth:future.monthAt(model.monthIndex(initial.endMonth)-months+1)};
  const result=future.futureAnalysis(selection,tab,scenario),dimension=tab === "utilities" ? "utility" : "category";
  const series=linkedCategories.linkedCategorySeries(result,dimension);
  for(const row of series){
    assert.equal(row.values.reduce((sum,v)=>sum+BigInt(v),0n),BigInt(row.amount),"category months conserve the period amount");
    const records=result.records.filter(record=>(dimension === "utility" ? record.utility : record.category) === row.id);
    assert.equal(row.counts.reduce((sum,v)=>sum+v,0),records.length);
    for(let i=0;i<result.labels.length;i++) assert.equal(BigInt(row.values[i]),records.filter(record=>record.paidOn.slice(0,7) === result.labels[i]).reduce((sum,record)=>sum+BigInt(record.amount),0n),"paidOn and ID, not array index or invented proportions");
  }
  for(let i=0;i<result.labels.length;i++){
    assert.equal(series.reduce((sum,row)=>sum+BigInt(row.values[i]),0n),BigInt(result.trend[i].amount),"all categories conserve the existing monthly trend");
    assert.equal(series.reduce((sum,row)=>sum+row.counts[i],0),result.trend[i].count);
  }
  assert.equal(series.reduce((sum,row)=>sum+BigInt(row.amount),0n),BigInt(result.total));
  linkedConservationCases++;
}
const linkedBase=future.futureAnalysis(initial,"all","normal");
const exactRank=renderToStaticMarkup(React.createElement(charts.Rank,{rows:linkedBase.categories,total:linkedBase.total,donut:true,combined:true,interaction:{highlighted:null,selected:null,reduced:true,selectionId:"ssr-donut",onHover(){},onSelect(){},onClear(){}}}));
assert.match(exactRank,/class="linked-donut-value" aria-hidden="true">¥2,861,000<\/strong>/,"SSR and JavaScript-disabled clients see the completed visual value");
assert.match(exactRank,/class="linked-donut-exact">期間支出総額 ¥2,861,000<\/span>/,"assistive readout is the exact target, independent of Motion");
assert.match(exactRank,/data-donut-motion="true"/);
const deferredArcs=[...exactRank.matchAll(/<circle[^>]*stroke-dasharray="([^"]+)"/g)].map(match=>match[1].split(" ").map(Number));
assert.equal(deferredArcs.length,linkedBase.categories.length);assert.ok(deferredArcs.every(([length,gap])=>length === 0&&Math.abs(gap-2*Math.PI*64)<1e-8),"SSR and initial client dash state both wait at zero, never completed-to-hidden");
assert.match(exactRank,/<noscript><style>[^<]*svg\[data-donut-motion\] circle\{stroke-dasharray:var\(--donut-complete-dash\);stroke-dashoffset:var\(--donut-complete-offset\)\}<\/style><\/noscript>/,"no-script parser fallback completes the ring from exact CSS variables");
assert.match(exactRank,/@media\(prefers-reduced-motion:reduce\)/,"reduced motion completes the SSR ring before client effects");
const completeArcs=[...exactRank.matchAll(/--donut-complete-dash:([^;"]+)/g)].map(match=>match[1].split(" ").map(Number));
assert.equal(completeArcs.length,linkedBase.categories.length);assert.ok(Math.abs(completeArcs.reduce((sum,[length])=>sum+length,0)-2*Math.PI*64)<1e-8);
const completeOffsets=[...exactRank.matchAll(/--donut-complete-offset:([^;"]+)/g)].map(match=>-Number(match[1]));
assert.equal(completeOffsets.length,completeArcs.length);let fallbackEdge=0;
completeOffsets.forEach((start,index)=>{assert.ok(Math.abs(start-fallbackEdge)<1e-8);fallbackEdge=start+completeArcs[index][0];});



const largest={...linkedBase,categories:[{id:null,name:"未分類",amount:Number.MAX_SAFE_INTEGER}],labels:["2026-10"],records:[{...linkedBase.records[0],category:null,paidOn:"2026-10-01",amount:Number.MAX_SAFE_INTEGER}]};
assert.equal(linkedCategories.linkedCategorySeries(largest)[0].values[0],Number.MAX_SAFE_INTEGER);
assert.throws(()=>linkedCategories.linkedCategorySeries({...largest,records:[...largest.records,{...largest.records[0],amount:1}]}),/safe integer JPY/);
console.log(`Linked categories: ${linkedConservationCases} real-fixture Project/1-6-12-24 month/tab/scenario cases conserve exact period/monthly amounts and counts; checked BigInt conversion PASS.`);

let currentCases=0;
for(const months of [1,6,12,24])for(const projectTokens of [['p1'],['p1','p2','p3']])for(const scenario of ['normal','previousZero','empty']){
 const selection={...initial,projectTokens,startMonth:future.monthAt(model.monthIndex(initial.endMonth)-months+1)};
 const result=demo.demoResult(selection,scenario);
 const records=demoExpenses.filter(r=>scenario!=='empty'&&projectTokens.includes(r.projectToken)&&r.paidOn.slice(0,7)>=selection.startMonth&&r.paidOn.slice(0,7)<=selection.endMonth&&(scenario!=='previousZero'||r.paidOn.slice(0,7)!==result.endMonthComparison.previousMonth));
 const current={...view.currentAnalysis(result),records,utilities:[]};
 const series=linkedCategories.linkedCategorySeries(current);
 for(const row of series)assert.equal(row.values.reduce((s,n)=>s+BigInt(n),0n),BigInt(row.amount));
 for(let i=0;i<months;i++)assert.equal(series.reduce((s,row)=>s+BigInt(row.values[i]),0n),BigInt(result.monthlyTrend[i].totalExpense));
 assert.equal(series.reduce((s,row)=>s+row.counts.reduce((a,b)=>a+b,0),0),result.expenseCount);
 currentCases++;
}
console.log(`Current linked: ${currentCases} canonical-ledger month/category totals and counts conserved, including null/empty/previous-zero PASS.`);

const markup = (state = { status: "ready", data }, categoryView = "bars") => renderToStaticMarkup(React.createElement(view.DedicatedAnalytics, { state, categoryView, onCategoryViewChange() {} }));
const html = markup();
for (const text of ["¥2,861,000", "230", "+¥48,000", "+9.88%", "継続Project", "未分類", "その他", "月次支出推移", "プロジェクト別支出"]) assert.ok(html.includes(text), text);
assert.doesNotMatch(html, /カテゴリの表示形式|aria-pressed="true">横棒/);
assert.match(html, /current-category-layout/);
assert.equal((html.match(/<circle[^>]+stroke="var\(--c/g) ?? []).length, 8);
assert.equal((html.match(/class="f-track"/g) ?? []).length >= 11, true);
const analysis = view.currentAnalysis(data);
const categoryMarkup = (categoryView) => renderToStaticMarkup(React.createElement(charts.CategoryCard, { data: analysis, view: categoryView, onChange() {} }));
const rows = (text) => [...text.matchAll(/<div class="f-rank-row"[\s\S]*?<span class="f-rank-pct">[^<]*<\/span><\/div>/g)].map(([row]) => row.replace(/<[^>]+>/g, ""));
assert.deepEqual(rows(categoryMarkup("bars")), rows(categoryMarkup("donut")));
for (const category of analysis.categories) {
  assert.ok(categoryMarkup("bars").includes(category.color)); assert.ok(categoryMarkup("donut").includes(category.color));
}
for (const status of ["loading", "error", "accessInvalidated"]) {
  const result = markup({ status, data, onRetry() {} });
  assert.doesNotMatch(result, /¥|ふたりの生活費|シェアハウス|共同作業費/);
  assert.match(result, status === "loading" ? /aria-busy="true"/ : /role="alert"/);
}
assert.match(markup({ status: "ready", data: demo.demoResult(initial, "empty") }), /対象期間の支出はありません/);
const chartMarkup = items => renderToStaticMarkup(React.createElement(charts.Chart, {series:[{id:"expense-total",name:"支出合計",values:items.map(t=>t.totalExpense)}],labels:items.map(t=>t.month)}));
const emptyChart = chartMarkup(demo.demoResult(initial, "empty").monthlyTrend);
for (const tick of [0, 1, 2, 3]) assert.ok(emptyChart.includes(">" + tick + "</text>"));
assert.deepEqual(view.monthlyChartAxis(534000), { maximum: 600000, ticks: [0, 200000, 400000, 600000] });
for (const maximum of [0, 1, 4, 99, 534000, 600000, 600001, Number.MAX_SAFE_INTEGER]) {
  const axis = view.monthlyChartAxis(maximum);
  assert.ok(axis.maximum >= maximum); assert.equal(axis.ticks[0], 0);
  assert.ok(axis.ticks.every((tick, index) => index === 0 || tick > axis.ticks[index - 1]));
}
assert.match(html, /f-kpi-value">↑ <span>\+9.88%/);
assert.doesNotMatch(html, /↑ 増加/);
assert.doesNotMatch(markup({ status: "ready", data: demo.demoResult(initial, "previousZero") }), /Infinity|NaN|\+100.00%/);
assert.match(markup({ status: "ready", data: demo.demoResult(initial, "previousZero") }), /比較率 —/);
assert.match(markup({ status: "ready", data: demo.demoResult(initial, "noPrevious") }), /未取得/);
const long = aggregate({ ...initial, startMonth: "2024-11" });
const longChart = chartMarkup(long.monthlyTrend);
assert.match(longChart, /min-width:2630px/); assert.equal((longChart.match(/<circle/g) ?? []).length, 24);
assert.match(longChart, /viewBox="0 0 2630 280"/);
for (const item of long.monthlyTrend) assert.ok(longChart.includes(charts.month(item.month)));

// Completed SSR remains visible, exact-text and native-dash based without JS.
for (const items of [[],[{id:null,name:"未分類",amount:100}],[{id:"a",name:"A",amount:60},{id:"b",name:"B",amount:30},{id:null,name:"未分類",amount:10}],[{id:"a",name:"A",amount:1},{id:"b",name:"B",amount:1},{id:"c",name:"C",amount:1}]]) {
  const total=items.reduce((sum,row)=>sum+row.amount,0), C=2*Math.PI*64;
  const result=renderToStaticMarkup(React.createElement(charts.Rank,{rows:items,total,donut:true,combined:true}));
  if(!total){assert.doesNotMatch(result,/<svg/);assert.match(result,/合計 ¥0・0件/);continue;}
  const circles=[...result.matchAll(/<circle\b[^>]*r="64"[^>]*>/g)].map(match=>match[0]);
  assert.equal(circles.length,items.length);assert.match(result,/viewBox="0 0 160 160"/);
  let end=0;
  for(const circle of circles){
    assert.doesNotMatch(circle,/pathLength|path-length/);
    const [length,gap]=circle.match(/stroke-dasharray="([^"]+)"/)[1].split(" ").map(Number);
    const start=-Number(circle.match(/stroke-dashoffset="([^"]+)"/)[1]);
    assert.ok(Math.abs(start-end)<1e-9);assert.ok(Math.abs(length+gap-C)<1e-9);end=start+length;
  }
  assert.ok(Math.abs(end-C)<1e-9);
  assert.ok(result.includes(charts.yen(total)));assert.equal((result.match(/class="f-track"/g)??[]).length,items.length,"Current retains both donut and bars");
  for(const row of items){assert.ok(result.includes(charts.yen(row.amount)));assert.ok(result.includes((row.amount/total*100).toFixed(1)+"%"));}
}
const deltaSsr=renderToStaticMarkup(React.createElement(charts.RankBar,{target:"35%",color:"var(--negative)",className:"delta-track"}));
assert.match(deltaSsr,/class="delta-track" aria-hidden="true"/);assert.match(deltaSsr,/width:35%/);assert.match(deltaSsr,/background:var\(--negative\)/);
// Future metadata joins the unchanged Current ledger. Samples remain disconnected from real APIs.
assert.equal(future.futureExpenses.length,5800);
for (const e of future.futureExpenses) {
  assert.equal(future.sum(e.allocations.map(a=>a.amount)),e.amount);
  if(e.contractId) assert.equal(e.category,"DAILY_NECESSITIES");
  if(e.utility) assert.equal(e.category,"UTILITIES");
}
const expected={all:[2861000,230],utilities:[405000,90],living:[1683000,68],subscriptions:[39600,14]};
for(const [tab,values] of Object.entries(expected)){
  const a=future.futureAnalysis(initial,tab,"normal");
  assert.deepEqual([a.total,a.count],values);
  assert.equal(future.sum(a.trend.map(t=>t.amount)),a.total);
  assert.equal(future.sum(a.categories.map(t=>t.amount)),a.total);
  assert.equal(future.sum(a.projects.map(t=>t.amount)),a.total);
}
assert.equal(future.futureAnalysis(initial,"utilities","normal").yearComparison.rate,"8.70");
assert.equal(future.futureAnalysis(initial,"all","unavailable").comparison.previous,null);
assert.equal(future.futureAnalysis(initial,"all","previous-zero").total,2375000);

function find(tree,predicate) {
  if(!tree || typeof tree !== "object") return undefined;
  if(predicate(tree)) return tree;
  return React.Children.toArray(tree.props?.children).map(c=>find(c,predicate)).find(Boolean);
}
// Actual Motion inView + animation engine; observer notifications/React commits are
// simulated. This cannot establish browser clipping, paint or DOM reconciliation.
const animations = [];
let hooks, hookIndex, pending;
const animationCharts = load(base + "AnalyticsV4Charts.tsx", {
  react: { ...React,
    useId() { const index = hookIndex++; return hooks[index] ??= "chart-test-id"; },
    useState(initial) { const index = hookIndex++; if (!(index in hooks)) hooks[index] = typeof initial === "function" ? initial() : initial; return [hooks[index], () => {}]; },
    useRef(initial) { const index = hookIndex++; return hooks[index] ??= { current: initial }; },
    useLayoutEffect(effect, deps) {
      const instanceHooks = hooks, index = hookIndex++, previous = instanceHooks[index];
      if (!previous || deps.some((value, i) => value !== previous.deps[i])) pending.push(() => {
        previous?.cleanup?.(); instanceHooks[index] = { deps, effect, cleanup: effect() };
      });
    },
  },
  motionReact: { ...Motion,
    useMotionValue(initial) { const index = hookIndex++; return hooks[index] ??= Motion.motionValue(initial); },
    useTransform(compute) {
      const index = hookIndex++;
      if (!hooks[index]) {
        const value = Motion.transformValue(compute);
        hooks[index] = { value, cleanup: () => value.destroy() };
      }
      return hooks[index].value;
    },
    animate(value, target, options) {
      let tick, clock = 0, running = false;
      const from = value.get();
      const control = Motion.animate(value, target, { ...options, driver(update) {
        tick = update;
        return { start() { running = true; }, stop() { running = false; }, now: () => clock };
      } });
      tick(0);
      animations.push({ value, target, from, options, advance(ms) { clock = ms; if (running) tick(ms); } });
      return control;
    },
  },
});
const previousWindow = globalThis.window, previousObserver = globalThis.IntersectionObserver;
const listeners = new Set(), observers = new Set(), instances = new Map(), tracks = new Map();
class TestIntersectionObserver {
  constructor(callback, options) {
    this.callback = callback; this.targets = new Set(); observers.add(this);
    assert.equal(options.threshold, 0, "any intersection of the fixed track, independent of card height");
    assert.equal(options.root, undefined, "implicit viewport root retains ancestor clipping");
    assert.equal(options.rootMargin, undefined, "no expanded viewport triggers offscreen playback");
  }
  observe(element) { this.targets.add(element); }
  unobserve(element) { this.targets.delete(element); }
  disconnect() { this.targets.clear(); observers.delete(this); }
}
const preference = { matches: false,
  addEventListener(type, callback) { assert.equal(type, "change"); listeners.add(callback); },
  removeEventListener(type, callback) { assert.equal(type, "change"); listeners.delete(callback); },
};
const setReducedMotion = matches => { preference.matches = matches; for (const callback of [...listeners]) callback(); };
function dispose(instance) { for (const hook of instance.hooks) hook?.cleanup?.(); }
function rankUpdate(items) {
  const tree = animationCharts.Rank({ rows: items, total: 100 });
  const ranked = React.Children.toArray(tree.props.children).filter(node => node.props?.className === "f-rank-row");
  const nextKeys = new Set(ranked.map(row => row.key));
  for (const [key, instance] of instances) if (!nextKeys.has(key)) { dispose(instance); instances.delete(key); }
  const widths = new Map(); tracks.clear();
  for (const row of ranked) {
    const bar = find(row, node => node.type?.name === "RankBar");
    const instance = instances.get(row.key) ?? { hooks: [], element: new EventTarget() };
    instances.set(row.key, instance); hooks = instance.hooks; hookIndex = 0; pending = [];
    const rendered = bar.type(bar.props);
    assert.equal(rendered.props.className, "f-track"); assert.equal(rendered.props["aria-hidden"], "true");
    rendered.props.ref.current = instance.element;
    pending.forEach(effect => effect());
    widths.set(row.props["data-key"], rendered.props.children.props.style.width);
    tracks.set(row.props["data-key"], instance.element);
  }
  return widths;
}
function viewport(visible, ids = [...tracks.keys()]) {
  for (const id of ids) for (const observer of [...observers]) if (observer.targets.has(tracks.get(id))) {
    observer.callback([{ target: tracks.get(id), isIntersecting: visible }]);
  }
}
const rankItem = (id, amount, color = "--c1") => ({ id, name: id ?? "未分類", amount, color });
const latestAnimation = id => animations.findLast(animation => animation.value === widths.get(id));
let widths;
try {
  globalThis.IntersectionObserver = TestIntersectionObserver;
  globalThis.window = { matchMedia: query => { assert.equal(query, "(prefers-reduced-motion: reduce)"); return preference; } };
  widths = rankUpdate([rankItem("p1", 35), rankItem("p2", 65)]);
  assert.equal(widths.get("p1").get(), "0%"); assert.equal(animations.length, 0, "offscreen mount waits without animating");
  widths = rankUpdate([rankItem("p1", 72), rankItem("p2", 28)]);
  assert.equal(widths.get("p1").get(), "0%"); assert.equal(animations.length, 0, "pre-entry data changes only update the target");
  viewport(true, ["p1"]);
  const entrance = latestAnimation("p1");
  assert.equal(entrance.from, "0%"); assert.equal(entrance.target, "72%");
  assert.deepEqual(entrance.options, { type: "tween", duration: 0.55, ease: "easeOut" });
  entrance.advance(275);
  const entranceHalfway = widths.get("p1").get();
  assert.ok(parseFloat(entranceHalfway) > 0 && parseFloat(entranceHalfway) < 72);
  widths = rankUpdate([rankItem("p1", 20), rankItem("p2", 80)]);
  const retarget = latestAnimation("p1");
  assert.equal(retarget.from, entranceHalfway); assert.equal(retarget.options.duration, 0.25, "mid-entrance updates use current width and update timing");
  entrance.advance(550); assert.equal(widths.get("p1").get(), entranceHalfway, "obsolete entrance cannot restore its target");
  retarget.advance(250); assert.equal(widths.get("p1").get(), "20%");
  let count = animations.length;
  viewport(false, ["p1"]); viewport(true, ["p1"]); viewport(true, ["p1"]);
  assert.equal(animations.length, count, "re-entry/duplicate intersections do not replay");
  widths = rankUpdate([rankItem("p1", 35), rankItem("p2", 65)]);
  latestAnimation("p1").advance(250);
  widths = rankUpdate([rankItem("p1", 72), rankItem("p2", 28)]);
  const first = latestAnimation("p1"); first.advance(125);
  const halfway = widths.get("p1").get();
  assert.ok(parseFloat(halfway) > 35 && parseFloat(halfway) < 72, "post-entry 35 → 72 has an intermediate width in the real engine");
  widths = rankUpdate([rankItem("p1", 20), rankItem("p2", 80)]);
  const interrupted = latestAnimation("p1"); assert.equal(interrupted.from, halfway);
  first.advance(250); assert.equal(widths.get("p1").get(), halfway);
  interrupted.advance(125); assert.ok(parseFloat(widths.get("p1").get()) < parseFloat(halfway));
  count = animations.length;
  const p1Width = widths.get("p1");
  widths = rankUpdate([rankItem("p2", 80), rankItem("p1", 20, "--c2")]);
  assert.equal(widths.get("p1"), p1Width); assert.equal(animations.length, count, "same ratios, theme and draft-only rerenders do not restart");
  setReducedMotion(true);
  assert.equal(p1Width.get(), "20%"); assert.equal(p1Width.isAnimating(), false);
  assert.equal(widths.get("p2").get(), "80%", "reduced motion also exposes unentered bars");
  interrupted.advance(250); assert.equal(p1Width.get(), "20%");
  widths = rankUpdate([rankItem("p1", 35), rankItem("p3", 65)]);
  assert.equal(widths.get("p1").get(), "35%"); assert.equal(widths.get("p3").get(), "65%", "initial reduce preference displays final width");
  assert.equal(animations.length, count);
  setReducedMotion(false); viewport(true);
  assert.equal(animations.length, count, "disabling reduced motion does not replay skipped entrances");
  widths = rankUpdate([rankItem("p1", 72), rankItem("p3", 28)]);
  const final = latestAnimation("p1"); final.advance(250); assert.equal(p1Width.get(), "72%");
  viewport(false);
  assert.equal(widths.get("p3").isAnimating(), false, "exit stops an unfinished animation");
  count = animations.length;
  widths = rankUpdate([rankItem("p1", 40), rankItem("p3", 60)]);
  assert.equal(widths.get("p1").get(), "40%"); assert.equal(widths.get("p3").get(), "60%");
  assert.equal(animations.length, count, "post-entry offscreen updates snap instead of animating");
  viewport(true); assert.equal(animations.length, count, "return shows the latest offscreen update without replay");
  widths = rankUpdate([rankItem("p1", 72), rankItem("p3", 28)]);
  const removedWidth = widths.get("p3");
  widths = rankUpdate([rankItem("p1", 100)]);
  assert.equal(removedWidth.isAnimating(), false, "removed running bars stop");
  widths = rankUpdate([rankItem("p1", 72), rankItem("p3", 28)]);
  assert.notEqual(widths.get("p3"), removedWidth); assert.equal(widths.get("p3").get(), "0%", "a new instance waits for its own viewport entry");
  viewport(true, ["p3"]); assert.equal(latestAnimation("p3").options.duration, 0.55);
  setReducedMotion(true); assert.equal(widths.get("p3").get(), latestAnimation("p3").target, "live reduce preserves the exact computed target");
  assert.equal(widths.get("p3").isAnimating(), false, "live reduce stops entrance as well as updates");
  setReducedMotion(false);
  widths = rankUpdate([rankItem(null, 30), rankItem("OTHER", 70)]);
  assert.notEqual(widths.get("unclassified"), widths.get("OTHER"));
  viewport(true); latestAnimation("unclassified").advance(550);
  latestAnimation("OTHER").advance(100);
  viewport(false, ["OTHER"]);
  assert.equal(widths.get("OTHER").get(), latestAnimation("OTHER").target);
  assert.equal(widths.get("OTHER").isAnimating(), false, "exit also stops the first entrance");
  count = animations.length; viewport(true, ["OTHER"]);
  assert.equal(animations.length, count, "interrupted entrance does not restart on re-entry");
  assert.equal(widths.get("unclassified").get(), "30%");
  globalThis.window = {};
  widths = rankUpdate([rankItem("no-media", 100)]);
  assert.equal(widths.get("no-media").get(), "100%", "missing media API falls back to final widths");
  globalThis.window = { matchMedia: () => preference }; delete globalThis.IntersectionObserver;
  widths = rankUpdate([rankItem("no-observer", 100)]);
  assert.equal(widths.get("no-observer").get(), "100%", "missing observer falls back without hiding bars");
} finally {
  for (const instance of instances.values()) dispose(instance);
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  if (previousObserver === undefined) delete globalThis.IntersectionObserver; else globalThis.IntersectionObserver = previousObserver;
}
assert.equal(listeners.size, 0); assert.equal(observers.size, 0, "unmount disconnects observers/listeners/animations");
assert.ok(animations.every(animation => !animation.value.isAnimating()));
console.log("Rank viewport: actual Motion observer/engine with simulated intersections/effects PASS; browser geometry/paint/reconciliation unverified.");
// Chart uses the same actual observer, animation and derived-value engines.
// Refs/effect commits and keyed component ownership are still a small simulation.
const chartRoot = { hooks: [], element: new EventTarget() };
let plotInstance, childInstances = [], chartView;
const flushDerived = () => Motion.frameSteps.preRender.process({ timestamp: 0, delta: 16, isProcessing: true });
function hookRender(element, instance) {
  hooks = instance.hooks; hookIndex = 0; pending = [];
  const tree = element.type(element.props), effects = pending;
  return { tree, effects };
}
function disposePlot() {
  if (plotInstance) dispose(plotInstance);
  childInstances.forEach(dispose); childInstances = [];
}
function chartUpdate(props) {
  const root = hookRender(React.createElement(animationCharts.Chart, props), chartRoot);
  const scroll = find(root.tree, node => node.props?.className === "chart-scroll");
  const drawing = find(root.tree, node => node.type?.name === "ChartDrawing");
  assert.notEqual(scroll.props.ref, drawing.props.drawing, "width measurement and Motion observation retain separate refs");
  if (!plotInstance || plotInstance.key !== drawing.key) {
    disposePlot(); plotInstance = { hooks: [], key: drawing.key };
  }
  const plot = hookRender(drawing, plotInstance);
  const seriesNodes = React.Children.toArray(plot.tree.props.children).filter(n => n.type?.name === "ChartSeriesDrawing");
  const childEffects = [], lines = [];
  let slot = 0;
  for (const seriesNode of seriesNodes) {
    const instance = childInstances[slot] ??= { hooks: [] }; slot++;
    const series = hookRender(seriesNode, instance); childEffects.push(...series.effects);
    const children = React.Children.toArray(series.tree.props.children);
    const line = { polyline: children.find(n => n.type === Motion.motion.polyline), dots: [] };
    for (const pointNode of children.filter(n => n.type?.name === "ChartPoint")) {
      const instance = childInstances[slot] ??= { hooks: [] }; slot++;
      const point = hookRender(pointNode, instance); childEffects.push(...point.effects);
      const elements = React.Children.toArray(point.tree.props.children);
      line.dots.push({ circle: elements[0], label: elements.find(n => n.type === Motion.motion.text) });
    }
    // React attaches this group's host ref after its descendants, before the
    // enclosing ChartDrawing layout effect. Ancestor host refs attach later.
    if (series.tree.props.ref) series.tree.props.ref.current = { ownerSVGElement: { parentElement: chartRoot.element } };
    lines.push(line);
  }
  const beforeEffects = { progress: seriesNodes[0].props.progress.get(), entered: drawing.props.entered.current };
  childEffects.forEach(effect => effect()); plot.effects.forEach(effect => effect()); root.effects.forEach(effect => effect()); flushDerived();
  chartView = { labelBounds:seriesNodes[0].props.labelBounds, beforeEffects, positions: seriesNodes[0].props.positions, progress: seriesNodes[0].props.progress, lines, key: drawing.key, target: drawing.props.target };
  return chartView;
}
function chartViewport(visible) {
  for (const observer of [...observers]) if (observer.targets.has(chartRoot.element)) observer.callback([{ target: chartRoot.element, isIntersecting: visible }]);
  flushDerived();
}
function advanceChart(animation, ms) { animation.advance(ms); flushDerived(); }
function verifyPlotSync() {
  for (const line of chartView.lines) {
    const vertices = line.polyline.props.points.get().split(" ").map(pair => pair.split(",").map(Number));
    const expected=animationCharts.chartValueLabelLayout(line.polyline.props.points.get(),line.dots.map(dot=>dot.label?.props.children??""),chartView.labelBounds);
    line.dots.forEach(({circle,label},i) => {
      assert.equal(circle.props.cx.get(), vertices[i][0]); assert.equal(circle.props.cy.get(), vertices[i][1]);
      if (label) { assert.equal(label.props.x.get(), expected[i].x); assert.equal(label.props.y.get(), expected[i].y); }
    });
  }
}
const chartProps = (values = [100,200], extra = {}) => ({ series: [{ id: "total", name: "合計", values }], labels: ["2026-09","2026-10"], readable: true, ...extra });
try {
  globalThis.IntersectionObserver = TestIntersectionObserver;
  globalThis.window = { matchMedia: () => preference }; preference.matches = false;
  let count = animations.length;
  chartUpdate(chartProps());
  assert.deepEqual(chartView.beforeEffects, { progress: 0, entered: false }, "CSR is hidden even before layout effects, preventing a completed-line flash");
  assert.equal(chartView.lines[0].polyline.props.pathLength.get(), 0);
  assert.ok(chartView.lines[0].dots.every(dot => dot.circle.props.style.opacity.get() === 0));
  assert.equal(observers.size, 1, "the real scrolling container is observed on the first commit");
  // Replay layout setup/cleanup with retained refs/values as StrictMode does.
  const layoutHooks = plotInstance.hooks.filter(hook => hook?.effect);
  layoutHooks.forEach(hook => hook.cleanup?.());
  layoutHooks.forEach(hook => { hook.cleanup = hook.effect(); }); flushDerived();
  assert.equal(observers.size, 1); assert.equal(chartView.progress.get(), 0);
  assert.equal(chartView.progress.isAnimating(), false);
  assert.equal(chartView.progress.get(), 0); assert.equal(animations.length, count);
  chartUpdate(chartProps([150,200]));
  assert.equal(animations.length, count, "offscreen initial data changes do not animate");
  chartViewport(true);
  const entrance = animations.findLast(a => a.value === chartView.progress);
  assert.equal(chartView.progress.get(), 0, "entry starts at zero, not a completed line");
  assert.equal(chartView.lines[0].polyline.props.pathLength.get(), 0);
  assert.deepEqual(entrance.options, { type: "tween", duration: 0.65, ease: "linear" });
  advanceChart(entrance, 325);
  assert.ok(chartView.progress.get() > 0 && chartView.progress.get() < 1);
  const line = chartView.lines[0];
  assert.ok(line.polyline.props.pathLength.get() > 0 && line.polyline.props.pathLength.get() < 1);
  assert.equal(line.dots[0].circle.props.style.opacity.get(), 1);
  assert.equal(line.dots[1].circle.props.style.opacity.get(), 0, "unreached point is hidden");
  chartUpdate(chartProps([100,200]));
  const update = animations.findLast(a => a.value === chartView.positions);
  assert.equal(update.options.duration, 0.3); advanceChart(update, 150); verifyPlotSync();
  assert.equal(chartView.lines[0].dots[0].label.props.children, "¥100", "label text is the exact latest amount during movement");
  const halfway = chartView.positions.get();
  assert.notEqual(halfway, update.from); assert.notEqual(halfway, update.target);
  chartUpdate(chartProps([140,200]));
  const interrupted = animations.findLast(a => a.value === chartView.positions);
  assert.equal(interrupted.from, halfway);
  advanceChart(update, 300); assert.equal(chartView.positions.get(), halfway);
  advanceChart(interrupted, 150); verifyPlotSync();
  advanceChart(entrance, 650);
  assert.equal(chartView.progress.get(), 1); assert.equal(chartView.lines[0].polyline.props.pathLength.get(), 1);
  assert.equal(chartView.lines[0].dots[1].circle.props.style.opacity.get(), 1);
  advanceChart(interrupted, 300); assert.equal(chartView.positions.get(), chartView.target); verifyPlotSync();
  count = animations.length;
  chartUpdate(chartProps([140,200], {series:[{id:"total",name:"合計",values:[140,200],color:"--c2"}]}));
  assert.equal(animations.length, count, "same values/theme/draft rerenders do not restart");
  chartViewport(false); chartViewport(true); assert.equal(animations.length, count, "chart entrance plays once");
  chartUpdate(chartProps([120,200])); const reducedUpdate = animations.findLast(a => a.value === chartView.positions);
  advanceChart(reducedUpdate, 100); setReducedMotion(true); flushDerived();
  assert.equal(chartView.positions.get(), chartView.target); assert.equal(chartView.positions.isAnimating(), false); verifyPlotSync();
  setReducedMotion(false);
  chartViewport(false); count = animations.length; chartUpdate(chartProps([160,200]));
  assert.equal(animations.length, count, "post-entry offscreen update snaps");
  assert.equal(chartView.positions.get(), chartView.target); chartViewport(true); assert.equal(animations.length, count);
  chartUpdate(chartProps([140,200]));
  advanceChart(animations.findLast(a => a.value === chartView.positions), 100);
  // All structural mismatches remount only the drawing with final positions.
  for (const props of [
    chartProps([160,200],{labels:["2026-08","2026-09"]}),
    chartProps([160,200],{series:[{id:"other",name:"合計",values:[160,200]}]}),
    chartProps([160,200],{series:[{id:"other",name:"別名",values:[160,200]}]}),
    chartProps([160,400]), chartProps([160,400],{readable:false}),
    chartProps([160,400],{counts:true}),
    chartProps([160,200],{series:[{id:"a",name:"A",values:[160,200]},{id:"b",name:"B",values:[100,180]}]}),
  ]) {
    const priorPositions = chartView.positions; count = animations.length;
    chartUpdate(props);
    assert.notEqual(chartView.positions, priorPositions); assert.equal(priorPositions.isAnimating(), false);
    assert.equal(chartView.progress.get(), 1); assert.equal(chartView.positions.get(), chartView.target);
    chartViewport(true); assert.equal(animations.length, count, "incompatible months/IDs/names/domain/geometry snap without morph or entrance"); verifyPlotSync();
  }
  chartUpdate(chartProps([150,200],{series:[{id:"a",name:"A",values:[150,200]},{id:"b",name:"B",values:[110,180]}]}));
  advanceChart(animations.findLast(a => a.value === chartView.positions), 150); verifyPlotSync();
  assert.notEqual(chartView.lines[0].polyline.props.points.get(), chartView.lines[1].polyline.props.points.get());
  for (const months of [1,6,12,24]) {
    const labels = Array.from({length:months},(_,i) => `${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,"0")}`);
    const values = Array.from({length:months},(_,i) => 100+i);
    chartUpdate(chartProps(values,{labels})); chartViewport(true);
    const key = chartView.key;
    chartUpdate(chartProps(values.map(v => v+1),{labels}));
    assert.equal(chartView.key, key, `${months} months retain compatible geometry`);
    const animation = animations.findLast(a => a.value === chartView.positions);
    advanceChart(animation,150); assert.equal(chartView.lines[0].dots.length, months); verifyPlotSync();
    advanceChart(animation,300); assert.equal(chartView.positions.get(), chartView.target); verifyPlotSync();
  }
  // New displayed Chart instance: initial reduce and a mid-entrance preference change.
  disposePlot(); plotInstance = undefined; chartRoot.hooks = []; setReducedMotion(true);
  chartUpdate(chartProps()); count = animations.length; chartViewport(true);
  assert.equal(chartView.progress.get(), 1); assert.equal(animations.length, count);
  disposePlot(); plotInstance = undefined; chartRoot.hooks = []; setReducedMotion(false);
  chartUpdate(chartProps()); chartViewport(true);
  const stoppedEntrance = animations.findLast(a => a.value === chartView.progress);
  advanceChart(stoppedEntrance, 100); setReducedMotion(true); flushDerived();
  assert.equal(chartView.progress.get(), 1); assert.equal(chartView.progress.isAnimating(), false);
  advanceChart(stoppedEntrance, 650); assert.equal(chartView.progress.get(), 1);
  setReducedMotion(false); count = animations.length; chartViewport(false); chartViewport(true); assert.equal(animations.length, count);
  chartUpdate(chartProps([140,200])); const removedPositions = chartView.positions;
  disposePlot(); plotInstance = undefined;
  assert.equal(removedPositions.isAnimating(), false, "unmount discards a running graph");
} finally {
  disposePlot();
  if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  if (previousObserver === undefined) delete globalThis.IntersectionObserver; else globalThis.IntersectionObserver = previousObserver;
}
assert.equal(observers.size, 0); assert.equal(listeners.size, 0);
console.log("Line Motion: actual points interpolation/derived coordinates/observer + simulated React lifecycle PASS; browser paint/scroll unverified.");
// A fresh process loads the actual client renderer after installing its Node DOM model.
process.stdout.write(execFileSync(process.execPath, [fileURLToPath(new URL("./checkAnalyticsLineMotionDom.mjs", import.meta.url))], { cwd: root, encoding: "utf8", timeout: 15000 }));
function harness(relative, dev = true) {
  const values=[];let index=0;
  const component=load(relative,{dev,react:{...React,useRef:()=>({current:null}),useEffect(){},useState:initialValue=>{
    const key=index++;if(!(key in values))values[key]=typeof initialValue==="function"?initialValue():initialValue;
    return [values[key],next=>{values[key]=typeof next==="function"?next(values[key]):next;}];
  }}});
  return (name,props)=>{index=0;return component[name](props);};
}
// Inspect only tab marker contracts; native layout projection is a browser check.
{
  const savedWindow=globalThis.window,savedDocument=globalThis.document;
  const preference=new EventTarget();preference.matches=false;
  globalThis.window={matchMedia:()=>preference};
  let focused,selected='living',state,index=0,effects=[],cleanups=[];
  const fakeReact={...React,useId:()=>':tabs-one:',useState:initial=>{
    if(state===undefined)state=typeof initial==='function'?initial():initial;
    return [state,next=>{state=next;}];
  },useEffect:effect=>{if(index++===0)effects.push(effect);}};
  const {FutureTabs}=load(base+'AnalyticsFuturePreview.tsx',{react:fakeReact});
  const onTab=id=>{selected=id;};
  const render=()=>FutureTabs({tab:selected,onTab});
  const buttons=tree=>tree.props.children.props.children;
  const marker=tree=>buttons(tree).find(n=>n.props['aria-selected']).props.children[1];
  globalThis.document={getElementById:id=>({focus(){focused=id;}})};
  try {
    let tree=render();cleanups=effects.map(effect=>effect());
    assert.equal(tree.props.id,':tabs-one:');
    assert.equal(buttons(tree).filter(n=>n.props['aria-selected']).length,1);
    assert.equal(buttons(tree).find(n=>n.props.tabIndex===0).props.id,'tab-living','URL-selected initial tab renders immediately');
    for(const id of ['all','utilities','living','subscriptions','utilities','all']){
      buttons(tree).find(n=>n.props.id===`tab-${id}`).props.onClick();tree=render();
      const bar=marker(tree);assert.equal(bar.props.layoutId,'selection');assert.equal(bar.props.initial,false);
      assert.equal(bar.props['aria-hidden'],'true');
      assert.deepEqual(bar.props.transition.layout,{type:'tween',duration:.22,ease:'easeInOut'});
      assert.equal(buttons(tree).find(n=>n.props['aria-selected']).props.id,`tab-${id}`);
    }
    for(const [key,expected] of [['ArrowLeft','subscriptions'],['ArrowRight','all'],['End','subscriptions'],['Home','all']]){
      let prevented=false;tree.props.children.props.onKeyDown({key,preventDefault(){prevented=true;}});tree=render();
      assert.ok(prevented);assert.equal(selected,expected);assert.equal(focused,`tab-${expected}`);
    }
    preference.matches=true;preference.dispatchEvent(new Event('change'));tree=render();
    assert.equal(marker(tree).type,'span','live reduced-motion removes projected marker immediately');
    assert.equal(marker(tree).props.layoutId,undefined);
    buttons(tree)[2].props.onClick();tree=render();assert.equal(selected,'living');assert.equal(marker(tree).type,'span');
    preference.matches=false;preference.dispatchEvent(new Event('change'));tree=render();assert.equal(marker(tree).props.initial,false);
    const groupTwo=load(base+'AnalyticsFuturePreview.tsx',{react:{...fakeReact,useId:()=>':tabs-two:'}}).FutureTabs({tab:selected,onTab});
    assert.notEqual(tree.props.id,groupTwo.props.id,'shared markers use instance-scoped LayoutGroups');
  } finally {
    cleanups.forEach(cleanup=>cleanup?.());
    if(savedWindow===undefined)delete globalThis.window;else globalThis.window=savedWindow;
    if(savedDocument===undefined)delete globalThis.document;else globalThis.document=savedDocument;
  }
  console.log('Future tabs: four selections/rapid callbacks, scoped layoutId, 220ms tween/no entrance, arrow/Home/End focus and live reduced-motion marker replacement PASS (component model; native projection/paint unverified).');
}
const renderDemo=harness(base + "DedicatedAnalyticsDemo.tsx");
const demoTree=()=>renderDemo("default",{showControls:true});
const filters=()=>find(demoTree(),n=>n.type?.name==="AnalyticsFilters");
const result=()=>find(demoTree(),n=>n.type?.name==="DedicatedAnalytics");
const scenario=v=>find(demoTree(),n=>n.type==="select").props.onChange({target:{value:v}});
assert.equal(result().props.state.data.totalExpense,2861000);
filters().props.onChange({...initial,startMonth:"2026-06"});
assert.equal(result().props.state.data.totalExpense,2861000,"month drafts require Apply");
filters().props.onApply();assert.equal(result().props.state.data.totalExpense,2441000);
filters().props.onChange({...initial,startMonth:"2024-10"});filters().props.onApply();
assert.match(filters().props.error,/24か月/);
filters().props.onChange({...initial,startMonth:"2026-11",endMonth:"2026-11"});filters().props.onApply();
assert.match(filters().props.error,/デモ収録範囲/,'removing the coverage note does not remove coverage validation');
filters().props.onChange({...initial,startMonth:"2026-06"});filters().props.onApply();
scenario("unavailable");assert.equal(result().props.state.data.endMonthComparison.previousTotalExpense,null);
assert.deepEqual(result().props.state.data.period,{startMonth:"2026-06",endMonth:"2026-10"},"unavailable retains the applied period");
scenario("loading");assert.equal(result().props.state.status,"loading");
scenario("error");assert.equal(result().props.state.status,"error");
scenario("access");assert.equal(result().props.state.status,"accessInvalidated");
assert.equal(filters().props.applied,null,"access loss must not summarize the initial demo selection as applied");
assert.deepEqual(filters().props.selection.projectTokens,[]);
assert.ok(filters().props.projects.every(p=>!["p1","p2","p3"].includes(p.publicToken)));
scenario("normal");assert.equal(result().props.state.status,"accessInvalidated","preview state cannot resurrect revoked data");
filters().props.onChange({...initial,projectTokens:["p4"]});
assert.equal(result().props.state.status,"ready");
assert.deepEqual(result().props.state.data.includedProjectTokens,["p4"]);

// Plan toggles retain the parent's tab state and the tab component identity.
{
 const page=harness(base+'DedicatedAnalyticsDemo.tsx');
 const tree=()=>page('default',{showControls:true});
 const control=label=>find(tree(),n=>n.type?.name==='Segmented'&&n.props.label===label);
 control('画面案').props.onChange('future');
 const future=()=>find(tree(),n=>n.type?.name==='AnalyticsFuturePreview');
 for(const tab of ['all','utilities','living','subscriptions']){
   future().props.onTab(tab);control('プラン案').props.onChange('pro');assert.equal(future().props.tab,tab);
   control('プラン案').props.onChange('basic');assert.equal(future().props.tab,tab);
 }
}

let lazyCalls=0;
const { AnalyticsPage: productionPage }=load(base + "AnalyticsPage.tsx",{lazy:()=>{lazyCalls++;return ()=>null;}});
assert.match(renderToStaticMarkup(React.createElement(productionPage)),/準備中/);assert.equal(lazyCalls,0);
assert.doesNotMatch(renderToStaticMarkup(React.createElement(productionPage)),/¥|ふたりの生活費|DESIGN PREVIEW|Future/);
const assets=resolve(root,"dist/assets");
const built=readdirSync(assets).filter(n=>n.endsWith(".js")).map(n=>readFileSync(resolve(assets,n),"utf8")).join("\n");
assert.doesNotMatch(built,/DedicatedAnalyticsDemo|demoExpenses|analyticsPreview|ふたりの生活費|共同作業費|週末も平日も|2,861,000|CloudNest|DeskFlow|data-donut-motion|data-linked-categories|FUTURE CONCEPT|DESIGN PREVIEW|ドーナツMotion検証|Motion検証の構成比/);
assert.match(built,/専用Analyticsはまだ利用できません/);
const server=await createServer({root,server:{middlewareMode:true,hmr:false,ws:false},optimizeDeps:{noDiscovery:true,include:[]},appType:"custom"});
try {
  for(const file of ["AnalyticsPage.tsx","DedicatedAnalyticsCurrent.tsx","DedicatedAnalyticsDemo.tsx","AnalyticsV4Charts.tsx","AnalyticsFuturePreview.tsx","AnalyticsLinkedCategories.tsx","AnalyticsFilters.tsx"]) assert.ok((await server.transformRequest("/"+base+file))?.code);
  const { ThemeProvider } = await server.ssrLoadModule("/src/app/ThemeProvider.tsx");
  const { AppShell } = await server.ssrLoadModule("/src/components/layout/AppShell.tsx");
  const queryClient = new QueryClient();
  const renderActual=(component,path,withShell=true)=>new Promise((resolve,reject)=>{
    const output=new PassThrough();let html="";
    output.setEncoding("utf8");output.on("data",chunk=>html+=chunk);output.on("end",()=>resolve(html));output.on("error",reject);
    const content=withShell?React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(AppShell)},React.createElement(Route,{path,element:React.createElement(component)}))):React.createElement(component);
    const stream=renderToPipeableStream(React.createElement(QueryClientProvider,{client:queryClient},React.createElement(ThemeProvider,null,React.createElement(MemoryRouter,{initialEntries:[path]},content))),{onAllReady(){stream.pipe(output);},onError(e){stream.abort();reject(e);}});
  });
  const actualPage=await server.ssrLoadModule("/src/pages/AnalyticsPage/AnalyticsPage.tsx");
  const actual=await renderActual(actualPage.AnalyticsPage,"/analytics");
  assert.match(actual,/aria-label="Homeへ戻る"/);
  assert.match(actual,/Project一覧を読み込み中です/);
  assert.doesNotMatch(actual,/デモデータ|¥2,861,000|data-kpi=/);
  assert.match(actual,/継続プロジェクトのみ・イベントは含みません/);
  assert.doesNotMatch(actual,/表示中の条件を適用済み|支払日のデモ収録範囲|円弧・一覧の選択で月次推移|Homeの月次概要にはイベント|SPENDINGMATE \/ ANALYTICS|集計対象：選択した継続プロジェクトのみ|class="bottom-meta"|analytics-period-help/);
  const sidebar=actual.match(/<aside[^>]*aria-label="共通サイドバー"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(sidebar);assert.match(sidebar,/aria-current="page" href="\/analytics"/);
  assert.equal((sidebar.match(/aria-current="page"/g)??[]).length,1);
  assert.doesNotMatch(sidebar,/href="\/archives"/);
  assert.equal((sidebar.match(/準備中/g)??[]).length,3);
  assert.doesNotMatch(actual,/DESIGN PREVIEW|モックの表示状態を確認/);
  const previousWindow=globalThis.window;
  try{
    // Motion may register its shared resize listener while this URL stub exists.
    globalThis.window=Object.assign(new EventTarget(), {location:{pathname:"/analytics",search:"?analyticsPreview=1"}});
    const preview=await renderActual(actualPage.AnalyticsPage,"/analytics");
    assert.match(preview,/DESIGN PREVIEW/);assert.match(preview,/Project一覧を読み込み中です/);
    assert.doesNotMatch(preview,/モックの表示状態を確認|デモデータ|¥2,861,000/);
    assert.ok(preview.indexOf("DESIGN PREVIEW")<preview.indexOf("Project一覧を読み込み中です"));
    // SSR checks the acceptance matrix's content and scope, not browser layout.
    const renderPreview = async (query) => {
      globalThis.window.location.search = `?analyticsPreview=1&${query}`;
      return renderActual(actualPage.AnalyticsPage, "/analytics");
    };
    const matrix = {
      all: ["¥2,861,000", 4, "共同生活の立替負担"],
      utilities: ["¥405,000", 3, "費目別の前年同月比"],
      living: ["¥1,683,000", 4, "支出頻度の詳細"],
      subscriptions: ["¥39,600", 3, "更新カレンダー"],
    };
    const stripTags = (text) => text.replace(/<[^>]*>/g, "");
    const matrixPages = new Map();
    for(const theme of ["light","dark"]){
      const current=await renderPreview(`view=current&theme=${theme}`);
      assert.match(current, new RegExp(`data-theme="${theme}"`));
      assert.match(current, /data-current-analytics="true"/);
      assert.doesNotMatch(current, /モックの表示状態を確認|デモデータ|¥2,861,000|data-kpi=/);
    }
    for (const theme of ["light", "dark"]) {
      for (const plan of ["basic", "pro"]) {
        for (const [tab, [total, basicCount, proTitle]] of Object.entries(matrix)) {
          const page = await renderPreview(`view=future&theme=${theme}&plan=${plan}&tab=${tab}`);
          assert.match(page, new RegExp(`data-theme="${theme}"`));
          assert.match(page, /data-future-analytics="true"/);
          assert.doesNotMatch(page, /data-current-analytics/);
          assert.match(page, new RegExp(`id="tab-${tab}" aria-selected="true"`));
          const tabNav=page.match(/<nav class="future-tabs"[\s\S]*?<\/nav>/)?.[0];
          assert.equal((tabNav.match(/future-tab-indicator/g)??[]).length,1);
          const selectedButton=tabNav.match(new RegExp(`<button[^>]*id="tab-${tab}"[^>]*>[\\s\\S]*?<\\/button>`))?.[0];
          assert.match(selectedButton,/future-tab-indicator/,'URL-selected underline is inside the selected button in both plans/themes');
          const panel = page.slice(page.indexOf('id="futureContent"'));
          assert.ok(panel.includes(total), `${theme}/${plan}/${tab}: total`);
          const count = basicCount + (plan === "pro" && ["utilities", "subscriptions"].includes(tab) ? 1 : 0);
          assert.equal((panel.match(/data-kpi=/g) ?? []).length, count);
          const primaryKpis = panel.slice(0, panel.indexOf("</section>"));
          assert.doesNotMatch(primaryKpis, /増加|減少|変化なし/);
          if (tab === "all") assert.match(primaryKpis.replace(/<!--.*?-->/g, ""), /↑ <span>\+9.88%/);
          assert.equal(panel.includes(`<h2 class="card-title">${proTitle}</h2>`), plan === "pro", `${tab}: Pro detail`);
          assert.equal(panel.includes("Proのサンプルを見る"), plan === "basic");
          assert.doesNotMatch(panel, /NaN|Infinity/);
          if (plan === "pro" && tab === "utilities") assert.match(panel, /class="num table-percentage">[^<]+%/);
          if (tab === "subscriptions") {
            assert.doesNotMatch(panel,/data-linked-categories|f-donut-center/,"no invented subscription category composition");
            for (const name of ["CloudNest", "DeskFlow", "NoteGarden", "FocusBox"]) assert.ok(panel.includes(name));
            assert.match(panel, /2026年10月31日/);
          }
          if (["all","living"].includes(tab)) {
            const categoryCard=panel.match(/<section class="card f-card"[^>]*><div class="card-head"><div><h2 class="card-title">カテゴリ別支出<\/h2>[\s\S]*?<\/section>/)?.[0];
            assert.ok(categoryCard);
              assert.match(categoryCard,/current-category-layout/);assert.match(categoryCard,/f-donut-center/);
              assert.doesNotMatch(categoryCard,/カテゴリの表示形式/);
              const expected=future.futureAnalysis(initial,tab,"normal").categories;
              assert.equal((categoryCard.match(/class="f-track"/g)??[]).length,expected.length);
              for(const row of expected){assert.ok(categoryCard.includes(charts.yen(row.amount)));assert.ok(categoryCard.includes(`data-category-id="${row.id??"unclassified"}"`));assert.ok(categoryCard.includes(`stroke="var(${row.color})"`));}

          }
          assert.doesNotMatch(panel,/ドーナツMotion検証|Motion検証の構成比/);
          matrixPages.set(`${theme}/${plan}/${tab}`, panel);
          if (theme === "dark") assert.equal(stripTags(panel), stripTags(matrixPages.get(`light/${plan}/${tab}`)), "theme keeps content identical");
        }
      }
    }
    // Retired query is ignored in every normal mode/state, not a hidden test UI.
    for(const query of ["view=future&plan=pro", "view=future&plan=pro&tab=living", "view=future&plan=basic", "", "view=future&plan=pro&state=loading", "view=future&plan=pro&state=error", "view=future&plan=pro&state=access"]){
      const normal=await renderPreview(query);
      const legacy=await renderPreview(`${query}${query ? "&" : ""}motionPreview=1`);
      assert.equal(legacy,normal,"retired motionPreview query must preserve the normal Analytics page");
      assert.doesNotMatch(legacy,/Motion検証の構成比|ドーナツMotion検証|架空の検証用データ/);
    }
    for(const theme of ["light","dark"]){
      const basicUtilities=await renderPreview(`view=future&plan=basic&tab=utilities&theme=${theme}&utilityView=items`);
      assert.doesNotMatch(basicUtilities,/aria-label="光熱・通信の推移表示"/);
      assert.equal((basicUtilities.match(/class="f-line-legend"/g)??[]).length,0,"Basic uses linked fee selection only");
      const proUtilities=await renderPreview(`view=future&plan=pro&tab=utilities&theme=${theme}&utilityView=items`);
      assert.doesNotMatch(proUtilities,/aria-label="光熱・通信の推移表示"/);
      assert.match(proUtilities,/aria-label="過去12か月の推移表示"/);
      assert.equal((proUtilities.match(/class="f-line-legend"/g)??[]).length,0,"legacy monthly view input cannot bypass Pro category selection");
    }
    const chartVariants = [
      ["all", "chart=donut"], ["living", "chart=donut"],
      ["utilities", "utilityView=items"], ["utilities", "utilityView=items&yearView=items"],
    ];
    for (const theme of ["light", "dark"]) {
      for (const [tab, variant] of chartVariants) {
        const page = await renderPreview(`view=future&plan=pro&theme=${theme}&tab=${tab}&${variant}`);
        const panel = page.slice(page.indexOf('id="futureContent"'));
        const normal = matrixPages.get(`${theme}/pro/${tab}`);
        const kpis = (html) => [...html.matchAll(/data-kpi="[\s\S]*?<\/article>/g)].map(([value]) => stripTags(value));
        assert.deepEqual(kpis(panel), kpis(normal), `${tab}/${variant}: unchanged KPI values`);
        if (tab !== "utilities") {
          assert.match(panel, /f-donut-layout/);
          assert.deepEqual(rows(panel), rows(normal), "donut preserves every rank name, amount and percentage");
        } else {
          assert.equal((panel.match(/class="f-line-legend"/g) ?? []).length, variant.includes("yearView") ? 1 : 0);
          assert.doesNotMatch(panel,/aria-label="光熱・通信の推移表示"/);
          for (const label of ["電気", "ガス", "水道", "携帯電話", "インターネット"]) assert.ok(panel.includes(label));
          assert.match(panel, /viewBox="0 0 [0-9]+ 280"/);
        }
      }
    }
    for (const theme of ["light", "dark"]) {
      for (const state of ["loading", "error", "access", "empty", "unavailable", "previous-zero"]) {
        const page = await renderPreview(`view=future&plan=pro&theme=${theme}&state=${state}`);
        assert.match(page, /data-future-analytics="true"/);
        assert.doesNotMatch(page, /data-current-analytics|NaN|Infinity/);
        if (["loading", "error", "access"].includes(state)) {
          assert.doesNotMatch(page, /data-kpi=|id="futureContent"|¥2,861,000/);
          assert.match(page, state === "loading" ? /aria-busy="true"/ : /role="alert"/);
        } else if (state === "empty") assert.match(page, /対象期間の支出はありません/);
        else assert.match(page, state === "unavailable" ? /比較元未取得/ : /前月の支出なし/);
        const current = await renderPreview(`view=current&theme=${theme}&state=${state}`);
        assert.match(current, /data-current-analytics="true"/);
        assert.doesNotMatch(current, /data-future-analytics|モックの表示状態を確認|¥2,861,000|data-kpi=/);
      }
    }
    globalThis.window.location.search="";
    const home=await server.ssrLoadModule("/src/pages/HomePage/monthlyOverview/HomeMonthlyOverview.tsx");
    assert.doesNotMatch(await renderActual(home.HomeMonthlyOverview,"/",false),/分析を見る|href="\/analytics"/);
  }finally{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;}
}finally{await server.close();}
const css=readFileSync(resolve(root,base + "analyticsV4.css"),"utf8");
assert.match(css,/\.f-chart svg\{width:100%;height:auto/);
assert.match(css,/:where\(\[data-analytics-v4\]\)/);
assert.match(css,/--page:var\(--color-background-page\)/);
assert.doesNotMatch(css,/--(?:page|card|text|muted|green):#/);
assert.doesNotMatch(css,/animation:|transition:/);
// New CSS may never style Current, the shared sidebar or production through a bare rule.
const futureCss = readFileSync(resolve(root, base + "analyticsFutureTypography.css"), "utf8");
postcss.parse(futureCss).walkRules(rule => {
  for (const selector of rule.selectors) assert.ok(selector.startsWith(":where([data-analytics-v4]) .main:has([data-future-analytics])"), selector);
});
const tabCss=postcss.parse(futureCss);
const tabDeclarations=selector=>{
 const result={};tabCss.walkRules(rule=>{if(rule.selector.endsWith(selector))rule.walkDecls(decl=>{result[decl.prop]=decl.value;});});return result;
};
assert.deepEqual(tabDeclarations(' .future-tab-indicator'),{position:'absolute',left:'0',right:'0',bottom:'-2px',height:'2px',background:'var(--green)','pointer-events':'none'});
assert.equal(tabDeclarations(' .future-tabs button')['position'],'relative');
assert.equal(tabDeclarations(' .future-tabs button[aria-selected=true]')['border-bottom-color'],'transparent');
assert.match(css,/button:focus-visible/,'existing native button focus outline remains');
// Requested width envelopes, based on existing shell/card paddings.
const futureTree=postcss.parse(futureCss);
const activeRule=(rule,width)=>{for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==="atrule"&&parent.name==="media"){
  const max=parent.params.match(/max-width:\s*(\d+)px/),min=parent.params.match(/min-width:\s*(\d+)px/);
  if(max&&width>Number(max[1])||min&&width<Number(min[1]))return false;
}return true;};
function layoutDeclaration(predicate,property,width){let found;futureTree.walkRules(rule=>{if(activeRule(rule,width)&&predicate(rule.selector))rule.walkDecls(property,decl=>{found=decl.value;});});return found;}
for(const [width,available] of [[375,301],[768,494],[1116,790],[1536,1164]]){
  const twoColumn=width>1100,legendWidth=available-(twoColumn?Math.max(300,Math.min(320,width*.27))+18:0);
  const donutColumns=layoutDeclaration(selector=>selector.endsWith(" .current-category-layout"),"grid-template-columns",width);
  assert.equal(donutColumns,twoColumn?"clamp(300px,27vw,320px) minmax(0,1fr)":"minmax(0,1fr)");
  if(width>=769){
    assert.equal(layoutDeclaration(selector=>selector.includes(".current-category-layout :is(.f-rank-head"),"grid-template-columns",width),"minmax(100px,1fr) minmax(80px,1.25fr) minmax(140px,max-content) 65px");
    assert.ok(100+80+140+65+3*10<=legendWidth,`${width}: four columns fit the Pro legend`);
  }else{
    assert.equal(layoutDeclaration(selector=>selector.includes(".f-donut-legend .f-rank-row, .delta-row"),"grid-template-columns",width),"minmax(0,1fr) max-content");
    assert.ok(140+65+12<=legendWidth,`${width}: amount/percentage envelopes fit stacked rows`);
    assert.ok(250<=available,`${width}: the existing donut fits`);
  }
}
const linkedCss=postcss.parse(readFileSync(resolve(root,base,"analyticsLinkedCategories.css"),"utf8"));
linkedCss.walkRules(rule=>assert.ok(rule.selector.startsWith(":where([data-analytics-v4]) .main:has(:is([data-future-analytics],[data-current-analytics])) "),"linked styling reaches only opted-in Current/Future owners"));
let centerPassThrough=false;
linkedCss.walkRules(rule=>{if(rule.selector.endsWith(" .f-donut-center"))rule.walkDecls("pointer-events",decl=>{centerPassThrough=decl.value === "none";});});
assert.equal(centerPassThrough,true,"full-ring center overlay must not intercept pointer input");
const linkedDeclaration=(selector,property)=>{let value;linkedCss.walkRules(rule=>{if(rule.selector === ":where([data-analytics-v4]) .main:has(:is([data-future-analytics],[data-current-analytics])) [data-linked-categories]"+selector)rule.walkDecls(property,decl=>{value=decl.value;});});return value;};
assert.equal(linkedDeclaration(" .linked-donut-hit:focus","outline"),"none","only native SVG outline is suppressed");
assert.equal(linkedDeclaration(' .f-rank-row[role="button"]:focus-visible',"outline"),"2px solid var(--text)","row keyboard outline remains visible");
assert.equal(linkedDeclaration(" .linked-donut-focus","opacity"),"0");
assert.equal(linkedDeclaration(" .linked-donut-arc:has(> .linked-donut-hit:focus-visible) .linked-donut-focus","opacity"),"1","replacement keyboard focus follows the SVG arc");
assert.equal(linkedDeclaration(" .linked-donut-visual circle","stroke-width"),"var(--linked-arc-width,20)","animated width overrides the existing circle CSS, rather than competing as an attribute");
assert.equal(linkedDeclaration(" .linked-donut-exact","clip-path"),"inset(50%)");

assert.equal(linkedDeclaration(" .linked-category-selection","border"),"2px solid var(--green)");
assert.equal(linkedDeclaration(" .linked-category-selection","border-radius"),"12px");
assert.equal(linkedDeclaration(' .f-rank-row[role="button"][aria-pressed="true"]',"background"),"var(--tint)");
assert.equal(linkedDeclaration(' .f-rank-row[role="button"]:hover',"background"),"var(--surface)");
let chipSize;linkedCss.walkRules(rule=>{if(rule.selector.endsWith(' .f-rank-row .f-rank-name .swatch'))rule.walkDecls('width',decl=>chipSize=decl.value);});assert.equal(chipSize,'28px');
for(const total of [false,true]){
 const rank=renderToStaticMarkup(React.createElement(charts.Rank,{rows:analysis.categories,total:analysis.total,donut:total,combined:total}));
 assert.doesNotMatch(rank,/f-rank-head/);assert.match(rank,/支出金額/);assert.match(rank,/構成比/);
}
linkedCss.walkDecls(decl=>assert.doesNotMatch(decl.prop,/^(?:font|grid|--)/,"reuse established type/layout/tokens"));
const productionCss = readdirSync(assets).filter(n => n.endsWith(".css")).map(n => readFileSync(resolve(assets, n), "utf8")).join("\n");
assert.doesNotMatch(productionCss, /data-future-analytics/);

// Conservative text envelopes in SVG units; actual font/layout still needs visual review.
function chartGeometry(chart) {
  const svg = chart.match(/<svg[^>]+viewBox="0 0 ([0-9]+) 280"[\s\S]*?<\/svg>/);
  const labels = [...svg[0].matchAll(/<text\b([^>]*)>([^<]+)<\/text>/g)].filter(([,attrs]) => /class="number-label"/.test(attrs)).map(([, attrs, text]) => {
    const attribute = name => { const match = attrs.match(new RegExp(`(?:^| )${name}="([^"\\s]+)"`)); assert.ok(match, `missing ${name}`); return match[1]; };
    const x = Number(attribute("x")), y = Number(attribute("y")), anchor = attribute("text-anchor");
    assert.ok(Number.isFinite(x) && Number.isFinite(y)); assert.ok(["start","middle","end"].includes(anchor));
    const width = text.length * 10, offset = anchor === "end" ? width : anchor === "middle" ? width / 2 : 0;
    return { x, y, text, start: x - offset, end: x - offset + width };
  });
  const ticks = [...svg[0].matchAll(/<text x="([0-9.]+)" y="([0-9.]+)" text-anchor="end">([^<]+)</g)].map(([, x, y, text]) => ({ x: Number(x), y: Number(y), text }));
  return { width: Number(svg[1]), labels, ticks };
}
const renderChart = (labels, values, counts = false, readable = true) => renderToStaticMarkup(React.createElement(charts.Chart, { readable, series: [{ id: "test", name: "test", values }], labels, counts }));
const checkLabelBounds = chart => {
  const geometry = chartGeometry(chart);
  for (const [i, label] of geometry.labels.entries()) {
    assert.ok(label.start >= 12 && label.end <= geometry.width - 12, "all value labels stay inside the SVG");
    assert.ok(label.start >= geometry.ticks[0].x + 12, "value labels clear the Y-axis text, even at the same height");
    for(const other of geometry.labels.slice(0,i)) assert.ok(label.start >= other.end+8 || label.end+8 <= other.start || Math.abs(label.y-other.y)>=24,"labels have horizontal or vertical clearance");
  }
  return geometry;
};
for (const [labels, values, counts] of [
  [["2026-10"], [Number.MAX_SAFE_INTEGER], false],
  [["2026-10"], [0], true],
  [["2026-09", "2026-10"], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER], false],
  [["2026-08", "2026-09", "2026-10"], [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER], false],
  [long.monthlyTrend.map(t => t.month), long.monthlyTrend.map(t => t.totalExpense), false],
]) {
  const chart = renderChart(labels, values, counts);
  assert.equal(checkLabelBounds(chart).labels.length, labels.length);
  for (const label of labels) assert.ok(chart.includes(charts.month(label)));
}
// Both Current and Future geometry: edge labels, repeated small values and
// long JPY strings, preserving the SVG/scroll domain rather than changing type.
let visibilityCases=0;
for(const readable of [false,true])for(const length of [1,6,12,24])for(const value of [0,1,1100,Number.MAX_SAFE_INTEGER])for(const pattern of ['same','near']){
 const labels=Array.from({length},(_,i)=>future.monthAt(model.monthIndex('2024-11')+i));
 const values=labels.map((_,i)=>pattern==='same'?value:i%3===0?value:Math.max(0,value-1));
 const geometry=checkLabelBounds(renderChart(labels,values,false,readable));
 assert.equal(geometry.labels.length,length);visibilityCases++;
}
console.log(`Analytics visibility: ${visibilityCases} Current/Future edge/equal/near/zero/large-value label envelopes PASS (estimated glyph bounds; browser font paint unverified).`);
const living = future.futureAnalysis(initial, "living", "normal");
const livingChart = renderChart(living.labels, living.trend.map(t => t.amount));
const livingGeometry = checkLabelBounds(livingChart);
assert.equal(livingGeometry.labels[0].text, "¥244,500");
assert.deepEqual(livingGeometry.ticks.map(t => t.text), ["0", "150,000", "300,000", "450,000"], "unchanged living axis scale");
assert.equal(livingGeometry.labels[0].start, 90);
assert.equal(livingGeometry.ticks[2].x, 75, "15-unit horizontal separation from the reported conflicting Y tick");

// Existing shell/card paddings leave these plot widths at the requested PC viewports.
const pcPlotWidths = [1536 - 248 - 16 - 56 - 50 - 2, 1116 - 220 - 16 - 44 - 44 - 2];
for (const tab of ["all", "utilities", "living", "subscriptions"]) {
  const a = future.futureAnalysis(initial, tab, "normal");
  const chart = renderChart(a.labels, a.trend.map(t => t.amount));
  const geometry = checkLabelBounds(chart);
  const minWidth = Number(chart.match(/min-width:([0-9]+)px/)[1]);
  assert.equal(minWidth, geometry.width, "minimum width matches the drawing width");
  for (const available of pcPlotWidths) assert.ok(minWidth <= available, `${tab}: six months fit the PC plot`);
  assert.ok(minWidth > 320, "mobile retains local scrolling without shrinking type");
}
for (const months of [12, 24]) {
  const a = future.futureAnalysis({ ...initial, startMonth: months === 12 ? "2025-11" : "2024-11" }, "living", "normal");
  const chart = renderChart(a.labels, a.trend.map(t => t.amount));
  const geometry = checkLabelBounds(chart);
  assert.equal(geometry.labels.length, months, "keep every monthly value and point");
  assert.ok(pcPlotWidths.every(available => geometry.width > available), `${months} months retain necessary scrolling`);
}
const currentGeometry = chartGeometry(renderChart(living.labels, living.trend.map(t => t.amount), false, false));
assert.equal(currentGeometry.width, 740);
assert.equal(currentGeometry.labels[0].x, 80);
assert.equal(currentGeometry.labels[0].start, 80, "Current first label faces inward clear of the axis");
assert.equal(currentGeometry.ticks[0].x, 65);
assert.equal(currentGeometry.labels.at(-1).end, 680);

// Reuse compact presentation; numeric semantics and comparison notes are unchanged.
for (const comparison of [
  { current: 110, previous: 100, difference: 10, rate: "10.00" },
  { current: 90, previous: 100, difference: -10, rate: "-10.00" },
  { current: 100, previous: 100, difference: 0, rate: "0.00" },
  { current: 100, previous: 0, difference: 100, rate: null },
  { current: 0, previous: 0, difference: 0, rate: null },
  { current: 100, previous: null, difference: null, rate: null },
]) {
  const props = { comparison, end: "2026-10", prior: "2026-09" };
  const compact = renderToStaticMarkup(React.createElement(charts.ComparisonMetric, { ...props, compact: true }));
  const expanded = renderToStaticMarkup(React.createElement(charts.ComparisonMetric, props));
  assert.doesNotMatch(compact, /増加|減少|変化なし|NaN|Infinity/);
  assert.equal(compact.slice(compact.indexOf('<div class="f-kpi-note"')), expanded.slice(expanded.indexOf('<div class="f-kpi-note"')), "retain all comparison explanations");
  if (comparison.rate !== null) assert.ok(compact.includes(comparison.difference > 0 ? "↑ <span>+10.00%" : comparison.difference < 0 ? "↓ <span>−10.00%" : "→ <span>0.00%"));
  else assert.match(compact, comparison.previous === null ? /比較不可/ : comparison.current === 0 ? /両月の支出なし/ : /比較率 —/);
}

// Switching a non-ready Future view back to Current removes the Future marker.
const switchDemo = harness(base + "DedicatedAnalyticsDemo.tsx");
const switchTree = () => switchDemo("default", { showControls: true });
const heading = () => find(switchTree(), n => n.type?.name === "AnalyticsHeading");
const setMode = value => find(switchTree(), n => n.type?.name === "Segmented" && n.props.label === "画面案").props.onChange(value);
setMode("future");
find(switchTree(), n => n.type === "select").props.onChange({ target: { value: "loading" } });
assert.equal(heading().props.future, true);
assert.equal(heading().props.current, false);
const previousDocument = globalThis.document;
let focused = 0;
try {
  globalThis.document = { querySelector: selector => { assert.equal(selector, ".state-preview summary"); return { focus() { focused++; } }; } };
  find(switchTree(), n => n.type?.name === "DedicatedAnalytics").props.onFinishLoading();
  assert.equal(focused, 1, "recovery requests focus on the state disclosure");
} finally {
  if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
}
assert.ok(find(switchTree(), n => n.type?.name === "AnalyticsFuturePreview"));
setMode("current");
assert.equal(heading().props.future, false);
assert.equal(heading().props.current, true);

// Module provenance is stronger than looking for library names in minified code.
const previousNodeEnv = process.env.NODE_ENV;
let production;
try {
  process.env.NODE_ENV = "production";
  production = await build({ root, logLevel: "silent", build: { write: false } });
} finally {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
}
const outputs = (Array.isArray(production) ? production : [production]).flatMap(result => result.output);
for (const output of outputs.filter(item => item.type === "asset" && item.fileName.endsWith(".css"))) {
  assert.doesNotMatch(String(output.source), /chart-point-badge|chart-point-hit|chart-area-opacity|linked-category-selection|linked-donut-hit|data-linked-categories|analytics-disclosure|analytics-card-body|analytics-filter-summary|chart-month-list|chart-month-details|data-chart-mode/, "no DEV chart interaction/responsive content CSS in production");
}
let productionModules = 0;
for (const output of outputs.filter(item => item.type === "chunk")) {
  assert.equal(output.code, readFileSync(resolve(root, "dist", output.fileName), "utf8"), "inspect the same chunks as the normal production build");
  for (const id of Object.keys(output.modules)) {
    productionModules++;
    assert.doesNotMatch(id, /node_modules\/(?:motion(?:-dom|-utils)?|framer-motion)\//, "no Motion runtime in any production chunk");
    assert.doesNotMatch(id, /(?:AnalyticsLinkedCategories|analyticsLinkedCategories|AnalyticsV4Charts|AnalyticsMotionPreview|AnalyticsChartInteraction|analyticsChartInteraction|DedicatedAnalytics(?:Demo|Current)?|[Aa]nalyticsFuturePreview|dedicatedAnalyticsDemo(?:Data|Expenses)|useAnalyticsDisclosure|analyticsResponsiveContent|useAnalyticsChartViewport|AnalyticsMonthPicker|AnalyticsMonthComparison)/,
      "no DEV Analytics charts, fixtures or contracts in production");
  }
}
console.log(`Production provenance: ${productionModules} module entries checked; Motion/DEV Analytics modules absent; emitted JS matches dist.`);

console.log("Free category unification across Basic/Pro + retired Motion preview query ignored + 375/768/1116/1536 CSS envelopes PASS; native layout/paint unverified.");
console.log("Future typography: 16 normal + 8 chart variants SSR, 12 Future state/theme renders, scope/recovery and chart-gutter regressions PASS. Browser layout/interaction remain unverified.");
console.log("Dedicated Analytics: ledger hash, exact money/conservation, bounds, comparisons, access clearing, v4 SVG, Future subsets and production isolation PASS. Screenshot evidence is separate.");
