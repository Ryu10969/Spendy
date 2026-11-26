import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import postcss from 'postcss';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import {renderToStaticMarkup} from 'react-dom/server';
const root=fileURLToPath(new URL('../',import.meta.url));
const navFile='src/components/navigation/ResponsiveNavigation.tsx';
const Link=({to,children,...props})=>React.createElement('a',{...props,href:to},children);
let currentPath='/';
let sharedTheme='light';
let currentOutlet=null;
function load(file,react=React){
 const cache=new Map();
 function read(path){
  if(cache.has(path))return cache.get(path);
  const source=readFileSync(path,'utf8').replaceAll('import.meta.env.DEV','false');
  const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};cache.set(path,module.exports);
  new Function('exports','require',output)(module.exports,name=>{
   if(name.endsWith('/ThemeProvider'))return {useTheme:()=>({theme:sharedTheme,toggleTheme(){}})};
   if(name==='react')return react;
   if(name==='react/jsx-runtime')return jsx;
   if(name==='react-dom')return {createPortal:children=>children,flushSync:cb=>cb()};
   if(name==='react-router-dom')return {Link,Outlet:()=>currentOutlet,useLocation:()=>({pathname:currentPath}),useNavigate:()=>()=>{},useMatch:()=>null};
   if(name==='@tanstack/react-query')return {useQuery:()=>({isPending:true})};
   if(name.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
   if(name.endsWith('.css'))return {};
   if(name.endsWith('.png'))return {__esModule:true,default:'/logo.png'};
   assert.ok(name.startsWith('.'),name);
   const base=resolve(dirname(path),name),target=[base,base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return read(target);
  });return module.exports;
 }return read(resolve(root,file));
}
const walk=n=>[n,...React.Children.toArray(n?.props?.children).flatMap(walk)];
const real=load(navFile);
for(const active of ['home','archives','analytics'])for(const theme of ['light','dark']){
 const html=renderToStaticMarkup(React.createElement(real.ResponsiveNavigation,{active,theme,onToggleTheme(){}}));
 assert.match(html,/aria-label="モバイルナビゲーション"/);assert.match(html,new RegExp(`data-nav-theme="${theme}"`));
 assert.equal((html.match(/aria-current="page"/g)??[]).length,1);
 assert.match(html,new RegExp(`aria-current="page" href="${active==='home'?'/':'/'+active}"`));
 assert.match(html,/aria-haspopup="dialog"/);assert.match(html,/aria-expanded="false"/);
 assert.match(html,/アカウント（準備中）/);assert.doesNotMatch(html,/href="\/(?:search|account|expenses\/new)"/);
 assert.deepEqual([...html.matchAll(/<span>([^<]*)<\/span>/g)].map(match=>match[1]),['ホーム','アーカイブ','分析','アカウント']);
 assert.match(html,/<small>準備中<\/small>/);
 assert.match(html,/href="\/archives"/);assert.doesNotMatch(html,/検索|home-search-panel/);
 assert.doesNotMatch(html,/role="dialog"/);
}
const home=load('src/components/layout/AppShell.tsx');
assert.match(renderToStaticMarkup(React.createElement(home.AppShell)),/data-responsive-navigation/);
for(const path of ['/','/archives','/archives/'])for(const theme of ['light','dark']){
 currentPath=path;
 sharedTheme=theme;
 const themed=load('src/components/layout/AppShell.tsx');
 const html=renderToStaticMarkup(React.createElement(themed.AppShell));
 assert.ok(html.includes('data-home-theme="'+theme+'"'));
 const bottom=html.match(/<nav[^>]*aria-label="モバイルナビゲーション"[\s\S]*?<\/nav>/)[0];
 assert.equal((bottom.match(/aria-current="page"/g)??[]).length,1);
 assert.ok(bottom.includes('aria-current="page" href="'+(path==='/'?'/':'/archives')+'"'));
 const sidebar=html.match(/<aside[\s\S]*?<\/aside>/)[0];
 assert.equal((sidebar.match(/aria-current="page"/g)??[]).length,path==='/'?1:0);
 assert.match(sidebar,/href="\/analytics"/);assert.doesNotMatch(sidebar,/href="\/archives"/);
}
currentPath='/analytics';
sharedTheme='light';
const analytics=load('src/pages/AnalyticsPage/AnalyticsPage.tsx');
currentOutlet=React.createElement(analytics.AnalyticsPage);
const production=renderToStaticMarkup(React.createElement(home.AppShell));
assert.match(production,/専用Analyticsはまだ利用できません/);assert.match(production,/data-responsive-navigation/);
assert.doesNotMatch(production,/data-linked-categories|DESIGN PREVIEW|FUTURE CONCEPT|data-kpi=/);
const analyticsSidebar=production.match(/<aside[\s\S]*?<\/aside>/)[0];
assert.match(analyticsSidebar,/aria-current="page" href="\/analytics"/);
assert.equal((analyticsSidebar.match(/aria-current="page"/g)??[]).length,1);
for(const label of ['ホーム','支出分析','プロジェクト作成','レシート読み取り','共有リンクの作成','アカウント'])assert.ok(analyticsSidebar.includes(label));
assert.doesNotMatch(production,/side-foot|日々の支出を、いっしょに。|official-brand|topbar/);
assert.doesNotMatch(readFileSync(resolve(root,'src/pages/AnalyticsPage/analyticsV4.css'),'utf8'),/\.(?:side-foot|sidebar|topbar|official-brand|nav-item)\b/);
currentPath='/';currentOutlet=null;
// Component/effect model; never a browser or a native event/paint assertion.
function harness(file=navFile){
 let index=0;const slots=[],pending=[];
 const react={...React,useId:()=>':responsive-test:',useRef:initial=>{const i=index++;return slots[i]??=( {current:initial});},useState:initial=>{const i=index++;slots[i]??={value:typeof initial==='function'?initial():initial};return [slots[i].value,next=>{slots[i].value=typeof next==='function'?next(slots[i].value):next;}];}};
 const effect=(callback,deps)=>{const i=index++,previous=slots[i];if(!previous||!deps||deps.some((v,j)=>!Object.is(v,previous.deps[j]))){slots[i]={deps,cleanup:previous?.cleanup};pending.push(()=>{slots[i].cleanup?.();slots[i].cleanup=callback();});}};
 react.useEffect=effect;react.useLayoutEffect=effect;
 const module=load(file,react);
 return {module,run(name,props){index=0;return module[name](props);},flush(){while(pending.length)pending.shift()();},dispose(){slots.forEach(slot=>slot?.cleanup?.());}};
}
class Element {
 constructor(name){this.name=name;this.inert=false;this.isConnected=true;this.style={values:new Map(),setProperty(k,v){this.values.set(k,v);}};}
 focus(){assert.equal(app.inert,false,'background inert must clear before trigger focus restoration');doc.activeElement=this;}
}
const trigger=new Element('trigger'),app=new Element('app'),alreadyInert=new Element('already inert');alreadyInert.inert=true;
const main=new Element('main');
const first=new Element('new project'),last=new Element('cancel'),overlay=new Element('overlay'),dialog=new Element('dialog');
// Dialog focus is allowed while its body siblings are inert.
dialog.focus=()=>{doc.activeElement=dialog;};first.focus=()=>{doc.activeElement=first;};last.focus=()=>{doc.activeElement=last;};
dialog.querySelectorAll=()=>[first,last];
const listeners=new Map();
const doc={activeElement:trigger,body:{style:{overflow:'auto'},children:[app,alreadyInert,overlay]},getElementById:id=>id==='trigger'?trigger:id==='project-search'?first:id==='main-content'?main:null,addEventListener:(name,cb)=>listeners.set(name,cb),removeEventListener:(name,cb)=>{if(listeners.get(name)===cb)listeners.delete(name);}};
globalThis.HTMLElement=Element;globalThis.document=doc;
let themeColor='light-theme';trigger.closest=()=>({});
const mediaListeners=new Set(),media={matches:true,addEventListener:(_,cb)=>mediaListeners.add(cb),removeEventListener:(_,cb)=>mediaListeners.delete(cb)};
globalThis.window={matchMedia:()=>media,getComputedStyle:()=>({getPropertyValue:name=>`${themeColor}:${name}`})};
let closed=0;
const h=harness(),props={active:'home',theme:'light'};
let tree=h.run('ResponsiveNavigation',props);h.flush();
walk(tree).find(n=>n.props?.['aria-label']==='追加メニュー').props.onClick();tree=h.run('ResponsiveNavigation',props);h.flush();
assert.equal(walk(tree).find(n=>n.props?.['aria-label']==='追加メニュー').props['aria-expanded'],true);
const sheetNode=walk(tree).find(n=>n.type?.name==='QuickAddSheet');assert.ok(sheetNode);
media.matches=false;mediaListeners.forEach(cb=>cb());tree=h.run('ResponsiveNavigation',props);h.flush();assert.ok(!walk(tree).some(n=>n.type?.name==='QuickAddSheet'),'resize to desktop releases sheet');h.dispose();assert.equal(mediaListeners.size,0);
media.matches=true;
const routeNav=harness();let routeTree=routeNav.run('ResponsiveNavigation',props);routeNav.flush();
walk(routeTree).find(n=>n.props?.['aria-label']==='追加メニュー').props.onClick();routeTree=routeNav.run('ResponsiveNavigation',props);routeNav.flush();
assert.ok(walk(routeTree).some(n=>n.type?.name==='QuickAddSheet'));
currentPath='/projects/new';routeNav.run('ResponsiveNavigation',props);routeNav.flush();routeTree=routeNav.run('ResponsiveNavigation',props);
assert.ok(!walk(routeTree).some(n=>n.type?.name==='QuickAddSheet'),'route changes close the persistent Quick Add sheet');routeNav.dispose();currentPath='/';
real.focusHomeProjectSearch();assert.equal(doc.activeElement,first);
for(const focusBody of [false,true]){
 media.matches=true;themeColor='light-theme';
 doc.activeElement=focusBody?doc.body:trigger;closed=0;
 const h=harness(),props={theme:'light',triggerId:'trigger',onClose(){closed++;}};
 const tree=h.run('QuickAddSheet',props),nodes=walk(tree),dialogNode=nodes.find(n=>n.props?.role==='dialog');
 tree.props.ref.current=overlay;dialogNode.props.ref.current=dialog;h.flush();
 assert.equal(app.inert,true);assert.equal(alreadyInert.inert,true);assert.equal(doc.body.style.overflow,'hidden');assert.equal(doc.activeElement,dialog);
 assert.equal(overlay.style.values.get('--nav-surface'),'light-theme:--nav-surface');
 assert.equal(dialogNode.props['aria-modal'],'true');assert.equal(dialogNode.props['aria-label'],'追加メニュー');assert.equal(dialogNode.props['aria-labelledby'],undefined);
 assert.ok(!nodes.some(n=>n.type==='h2'),'Quick Add has no visible heading');
 assert.match(renderToStaticMarkup(tree),/handle/);
 const actions=nodes.filter(n=>n.type==='button'&&n.props.disabled);assert.equal(actions.length,2);
 const labels=actions.map(n=>renderToStaticMarkup(n));for(const label of ['共有リンクを作成','レシートを読み取り'])assert.ok(labels.some(html=>html.includes(label)&&html.includes('準備中')));
 assert.ok(nodes.some(n=>n.type==='button'&&!n.props.disabled&&renderToStaticMarkup(n).includes('支出を追加')));
 assert.equal(nodes.find(n=>n.type===Link).props.to,'/projects/new');
 let prevented=0;doc.activeElement=last;listeners.get('keydown')({key:'Tab',shiftKey:false,preventDefault(){prevented++;}});assert.equal(doc.activeElement,first);
 listeners.get('keydown')({key:'Tab',shiftKey:true,preventDefault(){prevented++;}});assert.equal(doc.activeElement,last);assert.equal(prevented,2);
 themeColor='dark-theme';h.run('QuickAddSheet',{...props,theme:'dark'});h.flush();assert.equal(overlay.style.values.get('--nav-surface'),'dark-theme:--nav-surface');assert.equal(doc.activeElement,last,'theme rerender must not steal focus');
 listeners.get('keydown')({key:'Escape',stopPropagation(){}});assert.equal(closed,1);
 nodes.find(n=>n.props?.className==='cancel').props.onClick();assert.equal(closed,2);
 tree.props.onPointerDown({target:overlay,currentTarget:overlay});assert.equal(closed,3);
 tree.props.onPointerDown({target:dialog,currentTarget:overlay});assert.equal(closed,3);
 nodes.find(n=>n.type===Link).props.onClick();assert.equal(closed,4);
 h.dispose();assert.equal(app.inert,false);assert.equal(alreadyInert.inert,true);assert.equal(doc.body.style.overflow,'auto');assert.equal(doc.activeElement,trigger);assert.equal(listeners.size,0);
}
// Content reserve follows real nav height after wrapping/font or orientation changes.
const reserveValues=new Map(),host={style:{getPropertyValue:k=>reserveValues.get(k)??'',setProperty:(k,v)=>reserveValues.set(k,v),removeProperty:k=>reserveValues.delete(k)}};
let measured=92,resizeCallback,disconnected=false;
globalThis.ResizeObserver=class {constructor(cb){resizeCallback=cb;}observe(){}disconnect(){disconnected=true;}};
media.matches=true;const measuredNav=harness(),measuredTree=measuredNav.run('ResponsiveNavigation',props);
walk(measuredTree).find(n=>n.props?.className==='bar').props.ref.current={closest:()=>host,getBoundingClientRect:()=>({height:measured})};
measuredNav.flush();assert.equal(reserveValues.get('--responsive-nav-reserve'),'116px');
for(const height of [180,260,340]){measured=height;resizeCallback();assert.equal(reserveValues.get('--responsive-nav-reserve'),`${height+24}px`,'reserve follows wrapped/three-row navigation height');}
media.matches=false;mediaListeners.forEach(cb=>cb());assert.equal(reserveValues.size,0);
measuredNav.dispose();assert.equal(reserveValues.size,0);assert.equal(disconnected,true);assert.equal(mediaListeners.size,0);
delete globalThis.ResizeObserver;
function declarations(file,selector,width,containerWidth=Infinity,rootFont=16){
 const result={};postcss.parse(readFileSync(resolve(root,file),'utf8')).walkRules(rule=>{
  if(!rule.selectors?.includes(selector))return;
  for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='media'){
   const max=parent.params.match(/max-width:\s*([\d.]+)px/),min=parent.params.match(/min-width:\s*([\d.]+)px/);
   if(max&&width>+max[1]||min&&width<+min[1])return;
  }
  for(let parent=rule.parent;parent;parent=parent.parent)if(parent.type==='atrule'&&parent.name==='container'){
   const condition=parent.params.match(/^bottom-navigation \(width < max\(([\d.]+)px, calc\(([\d.]+)px \+ ([\d.]+)rem\)\)\)$/);
   assert.ok(condition,'model every navigation container condition');
   if(containerWidth>=Math.max(+condition[1],+condition[2]+condition[3]*rootFont))return;
  }
  rule.walkDecls(decl=>{result[decl.prop]=decl.value;});
 });return result;
}
const css='src/components/navigation/ResponsiveNavigation.module.css',shellCss='src/components/layout/AppShell.module.css',pageCss='src/pages/HomePage/HomePage.module.css';
postcss.parse(readFileSync(resolve(root,css),'utf8')).walkRules(rule=>{
 if(rule.selector.includes('data-nav-theme'))rule.walkDecls(decl=>assert.ok(decl.prop==='color-scheme'||decl.prop.startsWith('--nav-'),'theme-specific navigation rules cannot change dimensions'));
});
for(const width of [320,375,390,393,402,430,440,768,820,1024,1199,1200,1280,1536]){
 const mobile=width<1200;
 assert.equal(declarations('src/styles/globals.css','html',width)['scrollbar-gutter'],'stable');
 assert.equal(declarations(css,'.root',width).display,mobile?'contents':'none');
 const sidebarCss='src/components/navigation/AppSidebar.module.css',headerCss='src/components/navigation/AppHeader.module.css';
 assert.equal(declarations(sidebarCss,'.sidebar',width).display,mobile?'none':'flex');
 assert.equal(declarations(headerCss,'.header .themeToggle',width).display,mobile?undefined:'none');
 assert.equal(declarations(headerCss,'.themeToggle',width).left,'max(16px, env(safe-area-inset-left))');
 assert.equal(declarations(headerCss,'.themeToggle',width).right,undefined);
 assert.equal(declarations(headerCss,'.header',width).height,'calc(var(--home-header-height) + env(safe-area-inset-top))');
 assert.equal(declarations(headerCss,'.header',width)['justify-content'],'center');
 assert.equal(declarations(headerCss,'.logo',width).width,mobile?'min(13rem, 48vw)':'17.5rem');
 assert.equal(declarations(headerCss,'.logo',width)['max-width'],'100%');
 assert.equal(declarations(shellCss,'.shell',width)['--home-header-height'],'4.75rem');
 assert.equal(declarations(shellCss,'.shell',width)['--home-sidebar-width'],'15.5rem');
 assert.equal(declarations(shellCss,'.frame',width).display,mobile?'block':'grid');
 assert.equal(declarations(shellCss,'.frame',width)['grid-template-columns'],mobile?undefined:'var(--home-sidebar-width) minmax(0, 1fr)');
 assert.equal(declarations(sidebarCss,'.sidebar',width).top,'0');
 assert.equal(declarations(sidebarCss,'.sidebar',width).padding,'var(--space-3) var(--space-6) var(--space-6)');
 assert.equal(declarations(css,'.bar',width).bottom,mobile?'calc(8px + env(safe-area-inset-bottom))':undefined);
 assert.equal(declarations(css,'.bar',width).display,mobile?'flex':undefined);
 assert.equal(declarations(css,'.bar',width)['flex-wrap'],mobile?'wrap':undefined);
 const smartphone=width<=767;
 assert.equal(declarations(pageCss,'.header',width).display,smartphone?'none':mobile?'flex':'contents');
 const monthlyCss='src/pages/HomePage/monthlyOverview/MonthlyOverview.module.css';
 assert.equal(declarations(monthlyCss,'.bar',width)['border-radius'],'var(--radius-full)');
 assert.equal(declarations(monthlyCss,'.bar',width).overflow,'hidden');
 assert.equal(declarations(monthlyCss,'.analyticsLink',width).display,undefined);
 const comparison=declarations(monthlyCss,'.comparison',width);
 assert.equal(comparison.display,'inline-flex');
 assert.equal(comparison['align-items'],'center');
 assert.equal(comparison['box-sizing'],'border-box');
 assert.equal(comparison.width,'fit-content');
 assert.equal(comparison['max-width'],'100%');
 assert.equal(comparison.padding,'6px var(--space-3)');
 assert.equal(comparison['border-radius'],'var(--radius-full)');
 assert.equal(comparison.background,'var(--color-background-input)');
 assert.equal(declarations(monthlyCss,'.comparisonText',width)['min-width'],'0');
 assert.equal(declarations(monthlyCss,'.comparisonText',width)['overflow-wrap'],'anywhere');
 assert.equal(declarations(monthlyCss,'.comparisonText strong',width)['font-weight'],'var(--font-weight-bold)');
 assert.equal(declarations(monthlyCss,'.comparison[data-direction="increase"]',width).color,'var(--color-text-error)');
 assert.equal(declarations(monthlyCss,'.comparison[data-direction="increase"]',width).background,'var(--color-background-error)');
 assert.equal(declarations(monthlyCss,'.comparison[data-direction="decrease"]',width).color,'var(--color-success)');
 assert.equal(declarations(monthlyCss,'.comparison[data-direction="decrease"]',width).background,'var(--color-state-selected-surface)');
 assert.equal(declarations(monthlyCss,':global([data-home-theme="dark"]) .comparison[data-direction="decrease"]',width).color,'var(--color-action-link)');
 for(const direction of ['unchanged','unavailable']){
  assert.equal(declarations(monthlyCss,'.comparison[data-direction="'+direction+'"]',width).color,'var(--color-text-secondary)');
 }
 for(const [bar,dot] of [['.continuousBar','.continuousDot'],['.eventBar','.eventDot']]){
  const pcColor=declarations(monthlyCss,bar,1536).background;
  assert.equal(pcColor,bar==='.eventBar'?'var(--color-chart-event)':'var(--color-chart-continuous)','use the shared, theme-aware series roles');
  for(const selector of [bar,dot]){
   assert.equal(declarations(monthlyCss,selector,width).background,pcColor);
   assert.equal(declarations(monthlyCss,':global([data-home-theme="dark"]) '+selector,width).background??pcColor,pcColor);
  }
 }
 if(smartphone){
  assert.equal(declarations(monthlyCss,'.top',width).display,'flex');
  assert.equal(declarations(monthlyCss,'.top',width)['flex-wrap'],'wrap');
  assert.equal(declarations(monthlyCss,'.monthCaption',width)['flex-direction'],'column');
  assert.equal(declarations(monthlyCss,'.mobileCard',width)['border-radius'],'var(--radius-xl)');
  assert.equal(declarations(monthlyCss,'.types',width)['grid-template-columns'],width<360?'minmax(0, 1fr)':'repeat(auto-fit, minmax(min(100%, 9rem), 1fr))');
  assert.equal(declarations(monthlyCss,'.typeHeading',width)['grid-template-columns'],'2.5rem minmax(0, 1fr)');
  assert.equal(declarations(monthlyCss,'.type .comparison',width).margin,'0');
  const homeCard=declarations('src/features/projects/components/ProjectCard.module.css',':global([data-home-page]) .navigation',width);
  assert.equal(homeCard.display,'flex');assert.equal(homeCard['flex-wrap'],'wrap');
  const spending=declarations('src/features/projects/components/ProjectCard.module.css',':global([data-home-page]) .spending',width);
  assert.equal(spending['padding-right'],'2.75rem','reserve the existing delete menu touch target');
 }
 assert.equal(declarations(pageCss,'.projectGrid',width)['grid-template-columns'],mobile?'minmax(0, 1fr)':'repeat(2, minmax(0, 1fr))');
 assert.equal(declarations('src/pages/ArchivesPage/ArchivesPage.module.css','.header',width).display,'grid');
 assert.equal(declarations('src/pages/ArchivesPage/ArchivesPage.module.css','.title',width).position,undefined,'Archives title stays visible on PC too');
 if(mobile){
  assert.equal(declarations(shellCss,'.content',width)['padding'].includes('8rem'),true);
  assert.equal(declarations(pageCss,'.monthlyOverview',width).display,'flex');
  const analyticShell=declarations('src/pages/AnalyticsPage/analyticsV4.css',':where([data-analytics-v4]) .main',width);
  assert.equal(analyticShell.margin,'0','shared grid owns the only sidebar offset');
  assert.equal(analyticShell['min-width'],'0');
  assert.equal(analyticShell['margin-left'],undefined);
  const bar=declarations(css,'.bar',width),item=declarations(css,'.bar a',width);
  assert.equal(bar.left,'max(12px, env(safe-area-inset-left))');
  assert.equal(bar.right,'max(12px, env(safe-area-inset-right))');
  assert.equal(bar['max-width'],'40rem');assert.equal(bar['border-radius'],'32px');
  assert.equal(bar.padding,'8px');assert.equal(bar.gap,'2px');
  assert.equal(bar.container,'bottom-navigation / inline-size');
  assert.equal(bar['padding-inline'],width<=359?'4px':undefined);
  assert.equal(item['font-size'],'var(--font-size-xs)');assert.equal(item['line-height'],'1.2');
  assert.equal(item['letter-spacing'],'0');assert.equal(item['white-space'],'normal');
  assert.equal(item['overflow-wrap'],'anywhere');assert.equal(item['min-height'],'52px');
  assert.equal(item['min-width'],'44px');assert.equal(item.flex,'1 1 0');
  assert.equal(item.overflow,undefined,'labels must not be clipped');assert.equal(item['text-overflow'],undefined);
  assert.equal(declarations(css,'.bar button',width)['white-space'],'normal');
  for(const selector of ['.bar span','.bar small']){
   const label=declarations(css,selector,width);
   assert.equal(label['max-width'],'100%');assert.equal(label['min-width'],'0');
   assert.equal(label['text-align'],'center');assert.equal(label.overflow,undefined);
   assert.equal(label['text-overflow'],undefined);
  }
  assert.equal(declarations(css,'.bar small',width)['font-size'],'var(--font-size-xs)');
  assert.equal(declarations(css,'.bar small',width)['white-space'],'nowrap');
  assert.equal(declarations(css,'.bar small',width)['overflow-wrap'],'normal');
  assert.equal(declarations(css,'.bar small',width)['word-break'],'normal');
  assert.equal(declarations(css,'.bar small',width)['flex-shrink'],'0');
  assert.equal(declarations(css,'.bar .add',width).height,'52px');
  // Static Flex/container/full-width-glyph model, not browser text measurement.
  const font=declarations('src/styles/tokens.css',':root',width)['--font-size-xs'];
  assert.equal(font,'0.75rem');
  assert.equal(declarations(css,'.bar > :nth-child(2)',width)['min-width'],'60px');
  assert.equal(declarations(css,'.bar > :last-child',width)['min-width'],'max(60px, 2.25rem)');
  assert.equal(declarations(css,'.bar > :last-child',width)['flex-grow'],'1.25');
  const labels=['ホーム','アーカイブ','','分析','アカウント'];
  for(const rootFont of [16,24,32])for(const safeArea of [0,24,44])for(const gutter of [0,15])for(const navScrollbar of [0,15]){
   const content=Math.min(40*rootFont,width-2*Math.max(12,safeArea)-gutter)-2-(width<=359?8:16)-navScrollbar;
   const inner=content-8,captionWidth=2.25*rootFont;
   const tracks=[{min:44,flex:1},{min:60,flex:1.25},{min:52,flex:0},{min:44,flex:1},{min:Math.max(60,captionWidth),flex:1.25}];
   const resolved=declarations(css,'.bar a',width,content,rootFont);
   const stacked=resolved.flex==='0 0 calc((100% - 2px) / 2)';
   let sizes;
   if(stacked){
    sizes=[(content-2)/2,(content-2)/2,52,(content-2)/2,(content-2)/2];
    assert.equal(declarations(css,'.bar .add',width,content,rootFont)['margin-inline'],'calc((100% - 52px) / 2)');
    assert.equal(declarations(css,'.bar .add',width,content,rootFont).flex,'0 0 52px');
    assert.ok(sizes[0]+2+sizes[1]<=content+1e-7,'two-item rows fit');
    const plusLeft=(content-52)/2;assert.ok(plusLeft>=0&&plusLeft+52<=content,'plus owns a centered row');
   }else{
    assert.ok(inner>=tracks.reduce((sum,track)=>sum+track.min,0),`${width}/${rootFont}/${safeArea}/${gutter}: five minima fit`);
    let low=0,high=inner;
    for(let step=0;step<60;step++){
     const unit=(low+high)/2;
     if(tracks.reduce((sum,track)=>sum+Math.max(track.min,track.flex*unit),0)>inner)high=unit;else low=unit;
    }
    sizes=tracks.map(track=>Math.max(track.min,track.flex*low));
    assert.ok(sizes.reduce((sum,n)=>sum+n,0)<=inner+1e-7);
   }
   const glyph=.75*rootFont;
   sizes.forEach((size,i)=>{
    assert.ok(size>=44,'each control retains a 44px-wide target');
    assert.ok(size>=glyph,'an enlarged full-width glyph fits without overlapping adjacent controls');
    if(rootFont===16)assert.ok(labels[i].length*glyph<=size,'normal labels retain a single line');
   });
   assert.equal(sizes[2],52,'central plus retains its own fixed track');
   assert.ok('準備中'.length*glyph<=sizes[4],'entire unbroken caption fits at all font sizes');
   if(width===320&&safeArea===24&&gutter===0&&navScrollbar===0){assert.equal(inner,254);assert.ok(stacked,'reviewed Safe Area deficit uses fallback');}
   if(width===375&&safeArea===44&&gutter===15)assert.ok(stacked,'second reviewed deficit uses fallback');
   if(rootFont===16&&safeArea===0&&gutter===0)assert.equal(stacked,false,'approved normal five-item layout');
  }
 }else{
  assert.equal(declarations(shellCss,'.frame',width)['grid-template-columns'],'var(--home-sidebar-width) minmax(0, 1fr)');
 }
}
// Height/reachability model from actual CSS lengths, not browser layout, scrolling
// or focus execution. Both scrollbar policies are checked because native/overlay
// scrollbars can change the container query and therefore the required height.
function length(value,rootFont){
 if(value==='0')return 0;
 const match=value.match(/^([\d.]+)(px|rem)$/);assert.ok(match,'modeled CSS length: '+value);
 return +match[1]*(match[2]==='rem'?rootFont:1);
}
function padding(style,rootFont){
 const parts=style.padding.split(/\s+/).map(part=>length(part,rootFont));
 assert.ok(parts.length<=2,'extend padding model before adding complex shorthands');
 return {block:2*parts[0],inline:2*length(style['padding-inline']??style.padding.split(/\s+/).at(-1),rootFont)};
}
const cappedHeights=new Set();let heightCases=0,overflowCases=0,normalCases=0;
for(const [width,height] of [[320,240],[320,320],[320,480],[375,320],[375,667],[390,844],[393,852],[440,956]]){
 const bar=declarations(css,'.bar',width),item=declarations(css,'.bar a',width),add=declarations(css,'.bar .add',width);
 assert.equal(bar['box-sizing'],'border-box');assert.equal(bar['align-content'],'flex-start');
 assert.equal(bar['overflow-y'],'auto');assert.equal(bar['overflow-x'],undefined,'no hidden horizontal labels');
 assert.equal(bar['overscroll-behavior-y'],'contain');assert.ok(length(bar['scroll-padding-block'],16)>0);
 const maximum=bar['max-height'].match(/^calc\(100dvh - ([\d.]+)px - env\(safe-area-inset-bottom\) - max\(([\d.]+)px, env\(safe-area-inset-top\)\) - var\(--project-expense-action-reserve, 0px\)\)$/);
 const bottom=bar.bottom.match(/^calc\(([\d.]+)px \+ env\(safe-area-inset-bottom\)\)$/);
 const left=bar.left.match(/^max\(([\d.]+)px, env\(safe-area-inset-left\)\)$/);
 assert.ok(maximum&&bottom&&left,'height model follows the actual fixed offsets');assert.equal(+maximum[1],+bottom[1]);
 assert.equal(bar.right,bar.left.replace('inset-left','inset-right'));
 for(const rootFont of [16,24,32])for(const safeBottom of [0,24,44])for(const safeTop of [0,24,44])for(const safeSide of [0,24,44])for(const gutter of [0,15])for(const navScrollbar of [0,15]){
  const barPadding=padding(bar,rootFont),itemPadding=padding(item,rootFont),border=2*length(bar.border.split(' ')[0],rootFont);
  const gap=length(bar.gap,rootFont),font=length(declarations('src/styles/tokens.css',':root',width)['--font-size-xs'],rootFont);
  const line=font*Number(item['line-height']),itemGap=length(item.gap,rootFont);
  const icon=length(declarations(css,'.bar svg',width).height,rootFont),plus=length(add.height,rootFont);
  const content=Math.min(length(bar['max-width'],rootFont),width-2*Math.max(+left[1],safeSide)-gutter)-barPadding.inline-border-navScrollbar;
  const stacked=declarations(css,'.bar a',width,content,rootFont).flex==='0 0 calc((100% - 2px) / 2)';
  const minima=[44,60,52,44,Math.max(60,3*font)],weights=[1,1.25,0,1,1.25];
  let sizes;
  if(stacked)sizes=[(content-gap)/2,(content-gap)/2,plus,(content-gap)/2,(content-gap)/2];
  else{
   let low=0,high=content;
   for(let step=0;step<60;step++){
    const unit=(low+high)/2;
    if(minima.reduce((sum,min,i)=>sum+Math.max(min,weights[i]*unit),0)>content-4*gap)high=unit;else low=unit;
   }
   sizes=minima.map((min,i)=>Math.max(min,weights[i]*low));
   assert.ok(sizes.reduce((sum,n)=>sum+n,0)+4*gap<=content+1e-7,'single row also fits with an internal scrollbar');
  }
  const labels=['ホーム','アーカイブ','','分析','アカウント'];
  const itemHeights=labels.map((label,i)=>{
   if(i===2)return plus;
   const glyphs=Math.floor((sizes[i]-itemPadding.inline)/font);assert.ok(glyphs>=1);
   const lines=Math.ceil(label.length/glyphs);
   return Math.max(length(item['min-height'],rootFont),icon+lines*line+itemGap+itemPadding.block+(i===4?line+itemGap:0));
  });
  assert.ok(sizes[4]>=3*font,'preparation caption remains unbroken');
  sizes.forEach((size,i)=>assert.ok(size>=44&&itemHeights[i]>=44));assert.equal(sizes[2],52);
  const rows=stacked?[[0,1],[2],[3,4]]:[[0,1,2,3,4]],rowHeights=rows.map(row=>Math.max(...row.map(i=>itemHeights[i])));
  const natural=rowHeights.reduce((sum,n)=>sum+n,0)+(rows.length-1)*gap+barPadding.block+border;
  const offset=+bottom[1]+safeBottom,top=Math.max(+maximum[2],safeTop),available=height-offset-top;
  const rendered=Math.min(natural,available),port=rendered-barPadding.block-border;
  // Project-local Add sits above the measured bar and reserves its own height.
  // Glyph widths here are conservative model inputs, not browser font metrics.
  const actionWidth=width-2*Math.max(rootFont,safeSide)-gutter;
  const actionGlyphs=Math.max(1,Math.floor((actionWidth-2*1.25*rootFont-2)/rootFont));
  const actionHeight=Math.max(2.75*rootFont,Math.ceil('＋ 支出を追加'.length/actionGlyphs)*1.5*rootFont+rootFont+2);
  const actionReserve=actionHeight+16;
  const docked=height>=actionReserve+offset+top+62;
  if(docked){
   const navHeight=Math.min(natural,available-actionReserve);
   const actionBottom=navHeight+24+safeBottom;
   const actionTop=height-actionBottom-actionHeight;
   assert.ok(actionTop>=Math.max(8,safeTop)-1e-7,'docked Add stays below Safe Area');
   assert.ok(Math.abs(actionBottom-(navHeight+offset)-16)<1e-7,'Add and nav have a 16px gap');
   assert.ok(navHeight-barPadding.block-border>=44,'navigation retains an operable internal scrollport');
   const contentPadding=navHeight+24+safeBottom+actionReserve;
   assert.ok(contentPadding>=actionBottom+actionHeight+16,'content end can scroll above both fixed controls');
  }else{
   assert.ok(available>=44+barPadding.block+border,'short-screen inline Add leaves the original navigation scrollport');
  }
  assert.ok(available>barPadding.block+border);assert.ok(height-offset-rendered>=top-1e-7,'bar stays below the safe top edge');
  const scrollRange=Math.max(0,natural-rendered);assert.ok(port>0);cappedHeights.add(rendered);heightCases++;
  if(scrollRange>0)overflowCases++;else{normalCases++;assert.equal(rendered,natural,'normal geometry is unchanged without overflow');}
  let rowTop=0;
  rows.forEach((row,r)=>{
   row.forEach(i=>{
    const start=rowTop+(rowHeights[r]-itemHeights[i])/2,end=start+itemHeights[i];
    // Native focus scrolling must still be verified. This only proves that a
    // legal scroll offset exists for every focusable item, and both edges of
    // the disabled Account item remain reachable even if it exceeds the port.
    const offset=Math.min(scrollRange,Math.max(0,end-port));
    assert.ok(start<=scrollRange+port&&end>=0,'item intersects the total reachable scroll extent');
    assert.ok(end<=scrollRange+port+1e-7,'bottom edge can be reached');
    if(i!==4){assert.ok(itemHeights[i]<=port,'focusable item can fit the scrollport');assert.ok(start>=offset-1e-7&&end<=offset+port+1e-7);}
   });
   rowTop+=rowHeights[r]+gap;
  });
  if(width===320&&height===240&&rootFont===32&&safeBottom===24&&safeTop===0&&safeSide===0&&gutter===0&&navScrollbar===0){
   assert.ok(stacked);assert.ok(Math.abs(natural-281.4)<1e-7,'reviewed natural height from CSS');assert.equal(rendered,200);assert.ok(scrollRange>0);
  }
 }
}
// Feed the capped border-box height, not the full scroll content height, through
// the real component's ResizeObserver callback and cleanup.
let cappedResize;
globalThis.ResizeObserver=class {constructor(cb){cappedResize=cb;}observe(){}disconnect(){}};
media.matches=true;const cappedNav=harness(),cappedTree=cappedNav.run('ResponsiveNavigation',props);
walk(cappedTree).find(n=>n.props?.className==='bar').props.ref.current={closest:()=>host,getBoundingClientRect:()=>({height:measured})};
cappedNav.flush();
for(const height of cappedHeights){measured=height;cappedResize();assert.equal(reserveValues.get('--responsive-nav-reserve'),`${Math.ceil(height)+24}px`);}
cappedNav.dispose();assert.equal(reserveValues.size,0);delete globalThis.ResizeObserver;
console.log(`Navigation height/reachability static model PASS: ${heightCases} cases, ${overflowCases} overflowing / ${normalCases} natural-height, capped ResizeObserver reserve. Native scroll/focus/touch unverified.`);
// Follow the actual JSX ancestry, rather than comparing unrelated z-index numbers.
function ancestors(file,target){
 const source=ts.createSourceFile(file,readFileSync(resolve(root,file),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const matches=[];
 function visit(node,path,styled=false){
  const opening=ts.isJsxElement(node)?node.openingElement:ts.isJsxSelfClosingElement(node)?node:null;
  if(opening){
   styled ||= opening.attributes.properties.some(p=>p.name?.getText(source)==='style');
   if(opening.tagName.getText(source)===target){
    assert.ok(!styled,`${file}: inspect new inline styles before trusting layer ancestry`);matches.push(path);
   }
   const classes=opening.attributes.properties.find(p=>p.name?.getText(source)==='className')?.initializer?.getText(source)??'';
   path=[...path,classes.match(/(?:shellStyles|homeStyles|styles)\.\w+/g)??[]];
  }
  ts.forEachChild(node,child=>visit(child,path,styled));
 }
 visit(source,[]);assert.equal(matches.length,1,`${file}: ${target} placement`);return matches[0];
}
assert.deepEqual(ancestors('src/components/layout/AppShell.tsx','Outlet'),[['styles.shell'],['styles.frame'],['styles.content']]);
assert.deepEqual(ancestors('src/components/layout/AppShell.tsx','ResponsiveNavigation'),[['styles.shell']]);
assert.deepEqual(ancestors('src/pages/HomePage/HomePage.tsx','ProjectDeleteDialog'),[['styles.page']]);
assert.deepEqual(ancestors('src/pages/ArchivesPage/ArchivesPage.tsx','ProjectDeleteDialog'),[['homeStyles.page']]);
assert.deepEqual(ancestors(navFile,'nav'),[['styles.root']]);
const navigationSource = readFileSync(resolve(root,navFile),'utf8');
assert.match(navigationSource, /getElementById\("demo-protected-root"\) : null\) \?\? document\.body/);
assert.match(navigationSource, /createPortal\([\s\S]*,portal\)/, 'Quick Add escapes navigation ancestry within the active protection boundary');
// Reject stacking contexts/containing blocks on every intervening Home ancestor,
// including theme/conditional rules. This is a source guard, not a browser CSS engine.
for(const [file,selectors] of [
 ['src/styles/globals.css',['*','html','body','#root']],
 ['src/components/layout/AppShell.module.css',['.shell','.content']],
 [shellCss,['.shell','.frame','.content']],
 [pageCss,['.page']],
 [css,['.root']],
])postcss.parse(readFileSync(resolve(root,file),'utf8')).walkRules(rule=>{
 if(!rule.selectors.some(s=>selectors.includes(s.replace(/\[[^\]]*\]/g,''))))return;
 rule.walkDecls(({prop,value})=>{
  const context=(prop==='position'&&/^(fixed|sticky)$/.test(value)) ||
   (prop==='z-index'&&value!=='auto') || (prop==='opacity'&&Number(value)<1) ||
   (/^(transform|translate|rotate|scale|filter|backdrop-filter|perspective|clip-path|mask|mask-image)$/.test(prop)&&value!=='none') ||
   (prop==='isolation'&&value==='isolate') || (prop==='mix-blend-mode'&&value!=='normal') ||
   (prop==='contain'&&/layout|paint|strict|content/.test(value)) || (prop==='container-type'&&value!=='normal') ||
   (prop==='content-visibility'&&value!=='visible') || /^--z-index-(navigation|modal)$/.test(prop) ||
   (prop==='will-change'&&/transform|opacity|filter|perspective|contain/.test(value)) ||
   (/^animation(?:-name)?$/.test(prop)&&value!=='none');
  assert.ok(!context,`${file} ${rule.selector}: ${prop}:${value} requires a fresh stacking-context review`);
 });
});
const deleteCss='src/features/projects/components/ProjectDeleteDialog.module.css';
const deletion=harness('src/features/projects/components/ProjectDeleteDialog.tsx');
let finishDelete,deleteClosed=0;
const deleting=new Promise(resolve=>{finishDelete=resolve;});
const deleteProps={project:{name:'Layer regression',type:'CONTINUOUS',status:'ACTIVE'},onConfirm:()=>deleting,onClose(){deleteClosed++;}};
const confirmTree=deletion.run('ProjectDeleteDialog',deleteProps);
walk(confirmTree).find(n=>n.props?.className==='danger').props.onClick();
const pendingTree=deletion.run('ProjectDeleteDialog',deleteProps);
assert.match(renderToStaticMarkup(pendingTree),/削除中…/);
assert.ok(walk(pendingTree).filter(n=>n.type==='button').every(n=>n.props.disabled));
pendingTree.props.onMouseDown({target:overlay,currentTarget:overlay});assert.equal(deleteClosed,0,'pending deletion cannot dismiss through backdrop');
for(const width of [320,390,430,768,820,1024]){
 const tokens=declarations('src/styles/tokens.css',':root',width);
 const nav=declarations(css,'.bar',width),sheet=declarations(css,'.overlay',width);
 assert.equal(nav['z-index'],'var(--z-index-navigation)');
 for(const tree of [confirmTree,pendingTree]){
  assert.equal(tree.type,'div');assert.equal(tree.props.className,'overlay');assert.equal(tree.props.style,undefined);
  const modal=declarations(deleteCss,'.'+tree.props.className,width);
  assert.equal(modal['z-index'],'var(--z-index-modal)');
  assert.equal(modal.position,'fixed');assert.equal(modal.inset,'0');assert.notEqual(modal['pointer-events'],'none');
  assert.ok(Number(tokens['--z-index-navigation'])<Number(tokens['--z-index-modal']),`${width}: deletion overlay covers navigation in confirmation and pending states`);
 }
 assert.equal(nav.position,'fixed');assert.equal(sheet.position,'fixed');assert.equal(sheet.inset,'0');
 assert.equal(sheet['z-index'],'1000');assert.ok(Number(sheet['z-index'])>Number(tokens['--z-index-modal']),'body-portaled Quick Add remains above both layers');
}
finishDelete();await deleting;assert.equal(deleteClosed,1);
console.log('Layer regression: actual Home JSX ancestry, ancestor stacking-context guards, confirmation/pending deletion overlays and body-portaled Quick Add order PASS (static/component model; native hit-testing unverified).');
// Resize during an open sheet restores to the now-visible desktop main.
media.matches=true;doc.activeElement=trigger;
const resize=harness(),resizeTree=resize.run('QuickAddSheet',{theme:'light',triggerId:'trigger',onClose(){}});
resizeTree.props.ref.current=overlay;walk(resizeTree).find(n=>n.props?.role==='dialog').props.ref.current=dialog;resize.flush();
media.matches=false;resize.dispose();assert.equal(doc.activeElement,main);assert.equal(app.inert,false);assert.equal(listeners.size,0);
const source=readFileSync(resolve(root,css),'utf8');assert.match(source,/prefers-reduced-motion: reduce/);assert.match(source,/env\(safe-area-inset-bottom\)/);assert.match(source,/100dvh/);assert.match(source,/overflow-y: auto/);
console.log('Responsive navigation: Home/Archives/Analytics SSR, active routes/theme/preparation, component-model open/resize/close/Escape/Tab trap/inert/scroll lock/focus restore and 320/375/390/393/402/430/440/768/820/1024/1199/1200/1280/1536 CSS envelopes PASS. Flex/container width model at root fonts 16/24/32px, side Safe Areas 0/24/44px and scrollbar allowances 0/15px: row minima/padding/border/gaps fit, 44px targets, centered 52px plus, unbroken preparation caption and measured multi-row reserve PASS. Native browser font metrics, focus, touch, safe areas, enlarged-text paint and visual matching unverified.');

