import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import {createRoot} from 'react-dom/client';
import * as Router from 'react-router-dom';
import postcss from 'postcss';

// Real React context/reconciliation/router and portals in a Node DOM model.
// No browser, CSS layout engine or native input/paint is involved.
const walk=n=>[n,...(n.childNodes??[]).flatMap(walk)];
class Element extends EventTarget {
 constructor(name,doc){super();this.nodeType=1;this.localName=name;this.tagName=this.nodeName=name.toUpperCase();this.ownerDocument=doc;this.childNodes=[];this.attrs={};this.style={setProperty(k,v){this[k]=v;},getPropertyValue(k){return this[k]??'';},removeProperty(k){delete this[k];}};}
 appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.push(n);n.parentNode=this;return n;}
 insertBefore(n,b){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.splice(this.childNodes.indexOf(b),0,n);n.parentNode=this;return n;}
 removeChild(n){this.childNodes.splice(this.childNodes.indexOf(n),1);n.parentNode=null;return n;}
 setAttribute(k,v){this.attrs[k]=String(v);}setAttributeNS(_ns,k,v){this.setAttribute(k,v);}getAttribute(k){return this.attrs[k]??null;}removeAttribute(k){delete this.attrs[k];}
 get firstChild(){return this.childNodes[0]??null;}get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
 get textContent(){return this.childNodes.map(n=>n.textContent).join('');}set textContent(v){this.childNodes=[];if(v)this.appendChild(this.ownerDocument.createTextNode(String(v)));}
 contains(n){return n===this||this.childNodes.some(c=>c.contains?.(n));}
 closest(selector){for(let n=this;n;n=n.parentElement)if(selector.split(',').some(s=>n.getAttribute(s.trim().slice(1,-1))!==null))return n;return null;}
 getBoundingClientRect(){return {width:320,height:72,top:0,left:0,bottom:72,right:320};}
 focus(){this.ownerDocument.activeElement=this;}
}
const doc=Object.assign(new EventTarget(),{nodeType:9,createElement(name){return new Element(name,this);},createElementNS(_ns,name){return this.createElement(name);},createTextNode(value){return {nodeType:3,nodeValue:value,get textContent(){return this.nodeValue;},set textContent(v){this.nodeValue=v;}};},getElementById(id){return walk(this.body).find(n=>n.getAttribute?.('id')===id)??null;}});
doc.documentElement=doc.createElement('html');doc.body=doc.createElement('body');doc.documentElement.appendChild(doc.body);doc.activeElement=doc.body;
let saved=null,readFails=false,writeFails=false;
const storage={getItem(){if(readFails)throw Error('read denied');return saved;},setItem(key,value){assert.equal(key,'spendingmate-theme');if(writeFails)throw Error('write denied');saved=value;}};
const media=Object.assign(new EventTarget(),{matches:true});
const win=Object.assign(new EventTarget(),{document:doc,location:new URL('https://example.test/'),localStorage:storage,matchMedia:()=>media,HTMLElement:Element,HTMLIFrameElement:class{},getComputedStyle:n=>n.style});doc.defaultView=win;
Object.assign(globalThis,{window:win,document:doc,HTMLElement:Element,Element,Node:Element});
const rootDir=fileURLToPath(new URL('../',import.meta.url));
function loader(dev=false){
 const cache=new Map();
 function load(file){
  const path=resolve(rootDir,file);if(cache.has(path))return cache.get(path);
  const source=readFileSync(path,'utf8').replaceAll('import.meta.env.DEV',String(dev));
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module={exports:{}};cache.set(path,module.exports);
  new Function('exports','require',code)(module.exports,name=>{
   if(name==='react')return React;if(name==='react/jsx-runtime')return jsx;if(name==='react-dom')return ReactDOM;if(name==='react-router-dom')return Router;
   if(name==='@tanstack/react-query')return {useQuery:()=>({isPending:true})};
   if(name.endsWith('.module.css'))return {__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})};
   if(name.endsWith('.css'))return {};if(name.endsWith('.png'))return {__esModule:true,default:'/logo.png'};
   const base=resolve(dirname(path),name),target=[base,base+'.ts',base+'.tsx'].find(existsSync);assert.ok(target,name);return load(target);
  });return module.exports;
 }return load;
}
const load=loader(),theme=load('src/app/ThemeProvider.tsx');
assert.equal(theme.initialTheme(),'light');saved='dark';assert.equal(theme.initialTheme(),'dark');
saved='invalid';assert.equal(theme.initialTheme(),'light');readFails=true;assert.equal(theme.initialTheme(),'light');readFails=false;saved=null;
const {AppShell}=load('src/components/layout/AppShell.tsx'),{AnalyticsPage}=load('src/pages/AnalyticsPage/AnalyticsPage.tsx');
const paths=['/','/archives','/analytics','/projects/new','/p/token','/p/token/edit','/p/token/expenses/new','/expenses/new'];
let current,client,host;
function Probe(){current={...theme.useTheme(),navigate:Router.useNavigate(),path:Router.useLocation().pathname};return ReactDOM.createPortal(React.createElement('div',{'data-test-portal':'', 'data-theme-value':current.theme}),doc.body);}
const screen=React.createElement('p',null,'route content');
function mount(){
 host=doc.createElement('div');doc.body.appendChild(host);client=createRoot(host);
 ReactDOM.flushSync(()=>client.render(React.createElement(React.StrictMode,null,React.createElement(theme.ThemeProvider,null,React.createElement(Router.MemoryRouter,null,React.createElement(Probe),React.createElement(Router.Routes,null,
  React.createElement(Router.Route,{element:React.createElement(AppShell)},...paths.map(path=>React.createElement(Router.Route,{key:path,path,element:path==='/analytics'?React.createElement(AnalyticsPage):screen})))
 ))))));
}
const tick=()=>new Promise(setImmediate);
function unmount(){ReactDOM.flushSync(()=>client.unmount());doc.body.removeChild(host);}
function check(value){
 assert.equal(current.theme,value);assert.equal(doc.documentElement.getAttribute('data-theme'),value);
 assert.equal(walk(doc.body).find(n=>n.getAttribute?.('data-test-portal')!==null&&n.getAttribute?.('data-test-portal')!==undefined).getAttribute('data-theme-value'),value);
 for(const n of walk(host))if(n.getAttribute?.('data-home-theme')!==null&&n.getAttribute?.('data-home-theme')!==undefined)assert.equal(n.getAttribute('data-home-theme'),value);
 for(const n of walk(host))if(n.getAttribute?.('data-analytics-v4')!==null&&n.getAttribute?.('data-analytics-v4')!==undefined)assert.equal(n.getAttribute('data-theme'),value);
}
mount();await tick();check('light');
const sharedHeader=walk(host).find(n=>n.localName==='header'),sharedSidebar=walk(host).find(n=>n.localName==='aside');
const sharedBottom=walk(host).find(n=>n.getAttribute?.('aria-label')==='モバイルナビゲーション');
for(const path of paths){
 globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 await React.act(async()=>{current.navigate(path);});
 globalThis.IS_REACT_ACT_ENVIRONMENT=false;
 assert.equal(current.path,path);check(saved);
 assert.equal(walk(host).filter(n=>n.localName==='header').length,1);
 assert.equal(walk(host).filter(n=>n.localName==='main').length,1);
 assert.equal(walk(host).filter(n=>n.localName==='aside').length,1);
 assert.equal(walk(host).filter(n=>n.localName==='img'&&n.getAttribute('alt')==='Spendy').length,1);
 assert.equal(walk(host).find(n=>n.localName==='header'),sharedHeader,'header stays mounted across routes');
 assert.equal(walk(host).find(n=>n.localName==='aside'),sharedSidebar,'sidebar stays mounted across routes');
 assert.equal(walk(host).find(n=>n.getAttribute?.('aria-label')==='モバイルナビゲーション'),sharedBottom,'bottom navigation stays mounted');
 const selectedSide=walk(sharedSidebar).filter(n=>n.getAttribute?.('aria-current')==='page');
 assert.deepEqual(selectedSide.map(n=>n.getAttribute('href')),['/','/analytics','/projects/new'].includes(path)?[path]:[]);
 const selectedBottom=walk(sharedBottom).filter(n=>n.getAttribute?.('aria-current')==='page');
 assert.deepEqual(selectedBottom.map(n=>n.getAttribute('href')),['/','/analytics','/archives'].includes(path)?[path]:[]);
 assert.doesNotMatch(host.textContent,/日々の支出を、いっしょに。/);
 if(path.startsWith('/p/'))assert.ok(walk(host).some(n=>n.localName==='a'&&n.getAttribute('href')===(path==='/p/token'?'/':'/p/token')&&n.textContent.includes('戻る')));
 const buttons=walk(host).filter(n=>['ダークモードに切り替える','ライトモードに切り替える'].includes(n.getAttribute?.('aria-label')));
 assert.equal(buttons.length,2,'one header and one sidebar control, with mutually exclusive CSS visibility on every route');
 const button=buttons.at(-1),props=button[Object.keys(button).find(k=>k.startsWith('__reactProps$'))];
 for(const control of buttons){
  assert.equal(control.getAttribute('aria-label'),current.theme==='light'?'ダークモードに切り替える':'ライトモードに切り替える');
  assert.equal(walk(control).some(n=>n.localName==='circle'),current.theme==='dark','Light shows moon; Dark shows sun');
  assert.equal(walk(control).filter(n=>n.localName==='svg').length,1);
  assert.equal(walk(control).filter(n=>n.localName==='span').length,0,'no switch track or thumb');
 }
 const expected=current.theme==='light'?'dark':'light';
 props.onClick();await tick();check(expected);assert.equal(saved,expected);
 assert.equal(button.getAttribute('aria-label'),expected==='light'?'ダークモードに切り替える':'ライトモードに切り替える');
 assert.equal(button.getAttribute('aria-pressed'),null);
}
ReactDOM.flushSync(()=>current.toggleTheme());await tick();check('dark');unmount();mount();await tick();check('dark');
writeFails=true;current.toggleTheme();await tick();check('light');writeFails=false;
unmount();readFails=true;writeFails=true;mount();await tick();check('light');current.toggleTheme();await tick();check('dark');unmount();readFails=false;writeFails=false;
// An inaccessible localStorage getter must also be harmless.
Object.defineProperty(win,'localStorage',{configurable:true,get(){throw Error('blocked storage');}});mount();await tick();check('light');current.toggleTheme();await tick();check('dark');unmount();
Object.defineProperty(win,'localStorage',{configurable:true,value:storage});

