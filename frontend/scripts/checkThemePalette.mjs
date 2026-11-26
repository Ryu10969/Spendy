import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import postcss from 'postcss';

// Defined CSS colors only: no browser paint, image sampling or full-site WCAG claim.
const root=fileURLToPath(new URL('../',import.meta.url));
const read=file=>readFileSync(root+file,'utf8');
const tree=postcss.parse(read('src/styles/tokens.css'));
const light={},dark={};
tree.walkRules(rule=>{const target=rule.selector===':root'?light:rule.selector===':root[data-theme="dark"]'?dark:null;if(target)rule.walkDecls(d=>target[d.prop]=d.value);});
const palettes={light,dark:{...light,...dark}};
function value(name,palette,path=[]){
 assert.ok(!path.includes(name),'no token cycle: '+name);assert.ok(name in palette,'defined token: '+name);
 return palette[name].replace(/var\((--[\w-]+)\)/g,(_,next)=>value(next,palette,[...path,name]));
}
function luminance(hex){
 assert.match(hex,/^#[\da-f]{6}$/i,'audit only resolved opaque sRGB colors');
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);
 return c[0]*.2126+c[1]*.7152+c[2]*.0722;
}
function contrast(a,b){const [low,high]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (high+.05)/(low+.05);}
const aliases={};
postcss.parse(read('src/pages/AnalyticsPage/analyticsV4.css')).walkRules(rule=>{
 if(rule.selector==='[data-analytics-v4]')rule.walkDecls(d=>{if(d.prop.startsWith('--')){assert.match(d.value,/^var\(--color-[\w-]+\)$/,'Analytics colors are semantic aliases');aliases[d.prop]=d.value;}});
});
assert.equal(existsSync(root+'src/pages/HomePage/HomeShell.module.css'),false,'no route-local Home palette');
assert.doesNotMatch(read('src/components/layout/AppShell.tsx'),/homeStyles/);
const results=[];
for(const [theme,palette] of Object.entries(palettes)){
 const rows=[];
 const test=(fg,bg,min,kind)=>{
  const foreground=value('--color-'+fg,palette),background=value('--color-'+bg,palette),ratio=contrast(foreground,background);
  rows.push({kind,fg,bg,foreground,background,ratio});
  assert.ok(ratio>=min,`${theme}: ${fg} / ${bg} = ${ratio.toFixed(3)}, requires ${min}`);
 };
 const surfaces=['background-page','background-panel','background-surface','background-elevated','background-input'];
 for(const bg of surfaces){
  for(const fg of ['text-primary','text-secondary','text-muted','action-link','success','warning','text-error','text-danger'])test(fg,bg,4.5,'text');
  for(const fg of ['border-control','border-focus','state-selected-indicator','action-primary','action-primary-hover'])test(fg,bg,3,'UI');
  for(let i=1;i<=8;i++)test('chart-series-'+i,bg,3,'chart');
 }
 // Owner-requested reference green and unchanged yellow: measure separately,
 // without claiming every composition color meets the background threshold.
 assert.equal(value('--color-chart-continuous',palette),'linear-gradient(100deg, #008767, #226349)');
 assert.equal(value('--color-chart-event',palette),'#e6bc58');
 const compositionColors=[...value('--color-chart-continuous',palette).match(/#[\da-f]{6}/gi),value('--color-chart-event',palette)];
 const compositionMinimum=Math.min(...compositionColors.flatMap(fg=>surfaces.map(bg=>contrast(fg,value('--color-'+bg,palette)))));
 for(const fg of ['text-primary','action-link','success'])test(fg,'state-selected-surface',4.5,'text');
 test('text-error','background-error',4.5,'text');test('text-danger','background-error',4.5,'text');
 test('project-event-text','project-event-surface',4.5,'text');test('accent-secondary','accent-secondary-surface',4.5,'text');
 test('text-on-primary','action-primary',4.5,'text');test('text-on-primary','action-primary-hover',4.5,'text');test('text-on-danger','action-danger-fill',4.5,'text');
 for(const [alias,role] of Object.entries({'--page':'background-page','--card':'background-surface','--surface':'background-panel','--text':'text-primary','--muted':'text-secondary','--quiet':'text-muted','--green':'action-link','--negative':'success','--red':'text-error'})){
  assert.equal(value(alias,{...palette,...aliases}),value('--color-'+role,palette),theme+' shared Analytics role '+alias);
 }
 assert.equal(value('--color-background-page',palette),theme==='light'?'#f7f8f5':'#161b1e');
 assert.equal(value('--color-text-primary',palette),theme==='light'?'#202722':'#f4f5ff');
 const minima=Object.fromEntries(['text','UI','chart'].map(kind=>[kind,Number(Math.min(...rows.filter(row=>row.kind===kind).map(row=>row.ratio)).toFixed(3))]));
 results.push({theme,pairs:rows.length,minima,homeComposition:{colors:compositionColors,minimum:Number(compositionMinimum.toFixed(3)),meets3To1:compositionMinimum>=3,excludedFromPassCount:true},disabledTextOnDisabledSurface:Number(contrast(value('--color-state-disabled-text',palette),value('--color-state-disabled-surface',palette)).toFixed(3)),decorativeDividerOnSurface:Number(contrast(value('--color-border-row',palette),value('--color-background-surface',palette)).toFixed(3))});
}
assert.match(read('src/pages/AnalyticsPage/analyticsChartInteraction.css'),/data-direction=increase\]\{color:var\(--red\)/);
assert.match(read('src/pages/AnalyticsPage/analyticsChartInteraction.css'),/data-direction=decrease\]\{color:var\(--negative\)/);
for(const file of ['src/features/projects/components/MemberAvatar.module.css','src/features/projects/components/SettlementCompletionDialog.module.css'])assert.doesNotMatch(read(file),/#[\da-f]{3,8}\b|rgba?\(/i);
for(const [file,selector] of [
 ['src/components/common/SearchInput.module.css','.control'],
 ['src/pages/ProjectCreatePage/ProjectCreatePage.module.css','.input'],
 ['src/pages/ProjectCreatePage/ProjectCreatePage.module.css','.textarea'],
 ['src/features/projects/components/MemberListEditor.module.css','.input'],
 ['src/features/expenses/components/ExpenseDateInput.module.css','.inputRow'],
]){
 let border;postcss.parse(read(file)).walkRules(rule=>{if(rule.selector===selector)rule.walkDecls('border',decl=>border=decl.value);});
 assert.equal(border,'1px solid var(--color-border-control)',file+' uses the audited control-border role');
}
assert.doesNotMatch(read('src/pages/AnalyticsPage/analyticsResponsiveContent.css'),/--color-[\w-]+\s*:/,'calendars/readouts inherit semantic roles without local overrides');
console.log('Theme palette defined-color contrast PASS: '+JSON.stringify(results));
console.log('Normal-text threshold 4.5 also covers the 3:1 large-text target. Home composition colors, disabled controls, decorative dividers/grids, translucent chart areas/shadows and raster assets are not included in the PASS count; composition ratios and threshold results are reported separately. Native/composited browser colors remain unverified.');