// Actual ProjectDetailHeader effects: measured action reserve and inline fallback.
const projectHeaderFile='src/features/projects/components/ProjectDetailHeader.tsx';
const projectHeaderCss='src/features/projects/components/ProjectDetailHeader.module.css';
const savedWindow=globalThis.window;
let actionHeight=50,safeTop=0,safeBottom=0,height=667,actionResize,observerDisconnected=false;
const actionMediaListeners=new Set(),windowListeners=new Set();
const actionMedia={matches:true,addEventListener:(_,fn)=>actionMediaListeners.add(fn),removeEventListener:(_,fn)=>actionMediaListeners.delete(fn)};
const actionValues=new Map([['--project-expense-action-reserve','7px']]);
const actionShell={style:{getPropertyValue:key=>actionValues.get(key)??'',setProperty:(key,value)=>actionValues.set(key,value),removeProperty:key=>actionValues.delete(key)}};
const actionButton={closest:()=>actionShell,getBoundingClientRect:()=>({height:actionHeight})};
globalThis.window={get innerHeight(){return height;},matchMedia:()=>actionMedia,
 getComputedStyle:()=>({getPropertyValue:key=>`${key==='--action-safe-top'?safeTop:safeBottom}px`}),
 addEventListener:(_,fn)=>windowListeners.add(fn),removeEventListener:(_,fn)=>windowListeners.delete(fn)};