// DEV URL overrides seed the one provider, then toggles update that URL without
// dropping React Router's history state. Production ignores the preview query.
win.location=new URL('https://example.test/analytics?analyticsPreview=1&theme=dark&view=future&plan=pro');saved='light';
const devTheme=loader(true)('src/app/ThemeProvider.tsx');assert.equal(devTheme.initialTheme(),'dark');assert.equal(theme.initialTheme(),'light');
win.history={state:{idx:3},replaceState(state,_title,url){assert.deepEqual(state,{idx:3});win.location=new URL(url);}};
let devState;
function DevProbe(){devState=devTheme.useTheme();return null;}
host=doc.createElement('div');doc.body.appendChild(host);client=createRoot(host);
ReactDOM.flushSync(()=>client.render(React.createElement(devTheme.ThemeProvider,null,React.createElement(DevProbe))));await tick();assert.equal(saved,'dark');devState.toggleTheme();await tick();
assert.equal(saved,'light');assert.equal(win.location.searchParams.get('theme'),'light');assert.equal(win.location.searchParams.get('view'),'future');assert.equal(win.location.searchParams.get('plan'),'pro');unmount();

// CSS contract checks, not a claim of pixel/contrast acceptance.
const css=file=>postcss.parse(readFileSync(resolve(rootDir,file),'utf8'));
const tokens=css('src/styles/tokens.css');let dark;
tokens.walkRules(rule=>{if(rule.selector===':root[data-theme="dark"]'){dark={};rule.walkDecls(d=>dark[d.prop]=d.value);}});
for(const role of ['background-page','background-surface','background-elevated','background-input','text-primary','text-secondary','border-control'])assert.ok(dark['--color-'+role]);
for(const file of ['src/features/expenses/components/AddExpenseModal.module.css','src/features/projects/components/ProjectDeleteDialog.module.css']){
 const source=readFileSync(resolve(rootDir,file),'utf8');assert.match(source,/var\(--color-background-/);assert.match(source,/var\(--color-text-/);assert.doesNotMatch(source,/#[\da-f]{3,8}\b/i);
}
let toggleSize;
css('src/components/navigation/ThemeToggle.module.css').walkRules(rule=>{if(rule.selector==='.themeControl'){toggleSize={};rule.walkDecls(d=>toggleSize[d.prop]=d.value);}});
assert.equal(toggleSize.width,'max(44px, 2.75rem)');assert.equal(toggleSize.height,toggleSize.width);assert.equal(toggleSize['border-radius'],'50%');assert.equal(toggleSize.padding,'0');assert.equal(toggleSize['min-width'],'44px');assert.equal(toggleSize['min-height'],'max(44px, 2.75rem)');
for(const file of ['src/components/navigation/ThemeToggle.module.css','src/pages/AnalyticsPage/analyticsV4.css'])assert.doesNotMatch(readFileSync(resolve(rootDir,file),'utf8'),/themeTrack|theme-toggle|toggle-track|toggle-dot/);
const app=readFileSync(resolve(rootDir,'src/app/App.tsx'),'utf8');assert.match(app,/<ThemeProvider><RouterProvider/);
assert.match(readFileSync(resolve(rootDir,'src/components/layout/AppShell.tsx'),'utf8'),/ResponsiveNavigation/);
console.log('Shared theme PASS: real React StrictMode/context, all 8 route entries and shell controls, Light default/valid-invalid saved preference, reload, read/write/getter failures, root/body portal synchronization, DEV URL compatibility/history, shared semantic dialog tokens and 44px targets. Native layout/contrast/focus/animation paint unverified.');
