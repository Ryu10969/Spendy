import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';

// Source/CSS structure checks only. Interaction/reconciliation checks live in
// checkAnalyticsLineMotionDom.mjs and run through checkDedicatedAnalytics.mjs.
const base=fileURLToPath(new URL('../src/pages/AnalyticsPage/',import.meta.url));
const css=postcss.parse(readFileSync(base+'analyticsResponsiveContent.css','utf8'));
const scope=':where([data-analytics-v4]) .main:has(:is([data-current-analytics], [data-future-analytics]))';
function declarations(selector,width,sheet=css){
 const result={};
 sheet.walkRules(rule=>{
  if(!rule.selectors.includes(selector))return;
  for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='media'){
   const max=parent.params.match(/max-width:\s*([\d.]+)px/);
   if(max&&width>Number(max[1]))return;
  }
  rule.walkDecls(({prop,value})=>{result[prop]=value;});
 });return result;
}
for(const width of [320,390,430,768,820,1024,1199,1199.98,1200,1280,1536]){
 const compact=width<1200,phone=width<768;
 assert.equal(declarations(scope,width)['min-width'],compact?'0':undefined);
 assert.equal(declarations(scope+' .filter-row',width)['grid-template-columns'],compact?'minmax(0, 1fr)':undefined);
 assert.equal(declarations(scope+' .project-select',width)['flex-wrap'],undefined);
 assert.equal(declarations(scope+' .project-selection-label',width)['white-space'],undefined);
 assert.equal(declarations(':where([data-analytics-v4]) :is(.current-analytics-content, .analytics-card-body, .analytics-card-extra, .analytics-filter-body, .analytics-filter-apply)',width).display,'contents');
 assert.equal(declarations(scope+' .f-kpis',width)['grid-template-columns'],compact?'repeat(2, minmax(0, 1fr))':undefined);
 assert.equal(declarations(scope+' .f-kpis > .f-kpi:first-child',width)['grid-column'],phone?'1 / -1':undefined);
 assert.equal(declarations(scope+' .f-kpis > .f-kpi:nth-child(n+4)',width)['grid-column'],phone?'1 / -1':undefined);
 assert.equal(declarations(scope+' .f-kpis > .f-kpi',width)['grid-column'],compact?'auto':undefined);
 assert.equal(declarations(scope+' .current-category-layout',width)['grid-template-columns'],compact?'minmax(0, 1fr)':undefined);
 assert.equal(declarations(scope+' .f-card .f-rank-name',width)['white-space'],compact?'normal':undefined);
 assert.equal(declarations(scope+' .f-card .f-rank-row > .f-track',width).display,compact?'block':undefined);
 assert.equal(declarations(scope+' .f-card .f-rank-row > .f-track',width)['grid-row'],compact?'3':undefined);
 assert.equal(declarations(scope+' .future-tabs',width)['overflow-x'],compact?'auto':undefined);
 assert.equal(declarations(scope+' .future-tabs',width)['flex-wrap'],compact?'nowrap':undefined);
 assert.equal(declarations(scope+' .future-tabs button',width)['flex'],compact?'0 0 auto':undefined);
 assert.equal(declarations(scope+' .months',width)['grid-template-columns'],width<=430?'minmax(0, 1fr)':phone?'repeat(2, minmax(0, 1fr))':compact?'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))':undefined);
 const monthControls=':where([data-analytics-v4]) .month-field-controls';
 assert.equal(declarations(monthControls,width)['grid-template-columns'],'minmax(0, 1fr) minmax(0, 1fr)');
 const inputs=declarations(':where([data-analytics-v4]) .months .month-field :is(input, select)',width);
 assert.equal(inputs['min-width'],'0');assert.equal(inputs['min-height'],'44px');
 assert.equal(inputs.background,'var(--card)');assert.equal(inputs.color,'var(--text)');
 assert.equal(declarations(monthControls+' :is(input, select):focus-visible',width).outline,'2px solid var(--text)');
 assert.equal(declarations(':where([data-analytics-v4]) .main .months .analytics-filter-apply',width)['grid-column'],compact?'1 / -1':undefined);
 assert.equal(declarations(':where([data-analytics-v4]) .main .chart-scroll[data-chart-mode=overview] svg',width)['min-width'],compact?'0':undefined);
 assert.equal(declarations(':where([data-analytics-v4]) .main .chart-month-controls',width)['grid-template-columns'],compact?'44px minmax(0, 1fr) 44px':undefined);
 assert.equal(declarations(':where([data-analytics-v4]) .main .chart-month-current',width)['min-width'],compact?'0':undefined);
 const panel=declarations(':where([data-analytics-v4]) .main .chart-month-panel',width);
 assert.equal(panel.position,compact?'static':undefined);
 assert.equal(panel['grid-template-columns'],width<360?'minmax(0, 1fr)':compact?'repeat(2, minmax(0, 1fr))':undefined);
 assert.equal(panel['overflow-y'],compact?'auto':undefined);
 assert.equal(panel['max-width'],compact?'100%':undefined);
 assert.equal(declarations(':where([data-analytics-v4]) .main .chart-month-panel button[aria-pressed=true]',width).background,compact?'var(--green)':undefined);
 const living=':where([data-analytics-v4]) .main:has([data-future-analytics]) .living-kpis';
 assert.equal(declarations(living+' > .f-kpi:nth-child(4)',width)['grid-row'],phone?'2':undefined);
 assert.equal(declarations(living+' > .f-kpi:nth-child(3)',width)['grid-row'],phone?'3':undefined);
}
// Resolve the competing rank-row grid declarations in stylesheet order. This
// deliberately models only these selectors, not browser layout or a general CSS engine.
const desktopCss=postcss.parse(readFileSync(base+'analyticsV4.css','utf8'));
// Resolve actual declarations through their media ancestors; a misplaced closing
// brace must change these results even if both breakpoint strings still exist.
assert.equal(declarations(':where([data-analytics-v4]) .project-selection-label',320,desktopCss)['white-space'],'nowrap');
const currentScope=':where([data-analytics-v4]) .main:has([data-current-analytics])';
for(const width of [650,651,768,820,1024,1100,1101,1199,1200]){
 const roles=declarations(currentScope,width,desktopCss);
 assert.equal(roles['--type-page-title'],width<=650?'1.875rem':'2.125rem',`${width}: Current page-title boundary`);
 assert.equal(roles['--type-section-title'],width<=650?'1.3125rem':'1.5rem',`${width}: Current section-title boundary`);
 assert.equal(declarations(currentScope+' h1',width,desktopCss)['font-size'],'var(--type-page-title)');
 assert.equal(declarations(currentScope+' .f-card .card-title',width,desktopCss)['font-size'],'var(--type-section-title)');
 assert.equal(declarations(currentScope.replace('data-current-analytics','data-future-analytics'),width,desktopCss)['--type-page-title'],undefined,'Current roles do not leak into Future');
}
function rankGrid(width,{current=true,category=false,live=false}={}){
 let winner;
 for(const sheet of [desktopCss,css])sheet.walkRules(rule=>{
  for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='media'){
   const max=parent.params.match(/max-width:\s*([\d.]+)px/);if(max&&width>Number(max[1]))return;
   const min=parent.params.match(/min-width:\s*([\d.]+)px/);if(min&&width<Number(min[1]))return;
  }
  for(let selector of rule.selectors){
   selector=selector.replace(':is([data-current-analytics], [data-future-analytics])',current?'[data-current-analytics]':'[data-future-analytics]').replace(':is(.f-rank-row, .delta-row)','.f-rank-row');
   if(!selector.endsWith(' .f-rank-row'))continue;
   if(selector.includes('.current-analytics-content')&&!live)continue;
   if(selector.includes('.f-donut-legend')||selector.includes('.annual-list'))continue;
   if(!current&&selector.includes('[data-current-analytics]'))continue;
   if(selector.includes('.current-category-layout')&&(selector.includes(':not(')?category:!category))continue;
   // :where contributes zero; :has/:not inherit their argument specificity.
   const specificity=(selector.replace(/:where\([^)]*\)/g,'').match(/\.[\w-]+|\[[^\]]+\]/g)??[]).length;
   rule.walkDecls('grid-template-columns',decl=>{
    assert.equal(decl.important,undefined,'rank grids never use !important');
    if(!winner||specificity>=winner.specificity)winner={specificity,value:decl.value};
   });
  }
 });return winner?.value;
}
for(const width of [320,390,430,650,651,768,820,1024,1100,1101,1199,1199.98,1200,1536]){
 assert.equal(rankGrid(width),width<1200?'minmax(0, 1fr) minmax(0, max-content)':'minmax(150px,1fr) minmax(80px,2fr) 140px 65px',`${width}: Current rank cascade`);
 assert.equal(rankGrid(width,{current:false}),width<1200?'minmax(0, 1fr) minmax(0, max-content)':'minmax(140px,1fr) minmax(90px,2fr) 115px 55px',`${width}: Future base rank cascade`);
 assert.equal(rankGrid(width,{category:true}),width<1200?'minmax(0, 1fr) minmax(0, max-content)':'120px minmax(90px,1fr) 125px 65px',`${width}: Current category grid is unchanged`);
 assert.equal(rankGrid(width,{category:true,live:true}),width<1200?'minmax(0, 1fr) minmax(0, max-content)':'minmax(0, 1fr) minmax(0, 1fr) minmax(0, max-content) minmax(0, max-content)',`${width}: live Current category columns can shrink`);
}
css.walkRules(rule=>{
 assert.ok(rule.selector.startsWith(':where([data-analytics-v4])'),'scope all rules to Analytics');
 const properties=[];rule.walkDecls(d=>{properties.push(d.prop);assert.doesNotMatch(d.value,/#[\da-f]{3,8}\b/i);});
 const media=[];for(let p=rule.parent;p;p=p.parent)if(p.type==='atrule')media.push(p.params);
 if(!media.length&&!rule.selector.includes('.month-field'))assert.ok(properties.every(p=>p==='display'),'PC wrapper rules only change box generation outside the month fields');
 assert.ok(!properties.some(p=>/animation|transition|transform|z-index/.test(p)),'no new motion or navigation layer');
 assert.ok(!properties.includes('overflow-x')||rule.selector.endsWith('.future-tabs'),'page overflow is resolved by reflow');
});
const charts=readFileSync(base+'AnalyticsV4Charts.tsx','utf8');
const picker=readFileSync(base+'AnalyticsMonthPicker.tsx','utf8');
assert.doesNotMatch(charts,/<select\b/);assert.doesNotMatch(picker,/<select\b|createPortal|role="(?:listbox|dialog|option)"/);
assert.match(picker,/aria-expanded=\{open\}/);assert.match(picker,/aria-controls=\{panelId\}/);assert.match(picker,/role="group"/);
assert.match(picker,/aria-pressed=\{month.value === value\}/);assert.match(picker,/trigger.current\?\.focus/);
assert.match(picker,/event.key === "Escape"/);
assert.match(charts,/className="analytics-card-body"[^>]*hidden=\{!disclosure.expanded\}>\{children\}/,'preserve children while hidden');
assert.doesNotMatch(charts,/disclosure.expanded\s*\?\s*children/);
assert.match(charts,/style=\{overview \? undefined : \{minWidth:width\}\}/);
assert.match(charts,/showValues=\{!overview\}/);
assert.match(charts,/chart-month-list" role="list"/);assert.match(charts,/aria-live="polite"/);
assert.match(charts,/viewport.compact \? <ol[\s\S]*: <DataTable/,'only monthly numeric output changes representation');
assert.doesNotMatch(charts.slice(charts.indexOf('export function DataTable'),charts.indexOf('// These are the v4 SVG')),/viewport|compact|chart-month-list/,'generic DataTable stays unchanged');
const filters=readFileSync(base+'AnalyticsFilters.tsx','utf8');
assert.doesNotMatch(filters,/ExpenseDateInput|カレンダー|type="(?:date|month)"/);
assert.match(filters,/inputMode="numeric"/);assert.match(filters,/<select/);
const homeCss=postcss.parse(readFileSync(base+'../HomePage/monthlyOverview/MonthlyOverview.module.css','utf8'));
for(const [direction,color]of [['increase','var(--color-text-error)'],['decrease','var(--color-success)']]){
 let found;homeCss.walkRules(rule=>{if(rule.selector===`.comparison[data-direction="${direction}"]`)rule.walkDecls('color',decl=>found=decl.value);});assert.equal(found,color);
}
assert.doesNotMatch(filters,/入力期間：/);assert.match(filters,/applied.projectTokens.length/);assert.match(filters,/未適用の変更あり/);
assert.match(filters,/disclosure.expand\(\); setOpen\(true\)/,'reselection reveals filters before picker focus');
assert.doesNotMatch(filters,/表示中の条件を適用済み|analytics-period-help|支払日のデモ収録範囲/);
assert.match(filters,/role="status"/);assert.match(filters,/role="alert"/);assert.match(filters,/aria-describedby="filterError"/);
for(const width of [320,390,430,768,820,1024,1199,1200,1536]){
 const status=declarations(':where([data-analytics-v4]) .analytics-filter-status',width);
 assert.equal(status.position,width<1200?'absolute':undefined);
 assert.equal(status['clip-path'],width<1200?'inset(50%)':undefined);
 assert.equal(status.width,width<1200?'1px':undefined);
}
const hook=readFileSync(base+'useAnalyticsDisclosure.ts','utf8');
assert.match(hook,/useState\(true\)/);assert.match(hook,/!compact \|\| open/);
assert.match(hook,/focus\(\{ preventScroll: true \}\)/);assert.match(hook,/removeEventListener/);
const demo=readFileSync(base+'DedicatedAnalyticsDemo.tsx','utf8');
assert.match(demo,/import "\.\/analyticsResponsiveContent.css"/);
const page=readFileSync(base+'AnalyticsPage.tsx','utf8');
assert.match(page,/import.meta.env.DEV \? lazy/);assert.doesNotMatch(page,/analyticsResponsiveContent|useAnalyticsDisclosure/);
const shell=readFileSync(base+'../../components/layout/AppShell.module.css','utf8');
assert.match(shell,/padding:[^;]*calc\(var\(--responsive-nav-reserve, 8rem\) \+ env\(safe-area-inset-bottom\)\)/);
assert.match(shell,/safe-area-inset-left/);assert.match(shell,/safe-area-inset-right/);
console.log('Responsive Analytics source/CSS structure and rank specificity cascade: 320/390/430/650/651/768/820/1024/1100/1101/1199/1199.98/1200/1280/1536, Current 650px-only title roles, shared Light/Dark tokens, KPI placement, long-name wrapping, rank bars, local tab scroll, PC display-contents, retained children/focus/reselection and DEV-only stylesheet PASS. Native layout/200% text zoom/Safe Area unverified.');