globalThis.ResizeObserver=class {constructor(callback){actionResize=callback;}observe(node){assert.equal(node,actionButton);}disconnect(){observerDisconnected=true;}};
for(const type of ['CONTINUOUS','EVENT']){
 const header=harness(projectHeaderFile);let added=0;
 const props={name:'Target project',type,members:[],totalExpenseYen:0,expenseCount:0,onAddExpense:()=>added++};
 let tree=header.run('ProjectDetailHeader',props);
 let button=walk(tree).find(n=>n.props?.className==='addExpense');assert.ok(button);button.props.ref.current=actionButton;header.flush();
 assert.equal(actionValues.get('--project-expense-action-reserve'),'66px');button.props.onClick();assert.equal(added,1);
 for(const measured of [44,72,130,190]){
  actionHeight=measured;height=956;safeTop=44;safeBottom=44;actionResize();
  assert.equal(actionValues.get('--project-expense-action-reserve'),`${measured+16}px`);
  tree=header.run('ProjectDetailHeader',props);assert.equal(walk(tree).find(n=>n.props?.className==='addExpense').props['data-inline-action'],undefined);
 }
 height=240;actionResize();tree=header.run('ProjectDetailHeader',props);
 assert.equal(actionValues.get('--project-expense-action-reserve'),'0px');assert.equal(walk(tree).find(n=>n.props?.className==='addExpense').props['data-inline-action'],true);
 height=956;windowListeners.forEach(fn=>fn());tree=header.run('ProjectDetailHeader',props);
 assert.equal(walk(tree).find(n=>n.props?.className==='addExpense').props['data-inline-action'],undefined);
 actionMedia.matches=false;actionMediaListeners.forEach(fn=>fn());assert.equal(actionValues.get('--project-expense-action-reserve'),'7px','tablet/PC restore previous shell state');
 header.dispose();assert.equal(actionValues.get('--project-expense-action-reserve'),'7px');assert.ok(observerDisconnected);assert.equal(windowListeners.size,0);assert.equal(actionMediaListeners.size,0);
 const archived=harness(projectHeaderFile);tree=archived.run('ProjectDetailHeader',{...props,archived:true});archived.flush();assert.ok(!walk(tree).some(n=>n.props?.className==='addExpense'));archived.dispose();
 actionMedia.matches=true;actionHeight=50;height=667;safeTop=0;safeBottom=0;
}
globalThis.window=savedWindow;delete globalThis.ResizeObserver;
for(const width of [320,375,393,440,767,768,820,1024,1200,1536]){
 const button=declarations(projectHeaderCss,'.addExpense',width);
 if(width<768){
  assert.equal(button.position,'fixed');assert.equal(button.bottom,'calc(var(--responsive-nav-reserve, 8rem) + env(safe-area-inset-bottom))');
  assert.equal(declarations(projectHeaderCss,'.addExpense[data-inline-action]',width).position,'static');
  assert.equal(declarations(shellCss,'.content',width)['padding-bottom'],'calc(var(--responsive-nav-reserve, 8rem) + env(safe-area-inset-bottom) + var(--project-expense-action-reserve, 0px))');
  assert.equal(button['z-index'],'var(--z-index-sticky)');
 }else{assert.equal(button.position,undefined);assert.equal(button['grid-column'],'2');assert.equal(declarations(shellCss,'.content',width)['padding-bottom'],undefined);}
 assert.equal(button.background,'var(--color-action-primary)');assert.equal(button.color,'var(--color-text-on-primary)');
}
const layerTokens=declarations('src/styles/tokens.css',':root',375);
assert.ok(+layerTokens['--z-index-sticky']<+layerTokens['--z-index-navigation']);
assert.ok(+layerTokens['--z-index-navigation']<+layerTokens['--z-index-modal']);
assert.equal(declarations(css,'.overlay',375)['z-index'],'1000');
console.log('Project-local Add PASS: Continuous/Event active/archived header, direct action, ResizeObserver/resize/Safe Area/short-viewport fallback and cleanup; SE/16/16 Pro Max-width geometry with 16/24/32px text, nav rows/internal scroll, content-end clearance, tablet/PC grid and semantic theme/layer guards. Static/component model; native browser layout/focus unverified.');

// Quick Add menu rows share the same growing text and non-shrinking end slot.
let chevronCases=0;
for(const theme of ['light','dark']){
 const menu=harness();
 const tree=menu.run('QuickAddSheet',{theme,triggerId:'trigger',onClose(){},onSelectProject(){}});
 const rows=walk(tree).filter(node=>React.Children.toArray(node?.props?.children).some(child=>child.props?.className==='actionText'));
 assert.equal(rows.length,4);
 const arrowRows=rows.filter(row=>walk(row).some(node=>node.props?.className==='actionChevron'));
 assert.equal(arrowRows.length,2);
 assert.match(renderToStaticMarkup(arrowRows[0]),/支出を追加/);assert.match(renderToStaticMarkup(arrowRows[1]),/プロジェクトを作成/);
 assert.equal(rows.filter(row=>row.props.disabled&&walk(row).some(node=>node.props?.className==='badge')).length,2);
 for(const row of rows){
  const children=React.Children.toArray(row.props.children);
  assert.equal(children.length,3);assert.equal(children[0].props.className,'actionIcon');assert.equal(children[1].props.className,'actionText');
 }
 for(const width of [320,375,390,440,768,820,1024])for(const font of [16,24,32])for(const safe of [0,44])for(const long of [false,true]){
  const text=declarations(css,'.actionText',width),arrow=declarations(css,'.actionChevron',width);
  assert.equal(text.flex,'1');assert.equal(text['min-width'],'0');assert.equal(text['overflow-wrap'],'anywhere');assert.equal(arrow.flex,'none');
  assert.equal(declarations(css,'.badge',width).flex,'none');assert.equal(declarations(css,'.badge',width)['margin-left'],'auto');
  assert.equal(declarations(css,'.actions',width).gap,'8px');
  const ends=arrowRows.map(row=>{
   const style=declarations(css,row.type===Link?'.actions a':'.actions button',width);
   assert.equal(style.display,'flex');assert.equal(style['min-height'],'64px');assert.equal(style['border-radius'],'20px');
   assert.equal(style.background,'var(--nav-surface)');assert.equal(style.color,'var(--nav-text)');
   const sheet=declarations(css,'.sheet',width),padding=length(style['padding-inline']??style.padding.split(' ').at(-1),font);
   const sheetPadding=length(sheet['padding-inline']??sheet.padding.split(' ').at(-1),font);
   const rowWidth=Math.min(36*font,width-2*Math.max(12,safe))-2-2*sheetPadding;
   const icon=length(declarations(css,'.actionIcon',width).width,font),gap=length(style.gap,font),arrowWidth=font;
   const textWidth=rowWidth-2-2*padding-icon-2*gap-arrowWidth;
   assert.ok(textWidth>=font,'text can wrap while the arrow keeps its width');
   const title=long?'とても長いプロジェクト名と支出を追加するメニュー項目'.repeat(4):'プロジェクトを作成';
   const subtitle=long?'補足文が長くなっても矢印の領域を侵食しません'.repeat(6):'継続・イベントの新規作成';
   const lines=Math.ceil(title.length*font/textWidth)+Math.ceil(subtitle.length*font/textWidth);
   assert.ok(lines>=2,'long content wraps in the text column');
   return rowWidth-1-padding;
  });
  assert.equal(ends[0],ends[1],'both chevron right edges have identical inner padding');chevronCases++;
 }
}
console.log(`Quick Add chevrons PASS: common icon/text/end slots, two arrows and two preparation badges; ${chevronCases} Light/Dark width/font/Safe Area/long-text flex-model cases. Native browser glyph metrics and paint unverified.`);
