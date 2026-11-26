import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {getEventListeners,setMaxListeners} from 'node:events';
// Real React + Motion renderer against a small Node DOM model. No browser or CSS layout.
// Globals are isolated in this process; imports below occur after their setup.
let now=0, nextFrame=0, lastFrame=-Infinity; const frames=new Map(), observers=new Set(), writes=[], circleWrites=[];
const style=()=>Object.assign(Object.create(null),{setProperty(k,v){this[k]=String(v);},removeProperty(k){delete this[k];},getPropertyValue(k){return this[k]??'';}});
const focusCalls=[];
class FakeElement extends EventTarget {
 constructor(name,doc,ns='http://www.w3.org/1999/xhtml'){super();this.nodeType=1;this.localName=name;this.nodeName=this.tagName=ns.includes('svg')?name:name.toUpperCase();this.ownerDocument=doc;this.namespaceURI=ns;this.childNodes=[];this.style=style();this.attrs={};}
 appendChild(n){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.push(n);n.parentNode=this;return n;}
 insertBefore(n,b){if(n.parentNode)n.parentNode.removeChild(n);this.childNodes.splice(this.childNodes.indexOf(b),0,n);n.parentNode=this;return n;}
 removeChild(n){this.childNodes.splice(this.childNodes.indexOf(n),1);n.parentNode=null;return n;}
 setAttribute(k,v){this.attrs[k]=String(v);if(this.localName==='polyline')writes.push([k,String(v)]);if(this.localName==='circle'&&k==='stroke-dasharray')circleWrites.push({node:this,value:String(v)});} setAttributeNS(ns,k,v){this.setAttribute(k,v);} removeAttribute(k){delete this.attrs[k];} getAttribute(k){return this.attrs[k]??null;}
 get firstChild(){return this.childNodes[0]??null;} get parentElement(){return this.parentNode?.nodeType===1?this.parentNode:null;}
 get options(){return walk(this).filter(n=>n.localName==='option');}
 get value(){return this.attrs.value??'';} set value(v){this.attrs.value=String(v);}
 get ownerSVGElement(){let p=this.parentElement;while(p&&p.localName!=='svg')p=p.parentElement;return p;}
 get textContent(){return this.childNodes.map(n=>n.textContent).join('');} set textContent(v){for(const node of this.childNodes)node.parentNode=null;this.childNodes=[];if(String(v)!=='')this.appendChild(this.ownerDocument.createTextNode(String(v)));}
 getBoundingClientRect(){const badge=this.attrs.class==='chart-point-badge',width=this.measuredWidth??(badge?220:740),height=badge?116:280;return {x:0,y:0,left:0,top:0,right:width,bottom:height,width,height};} getBBox(){return {x:0,y:0,width:740,height:280};}
 focus(options){this.ownerDocument.activeElement=this;focusCalls.push({node:this,options});}
 querySelectorAll(selector){return walk(this).filter(n=>n!==this&&(selector==='summary'?n.localName==='summary':selector==='svg text'?n.localName==='text'&&n.ownerSVGElement:selector==='.f-rank-row[role="button"][tabindex="0"]'&&hasClass(n,'f-rank-row')&&n.getAttribute('role')==='button'&&n.getAttribute('tabindex')==='0'));}
 querySelector(selector){return this.querySelectorAll(selector)[0]??null;}
 getRootNode(){return this.ownerDocument;} contains(n){return n===this||this.childNodes.some(c=>c.contains?.(n));}
 closest(selector){for(let n=this;n;n=n.parentElement)if(selector.startsWith('[')&&n.getAttribute(selector.slice(1,-1))!==null)return n;return null;}
}
class FakeSVG extends FakeElement{}
const doc=Object.assign(new EventTarget(),{nodeType:9,createElement(name){return new FakeElement(name,this);},createElementNS(ns,name){return new FakeSVG(name,this,ns);},createTextNode(text){return {nodeType:3,nodeValue:text,ownerDocument:this,get textContent(){return this.nodeValue;},set textContent(value){this.nodeValue=value;}};},activeElement:null});
doc.documentElement=doc.createElement('html');doc.body=doc.createElement('body');doc.documentElement.scrollLeft=doc.documentElement.scrollTop=doc.body.scrollLeft=doc.body.scrollTop=0;
const preference=Object.assign(new EventTarget(),{matches:false});
const desktopViewport=Object.assign(new EventTarget(),{matches:false});
const win=Object.assign(new EventTarget(),{document:doc,HTMLElement:FakeElement,SVGElement:FakeSVG,HTMLIFrameElement:class{},location:{protocol:'http:'},matchMedia:query=>query.includes('max-width')?desktopViewport:preference,getComputedStyle:n=>n.style});doc.defaultView=win;
Object.assign(globalThis,{window:win,document:doc,Element:FakeElement,HTMLElement:FakeElement,SVGElement:FakeSVG,SVGSVGElement:FakeSVG,performance:{now:()=>now},requestAnimationFrame:cb=>{const id=++nextFrame;frames.set(id,cb);return id;},cancelAnimationFrame:id=>frames.delete(id)});
win.requestAnimationFrame=globalThis.requestAnimationFrame;
globalThis.IntersectionObserver=class{constructor(cb,options){this.cb=cb;this.targets=new Set();observers.add(this);}observe(n){this.targets.add(n);}unobserve(n){this.targets.delete(n);}disconnect(){observers.delete(this);}};
const React=await import('react'),jsx=await import('react/jsx-runtime'),Motion=await import('motion/react'),ts=await import('typescript');
const {createRoot}=await import('react-dom/client'),reactDom=await import('react-dom'),{flushSync}=reactDom;
const reactQuery=await import('@tanstack/react-query');
const chartsPath=process.argv[2]??fileURLToPath(new URL('../src/pages/AnalyticsPage/AnalyticsV4Charts.tsx',import.meta.url));
const animations=[];
const motionApi={...Motion,animate(value,target,options){const control=Motion.animate(value,target,options);animations.push({value,target,options,control});return control;}};
const moduleCache=new Map();
function load(path){
 if(moduleCache.has(path))return moduleCache.get(path);
 const source=readFileSync(path,'utf8').replaceAll('import.meta.env.DEV','false');
 const code=ts.default.transpileModule(source,{compilerOptions:{module:ts.default.ModuleKind.CommonJS,target:ts.default.ScriptTarget.ES2022,jsx:ts.default.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};moduleCache.set(path,module.exports);
 new Function('exports','require',code)(module.exports,n=>n==='react'?React:n==='react/jsx-runtime'?jsx:n==='react-dom'?reactDom:n==='react-router-dom'?{Link:({children})=>children}:n==='@tanstack/react-query'?reactQuery:n==='motion/react'?motionApi:n.endsWith('.module.css')?{__esModule:true,default:new Proxy({},{get:(_,key)=>String(key)})}:n.endsWith('.css')?{}:n.startsWith('.')?load([resolve(dirname(path),n+'.ts'),resolve(dirname(path),n+'.tsx')].find(existsSync)??assert.fail(n)):assert.fail(n));
 return module.exports;
}
const module={exports:load(chartsPath)};
const rootNode=doc.createElement('div'),root=createRoot(rootNode);
const walk=n=>[n,...(n.childNodes??[]).flatMap(walk)];
const props={series:[{id:'a',name:'A',values:[100,200]}],labels:['2026-09','2026-10']};
flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(module.exports.Chart,props))));
await new Promise(setImmediate);
// Browser RAF runs in a later task, after event-loop microtasks clear Motion time.
async function frame(ms){await Promise.resolve();now=Math.max(ms,lastFrame+0.001);lastFrame=now;const callbacks=[...frames.values()];frames.clear();for(const cb of callbacks)cb(now);await new Promise(setImmediate);}
const poly=walk(rootNode).find(n=>n.localName==='polyline');
const circles=walk(rootNode).filter(n=>n.localName==='circle');
const state=()=>({motionPathLength:Motion.visualElementStore.get(poly).getValue('pathLength').get(),svgPathLength:poly.getAttribute('pathLength'),dash:poly.getAttribute('stroke-dasharray'),dots:circles.map(n=>Number(n.style.opacity))});
const before=state();
assert.equal(before.motionPathLength,0);assert.equal(before.svgPathLength,'1');assert.equal(before.dash,'0 1');
assert.deepEqual(before.dots,[0,0]);assert.equal(observers.size,1);
assert.ok(!writes.some(([key,value])=>key==='stroke-dasharray'&&value==='1 1'),'no completed stroke is written before viewport entry');
const viewport=walk(rootNode).find(n=>n.getAttribute?.('class')==='chart-scroll');
assert.ok([...observers][0].targets.has(viewport),'the real scroll container is observed through the attached descendant ref');
for(const o of observers)o.cb([{target:viewport,isIntersecting:true}]);
await frame(0);const entry=state();assert.equal(entry.motionPathLength,0);assert.equal(entry.dash,'0 1');
await frame(325);const middle=state();assert.ok(middle.motionPathLength>0&&middle.motionPathLength<1);
assert.ok(parseFloat(middle.dash)>0&&parseFloat(middle.dash)<1);assert.deepEqual(middle.dots,[1,0]);
await frame(650);const complete=state();assert.equal(complete.motionPathLength,1);assert.equal(complete.dash,'1 1');assert.deepEqual(complete.dots,[1,1]);
for(const o of observers){o.cb([{target:viewport,isIntersecting:false}]);o.cb([{target:viewport,isIntersecting:true}]);}
await frame(700);assert.equal(state().dash,'1 1','re-entry never restarts');
const oldPoints=poly.getAttribute('points');
flushSync(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(module.exports.Chart,{...props,series:[{id:'a',name:'A',values:[140,200]}]}))));
await frame(850);const movingPoints=poly.getAttribute('points');assert.notEqual(movingPoints,oldPoints);
const vertices=movingPoints.split(' ').map(pair=>pair.split(',').map(Number));
assert.equal(Number(circles[0].getAttribute('cy')),vertices[0][1],'rendered dot follows rendered line');
const area=walk(rootNode).find(n=>n.localName==='polygon');
assert.ok(area.getAttribute('points').includes(movingPoints),'gradient follows the same intermediate vertices');
assert.ok(walk(rootNode).indexOf(area)<walk(rootNode).indexOf(poly),'fill layers precede the strokes');
preference.matches=true;preference.dispatchEvent(new Event('change'));await frame(850);
const expectedY=36+196*(1-140/240);assert.equal(Number(circles[0].getAttribute('cy')),expectedY,'live reduce snaps actual SVG coordinates');
assert.equal(state().dash,'1 1');
flushSync(()=>root.unmount());assert.equal(observers.size,0);
// A new chart with reduce already enabled must be complete on its first commit.
const reducedNode=doc.createElement('div'),reducedRoot=createRoot(reducedNode);
flushSync(()=>reducedRoot.render(React.createElement(React.StrictMode,null,React.createElement(module.exports.Chart,props))));
const reducedLine=walk(reducedNode).find(n=>n.localName==='polyline');assert.equal(reducedLine.getAttribute('stroke-dasharray'),'1 1');
flushSync(()=>reducedRoot.unmount());assert.equal(observers.size,0);
console.log('Line client DOM model (real React StrictMode + Motion 14): before/entry/middle/end pathLength/dash/dot states, no initial completed-stroke write, re-entry, 300ms update and live reduce PASS. Browser paint/CSS/scroll unverified.');
console.log(JSON.stringify({before,entry,middle,complete}));

// Interaction handlers run through real React state/effects and Motion DOM writes.
// Direct handler calls intentionally do not claim native pointer/focus/touch dispatch.
const globalListenerBaseline={resize:getEventListeners(win,'resize').length,scroll:getEventListeners(win,'scroll').length};
const eventProps=node=>node[Object.keys(node).find(key=>key.startsWith('__reactProps$'))];
const interactionNode=doc.createElement('div'),interactionRoot=createRoot(interactionNode);
const renderInteraction=props=>flushSync(()=>interactionRoot.render(React.createElement(React.StrictMode,null,React.createElement(module.exports.Chart,props))));
const query=(className)=>walk(interactionNode).filter(n=>n.getAttribute?.('class')===className);
const fire=(node,name,extra={})=>flushSync(()=>eventProps(node)[name]({currentTarget:node,clientX:700,clientY:200,pointerType:'mouse',preventDefault(){},stopPropagation(){},...extra}));
const badge=()=>query('chart-point-badge')[0];
const hit=()=>query('chart-point-hit');
const enterViewport=()=>{for(const observer of observers)for(const target of observer.targets)observer.cb([{target,isIntersecting:true}]);};
const multi={series:[{id:'power',name:'電気',values:[100,200,50,0,0,120]},{id:'water',name:'水道',values:[80,40,90,100,0,60]}],labels:['2026-05','2026-06','2026-07','2026-08','2026-09','2026-10'],readable:true};
preference.matches=false;
renderInteraction(multi);await new Promise(setImmediate);
assert.equal(hit().length,12);
const chartElements=walk(interactionNode),areas=chartElements.filter(n=>n.localName==='polygon'),strokes=chartElements.filter(n=>n.localName==='polyline');
assert.ok(areas.every(area=>chartElements.indexOf(area)<chartElements.indexOf(strokes[0])),'every series fill stays behind every stroke/dot');
assert.equal(badge().getAttribute('aria-hidden'),'true');
const entranceLine=walk(interactionNode).find(n=>n.localName==='polyline');
assert.equal(entranceLine.getAttribute('stroke-dasharray'),'0 1');
fire(hit()[1],'onPointerEnter');
assert.match(badge().textContent,/2026年6月.*電気.*¥200.*↑ \+100.00%.*増加/);
assert.equal(hit()[1].getAttribute('aria-pressed'),'true');assert.ok(hit()[1].getAttribute('aria-describedby'));
assert.equal(entranceLine.getAttribute('stroke-dasharray'),'0 1','hover cannot start the entrance');
enterViewport();await frame(900);await frame(990);
let dots=walk(interactionNode).filter(n=>n.localName==='circle');
assert.ok(Number(dots[1].getAttribute('r'))>4&&Number(dots[1].getAttribute('r'))<7,'hover radius has an intermediate frame');
await frame(1080);assert.equal(Number(dots[1].getAttribute('r')),7);
assert.equal(badge().style.visibility,'visible');assert.equal(Number(badge().style.opacity),1);
const contentBefore=badge().childNodes[0];
interactionNode.setAttribute('data-theme','dark');
renderInteraction({...multi,series:multi.series.map(s=>({...s,values:[...s.values]}))});
assert.equal(badge().getAttribute('aria-hidden'),'false');
assert.equal(Motion.visualElementStore.get(contentBefore).getValue('opacity').isAnimating(),false,'theme/same values do not restart content');
const badgeVisual=Motion.visualElementStore.get(badge());
const badgeX=badgeVisual.getValue('x'),badgeY=badgeVisual.getValue('y');
assert.ok(badgeX.get()>=8&&badgeX.get()+220<=732);assert.ok(badgeY.get()>=8&&badgeY.get()+116<=272);
// Continuous pointer changes animate from the current position, with no setState per move.
fire(hit()[1],'onPointerMove',{clientX:20,clientY:20});
await frame(1120);const intermediateX=badgeX.get();assert.ok(intermediateX>8&&intermediateX<512);
fire(hit()[1],'onPointerMove',{clientX:400,clientY:180});await frame(1160);await frame(1300);
assert.equal(badgeX.get(),414);assert.equal(badgeY.get(),50);
fire(hit()[2],'onPointerEnter',{clientX:480});
assert.match(badge().textContent,/¥50.*↓ −75.00%.*減少/);
assert.equal(query('chart-point-change')[0].getAttribute('data-direction'),'decrease');
assert.equal(badgeVisual.getValue('x').get(),414,'switching points starts from displayed position');
badge().measuredWidth=360;fire(hit()[7],'onPointerEnter');
assert.ok(badgeX.get()+360<=732,'wider content clamps the displayed origin before interpolation');
badge().measuredWidth=220;
fire(hit()[7],'onPointerEnter');assert.match(badge().textContent,/水道.*¥40.*−50.00%/);
fire(hit()[0],'onPointerEnter');assert.match(badge().textContent,/比較不可/);assert.equal(query('chart-point-change')[0].getAttribute('data-direction'),'unavailable');
fire(hit()[4],'onPointerEnter');assert.match(badge().textContent,/変化なし.*両月の支出なし/);assert.equal(query('chart-point-change')[0].getAttribute('data-direction'),'unavailable');
fire(hit()[5],'onPointerEnter');assert.match(badge().textContent,/前月の支出なし.*比較不可/);
// Mouse exit fades the badge and returns only the selected dot to radius 4.
fire(hit()[5],'onPointerLeave');await frame(1320);await frame(1500);
assert.equal(badge().style.visibility,'hidden');assert.equal(badge().getAttribute('aria-hidden'),'true');
assert.ok(walk(interactionNode).filter(n=>n.localName==='circle').every(n=>Number(n.getAttribute('r'))===4));
// Touch enter does not synthesize hover; tap selects and outside tap clears.
fire(hit()[2],'onPointerEnter',{pointerType:'touch'});assert.equal(badge().getAttribute('aria-hidden'),'true');
fire(hit()[2],'onPointerUp',{pointerType:'touch'});assert.equal(badge().getAttribute('aria-hidden'),'false');
fire(hit()[2],'onPointerLeave',{pointerType:'touch'});assert.equal(badge().getAttribute('aria-hidden'),'false');
flushSync(()=>doc.dispatchEvent(new Event('pointerdown')));assert.equal(badge().getAttribute('aria-hidden'),'true');
fire(hit()[1],'onFocus');assert.equal(badge().getAttribute('aria-hidden'),'false');
fire(hit()[1],'onKeyDown',{key:'Escape'});assert.equal(badge().getAttribute('aria-hidden'),'true');
fire(hit()[2],'onFocus');assert.match(badge().textContent,/¥50/);
fire(hit()[2],'onBlur');assert.equal(badge().getAttribute('aria-hidden'),'true');
fire(hit()[1],'onKeyDown',{key:' '});assert.equal(badge().getAttribute('aria-hidden'),'false');
flushSync(()=>win.dispatchEvent(new Event('scroll')));assert.equal(badge().getAttribute('aria-hidden'),'true');
fire(hit()[1],'onFocus');flushSync(()=>win.dispatchEvent(new Event('resize')));assert.equal(badge().getAttribute('aria-hidden'),'true');
// A live reduced-motion change completes radius, position, badge and content animations.
fire(hit()[1],'onPointerEnter',{clientX:30});await frame(1520);
flushSync(()=>{preference.matches=true;preference.dispatchEvent(new Event('change'));});await frame(1520);
assert.equal(Number(walk(interactionNode).filter(n=>n.localName==='circle')[1].getAttribute('r')),7);
assert.equal(Number(badge().style.opacity),1);assert.equal(badgeX.isAnimating(),false);assert.equal(badgeY.isAnimating(),false);
const content=badge().childNodes[0],contentVisual=Motion.visualElementStore.get(content);
assert.equal(Number(content.style.opacity),1);assert.equal(contentVisual.getValue('opacity').isAnimating(),false);
assert.equal(entranceLine.getAttribute('stroke-dasharray'),'1 1');
fire(hit()[1],'onPointerLeave');await frame(1520);assert.equal(badge().style.visibility,'hidden');
fire(hit()[1],'onFocus');renderInteraction({...multi,series:[{...multi.series[0],values:[100,180,50,0,0,120]},multi.series[1]]});
assert.equal(badge().textContent,'','new data clears the old badge in the first commit');await frame(1520);assert.equal(badge().style.visibility,'hidden');
renderInteraction(multi);assert.equal(badge().textContent,'','A → B → A does not restore the old selection');
fire(hit()[1],'onFocus');assert.match(badge().textContent,/¥200/);
flushSync(()=>interactionRoot.render(React.createElement('div',null,'Loading')));
assert.equal(query('chart-point-badge').length,0);assert.equal(observers.size,0,'result unmount discards observers and tooltip');
// Each supported span exposes both edge points; all remain accurate with reduced motion.
for(const length of [1,6,12,24]){
 const labels=Array.from({length},(_,i)=>`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
 renderInteraction({series:[{id:'span',name:'期間',values:Array.from({length},(_,i)=>100+i)}],labels});
 assert.equal(hit().length,length);
 for(const index of new Set([0,length-1])){fire(hit()[index],'onFocus');assert.match(badge().textContent,new RegExp(`¥${100+index}`));}
}
// Use the real result component to check each invalidated state after selection.
const dedicated=load(resolve(dirname(chartsPath),'DedicatedAnalytics.tsx'));
const data={excludedProjects:[],totalExpense:300,expenseCount:2,monthlyTrend:[{month:'2026-09',totalExpense:100,expenseCount:1},{month:'2026-10',totalExpense:200,expenseCount:1}],endMonthComparison:{month:'2026-10',previousMonth:'2026-09',totalExpense:200,previousTotalExpense:100,difference:100,percentageChange:'100.00'},categoryBreakdown:[{category:'FOOD',totalExpense:300}],projectComparison:[{publicToken:'p',name:'生活費',totalExpense:300,expenseCount:2}]};
const renderResult=state=>flushSync(()=>interactionRoot.render(React.createElement(dedicated.DedicatedAnalytics,{state,categoryView:'bars',onCategoryViewChange(){}})));
for(const status of ['loading','error','accessInvalidated']){
 renderResult({status:'ready',data});fire(hit()[1],'onFocus');assert.match(badge().textContent,/¥200/);
 renderResult({status,data,onRetry(){}});assert.equal(query('chart-point-badge').length,0);assert.ok(!interactionNode.textContent.includes('¥200'));assert.equal(observers.size,0);
}
flushSync(()=>interactionRoot.unmount());assert.equal(observers.size,0);
const interactionResult='Line interaction DOM model: hover/radius frames, cursor retarget/clamp, series/month/rate identities, leave/touch/focus/Escape/blur, live reduce, data/unmount purge and 1/6/12/24 spans PASS. Native events, real CSS layout/clipping and browser paint unverified.';

for(const [target,events] of [[doc,['pointerdown','keydown']],[win,['scroll','resize']],[preference,['change']]])for(const event of events)assert.equal(getEventListeners(target,event).length,target===win?(globalListenerBaseline[event]??0):0,`${event} chart listeners are removed after unmount/StrictMode (shared Motion listeners unchanged)`);
console.log(interactionResult);

// Reworked donut: complete normalized rings morph continuously by stable ID.
setMaxListeners(100,preference,doc,win);
const compositionNode=doc.createElement('div'),compositionRoot=createRoot(compositionNode);
const renderComposition=element=>{now+=0.01;flushSync(()=>compositionRoot.render(React.createElement(React.StrictMode,null,element)));};
const tick=async ms=>frame(now+ms);
const setPreference=async matches=>{await Promise.resolve();now+=0.01;flushSync(()=>{preference.matches=matches;preference.dispatchEvent(new Event('change'));});};
const hasClass=(node,name)=>(node.getAttribute?.('class')??'').split(' ').includes(name);
const arcs=()=>walk(compositionNode).filter(n=>n.localName==='circle'&&n.getAttribute('r')==='64');
const donutSvg=()=>arcs()[0]?.ownerSVGElement;
const C=2*Math.PI*64;
function arcState(){return arcs().map(n=>({node:n,id:n.getAttribute('data-category-id'),start:-Number(n.getAttribute('stroke-dashoffset')),length:Number(n.getAttribute('stroke-dasharray').split(' ')[0]),gap:Number(n.getAttribute('stroke-dasharray').split(' ')[1]),color:n.getAttribute('stroke')}));}
function coherent(){
 const segments=arcState();let end=0,total=0;
 for(const segment of segments){assert.ok(segment.length>=-1e-9);assert.ok(Math.abs(segment.start-end)<1e-8,'shared normalized boundaries have no overlaps/gaps');assert.ok(Math.abs(segment.length+segment.gap-C)<1e-8);assert.equal(segment.node.getAttribute('pathLength'),null,'native dash values never use pathLength normalization');end=segment.start+segment.length;total+=segment.length;}
 assert.ok(Math.abs(total-C)<1e-8,`complete circle sum ${total} equals ${C}`);return segments;
}
const rankRows=(a=60,b=30,c=10)=>[{id:'a',name:'食費',amount:a,color:'--c1'},{id:'b',name:'光熱費',amount:b,color:'--c2'},{id:null,name:'未分類',amount:c,color:'--c3'}];
const renderRank=(rows=rankRows(),combined=true)=>renderComposition(React.createElement(module.exports.Rank,{rows,total:rows.reduce((a,b)=>a+b.amount,0),donut:true,combined}));
const observeTarget=(target,visible)=>{now+=0.01;for(const observer of [...observers])if(observer.targets.has(target))observer.cb([{target,isIntersecting:visible}]);};
const tracks=()=>walk(compositionNode).filter(n=>hasClass(n,'f-track'));
const isCompositionAnimation=a=>a.options.duration===.6&&a.options.ease==='easeInOut';
const category=(id)=>arcState().find(s=>s.id===id);
preference.matches=false;
let count=animations.filter(isCompositionAnimation).length;
renderRank();await tick(16);coherent();assert.ok(compositionNode.textContent.includes('¥100'));
assert.equal(observers.size,4,'Current has one SVG observer and three independent Rank tracks');
assert.equal(animations.filter(isCompositionAnimation).length,count,'initial render is complete without wipe');
await tick(200);coherent();assert.ok(tracks().every(n=>n.childNodes[0].style.width==='0%'),'Phase 2A still waits for its own viewport');
renderRank(rankRows(35,34,31));await tick(16);coherent();assert.ok(Math.abs(category('a').length/C-.35)<1e-10);
observeTarget(donutSvg(),true);await tick(16);coherent();assert.equal(animations.filter(isCompositionAnimation).length,count,'viewport entry never clears/replays the ring');
const stableNodes=arcs(),stableSvg=donutSvg();
renderRank(rankRows(88,9,3));await tick(0);
assert.deepEqual(arcs(),stableNodes);let boundaryAnimation=animations.findLast(isCompositionAnimation);assert.ok(boundaryAnimation);assert.ok(compositionNode.textContent.includes('88.0%'));
for(let i=0;i<6;i++){await tick(50);coherent();}
assert.ok(category('a').length>.35*C&&category('a').length<.88*C,'intermediate dominant frame has moved boundaries');
const inFlight=boundaryAnimation.value.get(),animationCount=animations.filter(isCompositionAnimation).length;compositionNode.setAttribute('data-theme','dark');renderRank(rankRows(88,9,3));await tick(16);coherent();assert.ok(boundaryAnimation.value.get()>inFlight);assert.equal(animations.filter(isCompositionAnimation).length,animationCount,'same data/theme during animation does not restart progress');
const displayed=category('a').length,obsolete=boundaryAnimation;
renderRank(rankRows(0,0,60));await tick(0);coherent();assert.ok(Math.abs(category('a').length-displayed)<1e-8,'retarget starts from displayed normalized boundaries');assert.ok(compositionNode.textContent.includes('¥60'),'center immediately shows latest exact total');
const derived=()=>arcs().map(n=>[Motion.visualElementStore.get(n).getValue('strokeDasharray').get(),Motion.visualElementStore.get(n).getValue('strokeDashoffset').get()]);
Motion.frameSteps.preRender.process({timestamp:now,delta:16,isProcessing:true});const beforeObsolete=derived();obsolete.options.onUpdate(1);Motion.frameSteps.preRender.process({timestamp:now,delta:16,isProcessing:true});assert.deepEqual(derived(),beforeObsolete,'a queued obsolete callback cannot overwrite new boundaries');
for(let i=0;i<12;i++){await tick(50);coherent();}
assert.ok(Math.abs(category('unclassified').length-C)<1e-8);assert.equal(category('a').length,0);assert.equal(category('b').length,0);assert.deepEqual(arcs(),stableNodes,'rank order changes do not remount arcs');
assert.equal(arcState()[0].id,'a','circle order is stable, not amount order');
const legend=walk(compositionNode).filter(n=>hasClass(n,'f-rank-row'));assert.equal(legend[0].getAttribute('data-key'),'unclassified','legend still sorts by amount');
renderRank(rankRows(30,30,30));await tick(0);await tick(150);coherent();
renderRank(rankRows(90,5,5));await tick(0);await tick(100);coherent();renderRank(rankRows(30,30,30));await tick(0);
for(let i=0;i<12;i++){await tick(50);coherent();}await tick(700);assert.ok(Math.abs(category('a').length-C/3)<1e-8,'old completion cannot restore an obsolete target');
count=animations.filter(isCompositionAnimation).length;compositionNode.setAttribute('data-theme','dark');renderRank(rankRows(60,60,60));await tick(16);coherent();assert.equal(animations.filter(isCompositionAnimation).length,count,'same ratios/theme only update exact text');
observeTarget(donutSvg(),false);renderRank(rankRows(20,70,10));await tick(16);coherent();assert.ok(Math.abs(category('b').length-.7*C)<1e-8);observeTarget(donutSvg(),true);await tick(16);assert.equal(animations.filter(isCompositionAnimation).length,count,'offscreen update snaps and re-entry does not replay');
const added={id:'new',name:'追加',amount:50,color:'--c4'};
renderRank([...rankRows(20,70,10),added]);await tick(0);coherent();assert.equal(donutSvg(),stableSvg);assert.equal(category('new').length,0,'new ID starts from zero without reducing total circumference');
for(let i=0;i<12;i++){await tick(50);coherent();}assert.ok(Math.abs(category('new').length-C/3)<1e-8);
const bNode=category('b').node,newNode=category('new').node;
renderRank([rankRows(20,70,10)[0],rankRows(20,70,10)[2],added]);await tick(0);coherent();assert.equal(category('b').node,bNode);assert.equal(bNode.getAttribute('aria-hidden'),'true');assert.equal(bNode.textContent,'','removed ID does not retain old accessible values');
await tick(150);coherent();assert.ok(category('b').length>0,'removed ID shrinks through intermediate geometry');await tick(450);coherent();assert.equal(category('b').length,0);assert.equal(category('new').node,newNode);
renderRank([...rankRows(20,70,10),added]);await tick(0);coherent();assert.equal(category('b').node,bNode,'re-added category keeps its own ID slot');await tick(600);coherent();
for(const track of tracks())observeTarget(track,true);await tick(0);await tick(275);assert.ok(tracks().some(n=>parseFloat(n.childNodes[0].style.width)>0));await tick(275);coherent();
renderRank(rankRows(80,15,5));await tick(0);await tick(100);coherent();await setPreference(true);await tick(16);coherent();assert.ok(Math.abs(category('a').length-.8*C)<1e-8);assert.ok(animations.every(a=>!a.value.isAnimating()),'live reduce stops ring and Rank controls');
renderRank(rankRows(0,0,0));await tick(16);assert.equal(arcs().length,0);assert.equal(observers.size,0);assert.match(compositionNode.textContent,/合計 ¥0・0件/);
count=animations.length;renderRank([{id:null,name:'未分類',amount:100,color:'--c3'}],false);await tick(16);coherent();assert.equal(arcs().length,1);assert.equal(arcState()[0].length,C);assert.equal(animations.length,count);
// A known ID keeps its slot/color role; only ambiguous duplicate IDs fall back.
await setPreference(false);
renderComposition(React.createElement('div'));renderRank(rankRows(),false);await tick(16);observeTarget(donutSvg(),true);await tick(16);count=animations.filter(isCompositionAnimation).length;
renderRank(rankRows(80,15,5).map(row=>row.id==='a'?{...row,color:'--c4'}:row),false);await tick(0);await tick(150);coherent();assert.ok(category('a').length>.6*C&&category('a').length<.8*C);assert.equal(category('a').color,'var(--c4)');await tick(450);coherent();assert.ok(Math.abs(category('a').length-.8*C)<1e-8);
const duplicateTree=module.exports.Rank({rows:[{id:'same',name:'A',amount:60},{id:'same',name:'B',amount:40}],total:100,donut:true});
const duplicateDonut=findElement(duplicateTree,n=>n.type?.name==='Donut');renderComposition(duplicateDonut);await tick(16);coherent();assert.equal(observers.size,0);assert.ok(arcs().every(n=>!Motion.visualElementStore.has(n)),'ambiguous identities get a static completed SVG');
renderComposition(React.createElement('div'));const savedObserver=globalThis.IntersectionObserver;delete globalThis.IntersectionObserver;renderRank(rankRows(),false);await tick(16);coherent();globalThis.IntersectionObserver=savedObserver;
for(const status of ['loading','error','accessInvalidated']){
 renderComposition(React.createElement(dedicated.DedicatedAnalytics,{state:{status:'ready',data},categoryView:'bars',onCategoryViewChange(){}}));
 for(const observer of [...observers])for(const target of observer.targets)observer.cb([{target,isIntersecting:true}]);await tick(16);await tick(100);
 renderComposition(React.createElement(dedicated.DedicatedAnalytics,{state:{status,data,onRetry(){}},categoryView:'bars',onCategoryViewChange(){}}));assert.equal(arcs().length,0);assert.equal(observers.size,0);assert.ok(animations.every(a=>!a.value.isAnimating()));assert.ok(!compositionNode.textContent.includes('¥300'));
}
flushSync(()=>compositionRoot.unmount());assert.equal(observers.size,0);
console.log('Donut DOM model: complete first/re-entry rings, 600ms easeInOut normalized boundary frames, balanced/dominant/zero and repeated retarget, rank/ID/add/remove/restore, exact text, offscreen/theme/reduce, Current Rank independence PASS. Browser/video parity unverified.');
// Resolve the existing private DeltaCard through its public preview element tree;
// no production export, fixture mutation or replacement aggregation is needed.
const futurePreview=load(resolve(dirname(chartsPath),'AnalyticsFuturePreview.tsx'));
function findElement(node,test){
 if(!React.isValidElement(node))return null;if(test(node))return node;
 for(const child of React.Children.toArray(node.props.children)){const match=findElement(child,test);if(match)return match;}return null;
}
function deltaElement(end='2026-10',scenario='normal',tab='all',projectTokens=['p1','p2','p3']){
 const preview=futurePreview.AnalyticsFuturePreview({selection:{projectTokens,startMonth:end,endMonth:end},scenario,tab,pro:true,onTab(){},onPro(){},view:'donut',onView(){},views:{year:'total',member:'p1'},onViews(){}});
 const utilities=findElement(preview,n=>n.type?.name==='UtilitiesPage');
 return findElement(utilities?utilities.type(utilities.props):preview,n=>n.type?.name==='DeltaCard');
}
function deltaSpec(element){const card=element.type(element.props);return {card,rows:React.Children.toArray(card.props.children).filter(n=>n.props.className==='delta-row').map(row=>({element:row,key:row.key,name:row.props.children[0].props.children,bar:findElement(row,n=>n.type?.name==='RankBar')}))};}
const deltaNode=doc.createElement('div'),deltaRoot=createRoot(deltaNode);
const renderDelta=element=>{now+=0.01;flushSync(()=>deltaRoot.render(React.createElement(React.StrictMode,null,element)));};
const deltaTracks=()=>walk(deltaNode).filter(n=>hasClass(n,'delta-track'));
const deltaDomRows=()=>walk(deltaNode).filter(n=>hasClass(n,'delta-row'));
const deltaMap=()=>new Map(deltaDomRows().map(row=>[row.childNodes[0].textContent,{track:row.childNodes[1],span:row.childNodes[1].childNodes[0],text:row.childNodes[2].textContent}]));
const enterDelta=()=>{for(const track of deltaTracks())observeTarget(track,true);};
preference.matches=false;
let element=deltaElement(),spec=deltaSpec(element);renderDelta(element);await tick(16);
assert.equal(deltaTracks().length,8);assert.ok(deltaTracks().every(track=>track.childNodes[0].style.width==='0%'));
let beforeAnimations=animations.length;enterDelta();await tick(0);
let deltaAnimations=animations.slice(beforeAnimations);assert.ok(deltaAnimations.length>0);assert.ok(deltaAnimations.every(a=>a.options.duration===.55&&a.options.ease==='easeOut'));
await tick(275);assert.ok(deltaTracks().some(track=>parseFloat(track.childNodes[0].style.width)>0&&parseFloat(track.childNodes[0].style.width)<100));
await tick(275);let dom=deltaMap();
for(const row of spec.rows){assert.equal(dom.get(row.name).span.style.width,row.bar.props.target);assert.equal(dom.get(row.name).span.style.background,row.bar.props.color);assert.match(row.key,/all/);}
beforeAnimations=animations.length;deltaNode.setAttribute('data-theme','dark');renderDelta(element);await tick(16);
for(const track of deltaTracks()){observeTarget(track,false);observeTarget(track,true);}await tick(16);
assert.equal(animations.length,beforeAnimations,'same value/theme/re-entry never restarts Delta bars');
// Find real frozen-fixture variants exhibiting both a same-sign update and a sign flip.
const variants=Array.from({length:10},(_,i)=>{const element=deltaElement(`2026-${String(i+1).padStart(2,'0')}`);return {element,...deltaSpec(element)};});
let compatible,flip;
for(const first of variants)for(const second of variants)for(const row of first.rows){const next=second.rows.find(n=>n.name===row.name);if(!next||row.bar.props.target===next.bar.props.target||row.bar.props.target==='0%'||next.bar.props.target==='0%')continue;if(row.bar.key===next.bar.key)compatible??={first,second,row,next};else flip??={first,second,row,next};}
assert.ok(compatible,'real fixture has a same-sign magnitude change');assert.ok(flip,'real fixture has a positive/negative switch');
// Mount the same-sign case, then update from the displayed width and interrupt it.
renderDelta(compatible.first.element);await tick(16);enterDelta();await tick(550);
let old=deltaMap().get(compatible.row.name),oldWidth=parseFloat(old.span.style.width);beforeAnimations=animations.length;
renderDelta(compatible.second.element);await tick(0);assert.equal(deltaMap().get(compatible.row.name).span,old.span);
deltaAnimations=animations.slice(beforeAnimations).filter(a=>a.options.duration===.25);assert.ok(deltaAnimations.length>0);
await tick(100);const during=parseFloat(old.span.style.width),goal=parseFloat(compatible.next.bar.props.target);assert.ok(during>Math.min(oldWidth,goal)&&during<Math.max(oldWidth,goal));
renderDelta(compatible.first.element);await tick(0);await tick(250);assert.equal(old.span.style.width,compatible.row.bar.props.target);
await tick(500);assert.equal(old.span.style.width,compatible.row.bar.props.target,'obsolete completion cannot restore a previous width');
for(const track of deltaTracks())observeTarget(track,false);beforeAnimations=animations.length;
renderDelta(compatible.second.element);await tick(16);assert.equal(deltaMap().get(compatible.row.name).span.style.width,compatible.next.bar.props.target,'entered offscreen same-sign updates snap to the latest width');
assert.equal(animations.length,beforeAnimations);
// A sign switch removes the old fill and starts a fresh fill with the new sign/color.
renderDelta(flip.first.element);await tick(16);enterDelta();await tick(550);old=deltaMap().get(flip.row.name);
renderDelta(flip.second.element);await tick(16);let next=deltaMap().get(flip.row.name);
assert.notEqual(next.span,old.span);assert.equal(next.span.style.width,'0%');assert.equal(next.span.style.background,flip.next.bar.props.color);
assert.ok(next.text.startsWith(flip.next.bar.props.color.includes('--negative')?'↓':'↑'));
enterDelta();await tick(0);await tick(100);
await setPreference(true);await tick(16);
assert.equal(next.span.style.width,flip.next.bar.props.target);assert.ok(animations.every(a=>!a.value.isAnimating()));
// Offscreen updates snap without animating; reduce and all-zero values stay static.
await setPreference(false);for(const track of deltaTracks())observeTarget(track,false);beforeAnimations=animations.length;
renderDelta(flip.first.element);await tick(16);
assert.ok(animations.slice(beforeAnimations).every(a=>a.options.duration!==.25&&a.options.duration!==.55));
renderDelta(deltaElement('2026-10','empty'));await tick(16);assert.ok(deltaTracks().every(track=>track.childNodes[0].style.width==='0%'));assert.ok(deltaDomRows().every(row=>row.childNodes[2].textContent==='→ ¥0'));
const oldDeltaTracks=deltaTracks();element=deltaElement('2026-10','normal','utilities');spec=deltaSpec(element);renderDelta(element);await tick(16);assert.equal(deltaTracks().length,5);assert.ok(deltaTracks().every(track=>!oldDeltaTracks.includes(track)));assert.ok(spec.rows.every(row=>row.key.includes('utilities')));
// Category add/remove/reorder uses the actual keyed row elements; retained rows
// keep their fills, removed ones stop, newly added ones start unplayed.
const card=spec.card,rows=spec.rows.map(row=>row.element);
renderDelta(React.cloneElement(card,undefined,rows.slice(0,3)));await tick(16);enterDelta();await tick(100);const retained=deltaMap().get(spec.rows[0].name).span;
renderDelta(React.cloneElement(card,undefined,[rows[2],rows[0],rows[3]]));await tick(16);assert.equal(deltaTracks().length,3);assert.equal(deltaMap().get(spec.rows[0].name).span,retained);assert.equal(deltaMap().get(spec.rows[3].name).span.style.width,'0%');
// Basic/Pro and invalid-state unmounts release every active fill immediately.
for(const state of ['basic','loading','error','accessInvalidated']){
 renderDelta(deltaElement());await tick(16);enterDelta();await tick(80);
 renderDelta(state==='basic'?React.createElement('div',null,'Basic'):React.createElement(dedicated.DedicatedAnalytics,{state:{status:state,onRetry(){}},categoryView:'bars',onCategoryViewChange(){}}));
 assert.equal(deltaTracks().length,0);assert.equal(observers.size,0);assert.ok(animations.every(a=>!a.value.isAnimating()));
}
flushSync(()=>deltaRoot.unmount());assert.equal(observers.size,0);
for(const [target,events] of [[doc,['pointerdown','keydown']],[win,['scroll','resize']],[preference,['change']]])for(const event of events)assert.equal(getEventListeners(target,event).length,target===win?(globalListenerBaseline[event]??0):0,`${event} listeners clean up after all chart phases`);
console.log('Pro Delta DOM model: real private card/frozen data, 550ms entrance, 250ms current-width retarget, sign-key replacement, colors/exact text, all-zero, tab/category identity, offscreen/reduce/Basic/invalid-state unmount PASS. Browser paint/video match unverified.');

// Real Pro all/living wiring: amount-sorted rows and stable circles share data.
const unifiedNode=doc.createElement('div'),unifiedRoot=createRoot(unifiedNode);
const basePreview={selection:{projectTokens:['p1','p2','p3'],startMonth:'2026-05',endMonth:'2026-10'},scenario:'normal',tab:'all',pro:true,onTab(){},onPro(){},views:{year:'total',member:'p1'},onViews(){}};
const renderUnified=props=>{now+=.01;flushSync(()=>unifiedRoot.render(React.createElement(React.StrictMode,null,React.createElement(futurePreview.AnalyticsFuturePreview,props))));};
const unifiedCard=()=>walk(unifiedNode).find(n=>hasClass(n,'f-card')&&walk(n).some(h=>h.localName==='h2'&&h.textContent==='カテゴリ別支出'));
const unifiedArcs=()=>walk(unifiedCard()).filter(n=>n.localName==='circle'&&n.getAttribute('r')==='64');
for(const tab of ['all','living']){
 renderUnified({...basePreview,tab});await tick(16);
 let card=unifiedCard();assert.ok(walk(card).some(n=>hasClass(n,'current-category-layout')));assert.ok(!walk(card).some(n=>n.getAttribute?.('aria-label')==='カテゴリの表示形式'));
 const rows=walk(card).filter(n=>hasClass(n,'f-rank-row'));assert.equal(walk(card).filter(n=>hasClass(n,'f-track')).length,rows.length);
 for(const row of rows){const circle=unifiedArcs().find(n=>n.getAttribute('data-category-id')===row.getAttribute('data-key'));assert.ok(circle);assert.ok(circle.textContent.includes(row.childNodes[2].textContent));}
 const svg=unifiedArcs()[0].ownerSVGElement,ids=unifiedArcs().map(n=>n.getAttribute('data-category-id'));observeTarget(svg,true);await tick(0);await tick(1150);
 renderUnified({...basePreview,tab,selection:{...basePreview.selection,startMonth:'2026-10'}});await tick(0);assert.equal(unifiedArcs()[0].ownerSVGElement,svg);assert.deepEqual(unifiedArcs().map(n=>n.getAttribute('data-category-id')),ids);
 for(let i=0;i<15;i++){
  await tick(50);const sum=unifiedArcs().reduce((total,n)=>total+Number(n.getAttribute('stroke-dasharray').split(' ')[0]),0);assert.ok(Math.abs(sum-C)<1e-8);
  for(const hit of walk(unifiedCard()).filter(n=>hasClass(n,'linked-donut-hit'))){
    const circle=unifiedArcs().find(n=>n.getAttribute('data-category-id')===hit.getAttribute('data-category-control'));
    const start=-Number(circle.getAttribute('stroke-dashoffset'))/C,length=Number(circle.getAttribute('stroke-dasharray').split(' ')[0])/C;
    const tokens=hit.getAttribute('d').split(' ');
    if(length<=0){assert.equal(hit.getAttribute('d'),'M 80 80');continue;}
    for(const [x,y,fraction]of [[Number(tokens[1]),Number(tokens[2]),start],[Number(tokens.at(-2)),Number(tokens.at(-1)),start+length]]){
      assert.ok(Math.abs(x-(80+64*Math.cos(fraction*2*Math.PI)))<1e-8);assert.ok(Math.abs(y-(80+64*Math.sin(fraction*2*Math.PI)))<1e-8,'hit extent follows displayed normalized boundaries');
    }
  }
 }
 renderUnified({...basePreview,tab,pro:false});await tick(16);card=unifiedCard();assert.ok(!walk(card).some(n=>n.getAttribute?.('aria-label')==='カテゴリの表示形式'));assert.ok(unifiedArcs().length>0,'Basic shares combined linked graph');
}
// Exercise the real public Basic/Pro path, not a detached shared component.
const unifiedFire=async(node,event,extra)=>{now+=.01;fire(node,event,extra);await tick(0);};
const unifiedModel=load(resolve(dirname(chartsPath),'analyticsFuturePreviewData.ts'));
const unifiedLinked=load(resolve(dirname(chartsPath),'AnalyticsLinkedCategories.tsx'));
for(const pro of [false,true])for(const tab of ['all','utilities','living']){
 renderUnified({...basePreview,tab:'subscriptions',pro});await tick(16);
 renderUnified({...basePreview,tab,pro});await tick(16);
 const owner=()=>walk(unifiedNode).find(n=>n.getAttribute?.('data-linked-categories'));
 const nodes=()=>walk(owner()),arcs=()=>nodes().filter(n=>n.localName==='circle'&&n.getAttribute('r')==='64');
 const rows=()=>nodes().filter(n=>hasClass(n,'f-rank-row'));
 const source=unifiedModel.futureAnalysis(basePreview.selection,tab,'normal');
 const series=unifiedLinked.linkedCategorySeries(source,tab==='utilities'?'utility':'category');
 assert.ok(arcs().every(n=>parseFloat(n.getAttribute('stroke-dasharray'))===0));
 for(const observer of [...observers])for(const target of observer.targets)observeTarget(target,true);await tick(0);await tick(575);
 assert.ok(arcs().some(n=>parseFloat(n.getAttribute('stroke-dasharray'))>0));
 assert.ok(arcs().reduce((s,n)=>s+parseFloat(n.getAttribute('stroke-dasharray')),0)<C);
 await tick(575);assert.ok(Math.abs(arcs().reduce((s,n)=>s+parseFloat(n.getAttribute('stroke-dasharray')),0)-C)<1e-8);
 const check=values=>{
  const line=nodes().find(n=>n.localName==='polyline'),points=line.getAttribute('points').split(' ').map(p=>p.split(',').map(Number));
  const max=module.exports.chartAxis(Math.max(0,...values));
  values.forEach((v,i)=>assert.ok(Math.abs(points[i][1]-(36+196*(1-v/max)))<1e-4));
 };
 check(source.trend.map(r=>r.amount));
 const row=rows()[0],key=row.getAttribute('data-key');
 const selected=series.find(r=>(r.id??'unclassified')===key);
 await unifiedFire(row,'onFocus');await tick(180);assert.equal(row.getAttribute('aria-pressed'),'false');
 await unifiedFire(row,'onKeyDown',{key:'Enter',preventDefault(){}});await tick(320);check(selected.values);
 const second=rows()[1],next=series.find(r=>(r.id??'unclassified')===second.getAttribute('data-key'));
 await unifiedFire(second,'onClick');await tick(100);await unifiedFire(row,'onClick');await tick(320);check(selected.values);
 // Switching plans retains the shared graph instance and its selected category.
 const svg=arcs()[0].ownerSVGElement;renderUnified({...basePreview,tab,pro:!pro});await tick(16);assert.equal(arcs()[0].ownerSVGElement,svg);check(selected.values);
 const clear=nodes().find(n=>n.localName==='button'&&n.textContent==='選択解除');clear.focus();
 await unifiedFire(clear,'onClick',{detail:0,currentTarget:clear});await tick(320);check(source.trend.map(r=>r.amount));
 assert.equal(doc.activeElement,row,'keyboard clear restores the selected live row in Basic/Pro');assert.ok(owner().contains(doc.activeElement));
 await unifiedFire(row,'onKeyDown',{key:'Enter',preventDefault(){}});await tick(320);check(selected.values);
 const pointerClear=nodes().find(n=>n.localName==='button'&&n.textContent==='選択解除');pointerClear.focus();const focusCount=focusCalls.length;
 await unifiedFire(pointerClear,'onClick',{detail:1,currentTarget:pointerClear});await tick(320);assert.equal(focusCalls.length,focusCount,'pointer clear never forces focus');
 await setPreference(true);await unifiedFire(second,'onClick');await tick(16);check(next.values);await setPreference(false);
 for(const r of series)assert.equal(r.values.reduce((s,n)=>s+BigInt(n),0n),BigInt(r.amount));
}
console.log('Basic/Pro public paths: all/utilities/living waiting/partial/full donut, shared bars, focus/keyboard/select/switch/clear, rapid retarget, plan continuity, exact fixture totals and live reduce PASS. Native paint/input unverified.');
flushSync(()=>unifiedRoot.unmount());assert.equal(observers.size,0);assert.ok(animations.every(a=>!a.value.isAnimating()));
for(const [target,events] of [[doc,['pointerdown','keydown']],[win,['scroll','resize']],[preference,['change']]])for(const event of events)assert.equal(getEventListeners(target,event).length,target===win?(globalListenerBaseline[event]??0):0);
console.log('Pro unified category DOM model: all/living combine donut+bars with matching amounts/IDs, project/period update retains the SVG and a full circle, Basic shares linked combined graphs PASS. Native layout/paint unverified.');

{
// Linked categories use the real filtered fixture records, React state and SVG
// MotionValues. Calls below model handlers, not native pointer hit-testing.
const linkedFire=async(node,event,extra)=>{now+=.01;fire(node,event,extra);await tick(0);};
const linked=load(resolve(dirname(chartsPath),'AnalyticsLinkedCategories.tsx'));
const futureData=load(resolve(dirname(chartsPath),'analyticsFuturePreviewData.ts'));
const linkedNode=doc.createElement('div'),linkedRoot=createRoot(linkedNode);
const linkedSelection={projectTokens:['p1','p2','p3'],startMonth:'2026-05',endMonth:'2026-10'};
let linkedData=futureData.futureAnalysis(linkedSelection,'all','normal');
let linkedScope=JSON.stringify(linkedSelection);
const renderLinked=(data=linkedData,scope=linkedScope,dimension='category')=>{linkedData=data;linkedScope=scope;now+=.01;flushSync(()=>linkedRoot.render(React.createElement(React.StrictMode,null,React.createElement(linked.AnalyticsLinkedCategories,{data,scope,dimension,sub:'選択したProjectの月別合計'}))));};
const linkedRows=()=>walk(linkedNode).filter(n=>hasClass(n,'f-rank-row'));
const linkedArcs=()=>walk(linkedNode).filter(n=>n.localName==='circle'&&n.getAttribute('r')==='64');
const linkedRow=id=>linkedRows().find(n=>n.getAttribute('data-key')===id);
const linkedArc=id=>linkedArcs().find(n=>n.getAttribute('data-category-id')===id);
const linkedHit=id=>walk(linkedNode).find(n=>n.getAttribute?.('data-category-control')===id);
const linkedLine=()=>walk(linkedNode).find(n=>n.localName==='polyline');
const selectedButtons=()=>walk(linkedNode).filter(n=>n.getAttribute?.('aria-pressed')==='true'&&['div','path'].includes(n.localName));
const lineLabels=()=>walk(linkedNode).filter(n=>hasClass(n,'number-label')).map(n=>n.textContent);
const linkedCenter=()=>walk(linkedNode).find(n=>hasClass(n,'linked-donut-exact'))?.textContent;
const linkedVisual=()=>walk(linkedNode).find(n=>hasClass(n,'linked-donut-value'));
const visualAmount=()=>Number(linkedVisual().textContent.replace(/[¥,]/g,''));
const centerTarget=id=>{const row=linkedData.categories.find(row=>(row.id??'unclassified')===id);return row?`${row.name} ${module.exports.yen(row.amount)}`:`期間支出総額 ${module.exports.yen(linkedData.total)}`;};
const linkedValues=id=>linked.linkedCategorySeries(linkedData).find(row=>row.id===id)?.values??linkedData.trend.map(t=>t.amount);
function sameLinkedPoints(actual,expected){
 const a=actual.split(/[ ,]/).map(Number),b=expected.split(/[ ,]/).map(Number);assert.equal(a.length,b.length);
 a.forEach((value,index)=>assert.ok(Math.abs(value-b[index])<1e-4,"complex-string SVG mixing retains coordinates within 0.0001 units"));
}
function assertLinkedTarget(values){
 const points=linkedLine().getAttribute('points').split(' ').map(v=>v.split(',').map(Number)),max=module.exports.chartAxis(Math.max(0,...values));
 for(let i=0;i<values.length;i++)assert.ok(Math.abs(points[i][1]-(36+196*(1-values[i]/max)))<1e-4);
 assert.deepEqual(lineLabels(),values.map(module.exports.yen));
 const circles=walk(linkedNode).filter(n=>n.localName==='circle'&&n.getAttribute('r')!=='64');
 for(let i=0;i<values.length;i++){
  assert.equal(Number(circles[i].getAttribute('cx')),points[i][0]);assert.equal(Number(circles[i].getAttribute('cy')),points[i][1]);
 }
}
preference.matches=false;renderLinked();await tick(16);
assert.equal(linkedLine().getAttribute('stroke-dasharray'),'0 1');
assert.ok(linkedArcs().every(n=>n.getAttribute('aria-hidden')==='true'),'exact selectable labels live on the real hit paths');
for(const node of linkedArcs())assert.equal(node.style.pointerEvents,'none');
for(const node of walk(linkedNode).filter(n=>hasClass(n,'linked-donut-hit'))){assert.equal(node.getAttribute('role'),'button');assert.equal(node.getAttribute('tabindex'),'0');assert.equal(node.getAttribute('stroke'),'transparent');assert.equal((node.getAttribute('d').match(/ A /g)??[]).length,2);}
assert.equal(linkedVisual().getAttribute('aria-hidden'),'true');assert.equal(visualAmount(),0,'visual count stays at zero before viewport entry');
const center=linkedCenter(),totalPoints=linkedLine().getAttribute('points'),svgWidth=linkedLine().ownerSVGElement.getAttribute('viewBox');
let animationCount=animations.length;
await linkedFire(linkedHit('FOOD'),'onPointerEnter');await tick(0);await tick(80);
assert.equal(linkedLine().getAttribute('points'),totalPoints);assert.equal(linkedLine().getAttribute('stroke-dasharray'),'0 1');assert.equal(selectedButtons().length,0);
assert.equal(Number(linkedRow('FOOD').style['--linked-category-opacity']),1);assert.equal(Number(linkedArc('FOOD').style.opacity),1);
const otherId=linkedRows().find(n=>n.getAttribute('data-key')!=='FOOD').getAttribute('data-key');
assert.ok(Number(linkedRow(otherId).style['--linked-category-opacity'])<1&&Number(linkedRow(otherId).style['--linked-category-opacity'])>.45);
assert.equal(Number(linkedRow(otherId).style['--linked-category-opacity']),Number(linkedArc(otherId).style.opacity));
assert.equal(linkedCenter(),centerTarget('FOOD'));assert.ok(animations.slice(animationCount).every(a=>[.16,.18].includes(a.options.duration)),'offscreen hover cannot start a line, bar or money entrance');
await linkedFire(linkedHit('FOOD'),'onPointerLeave');await tick(180);assert.ok(linkedRows().every(n=>Number(n.style['--linked-category-opacity'])===1));
await linkedFire(linkedRow(otherId),'onPointerEnter');await tick(180);assert.equal(Number(linkedArc('FOOD').style.opacity),.45);assert.equal(Number(linkedArc(otherId).style.opacity),1);assert.equal(selectedButtons().length,0);
await linkedFire(linkedRow(otherId),'onPointerLeave');
for(const observer of [...observers])for(const target of observer.targets)observeTarget(target,true);await tick(0);await tick(650);
assert.equal(linkedLine().getAttribute('stroke-dasharray'),'1 1');assertLinkedTarget(linkedValues('total'));assert.equal(visualAmount(),linkedData.total);assert.equal(linkedCenter(),center);
// Selection alone authorizes scale/semantic morphs. All other chart callers keep
// the strict identity/domain remount behavior tested above.
await linkedFire(linkedRow('FOOD'),'onClick');await tick(0);
sameLinkedPoints(linkedLine().getAttribute('points'),totalPoints);assert.equal(selectedButtons().length,2);
assert.match(linkedNode.textContent,/選択中：食費/);assert.equal(linkedCenter(),centerTarget('FOOD'));
assert.deepEqual(lineLabels(),linkedValues('FOOD').map(module.exports.yen),'money strings change immediately, never count up');
assert.equal(linkedLine().ownerSVGElement.getAttribute('viewBox'),svgWidth,'scale changes reserve total-series geometry');
await tick(150);let middleSelection=linkedLine().getAttribute('points');assert.notEqual(middleSelection,totalPoints);
let points=middleSelection.split(' ').map(v=>v.split(',').map(Number));
let chartDots=walk(linkedNode).filter(n=>n.localName==='circle'&&n.getAttribute('r')!=='64');
let labelNodes=walk(linkedNode).filter(n=>hasClass(n,'number-label'));
const labelPositions=module.exports.chartValueLabelLayout(linkedLine().getAttribute('points'),labelNodes.map(n=>n.textContent),{axisRight:Number(walk(linkedLine().ownerSVGElement).find(n=>n.localName==='line').getAttribute('x1'))-15,width:Number(linkedLine().ownerSVGElement.getAttribute('viewBox').split(' ')[2])});
for(let i=0;i<points.length;i++){assert.equal(Number(chartDots[i].getAttribute('cy')),points[i][1]);assert.equal(Number(labelNodes[i].getAttribute('y')),labelPositions[i].y);assert.equal(Number(labelNodes[i].getAttribute('x')),labelPositions[i].x);}
await linkedFire(linkedHit(otherId),'onClick');await tick(0);sameLinkedPoints(linkedLine().getAttribute('points'),middleSelection);
await tick(100);assert.notEqual(linkedLine().getAttribute('points'),middleSelection);await tick(200);assertLinkedTarget(linkedValues(otherId));
const finalSelection=linkedLine().getAttribute('points');await tick(1000);assert.equal(linkedLine().getAttribute('points'),finalSelection,'no stale completion overwrites the current category');
await linkedFire(linkedRow(otherId),'onClick');await tick(320);assert.equal(selectedButtons().length,0);assertLinkedTarget(linkedValues('total'));
await linkedFire(linkedHit('FOOD'),'onFocus');assert.equal(selectedButtons().length,0);
await linkedFire(linkedHit('FOOD'),'onKeyDown',{key:'Enter'});await tick(320);assertLinkedTarget(linkedValues('FOOD'));
await linkedFire(linkedHit('FOOD'),'onBlur');assert.equal(selectedButtons().length,2,'blur clears hover, retaining explicit selection');
await linkedFire(linkedRow('FOOD'),'onKeyDown',{key:'Escape'});await tick(320);assert.equal(selectedButtons().length,0);assertLinkedTarget(linkedValues('total'));
await linkedFire(linkedRow('FOOD'),'onKeyDown',{key:' '});await tick(320);assert.equal(selectedButtons().length,2);
const clearButton=()=>walk(linkedNode).find(n=>n.localName==='button'&&n.textContent==='選択解除');await linkedFire(clearButton(),'onClick');await tick(320);assert.equal(selectedButtons().length,0);
await linkedFire(linkedHit(otherId),'onPointerEnter',{pointerType:'touch'});assert.equal(selectedButtons().length,0);
await linkedFire(linkedHit(otherId),'onClick',{pointerType:'touch'});await tick(320);assertLinkedTarget(linkedValues(otherId));
await linkedFire(linkedRow('FOOD'),'onClick');await tick(80);await setPreference(true);await tick(0);assertLinkedTarget(linkedValues('FOOD'));
assert.ok(animations.every(a=>!a.value.isAnimating()),'live reduce stops geometry, opacity, bar and tooltip controls');
assert.ok(walk(linkedNode).filter(n=>hasClass(n,'linked-category-selection')).every(n=>!Motion.visualElementStore.has(n)),'live reduce replaces the projection frame with a static span');
await linkedFire(linkedRow(otherId),'onClick');await tick(0);assertLinkedTarget(linkedValues(otherId));
animationCount=animations.length;linkedNode.setAttribute('data-theme','dark');renderLinked({...linkedData});await tick(16);assert.equal(animations.length,animationCount,'same data and theme do not restart');
await setPreference(false);await tick(16);assertLinkedTarget(linkedValues(otherId));
// Project/period changes cannot inherit the relaxed selection transition key.
await linkedFire(linkedRow('FOOD'),'onClick');await tick(100);
const nextSelection={...linkedSelection,projectTokens:['p1'],startMonth:'2026-10'};
renderLinked(futureData.futureAnalysis(nextSelection,'all','normal'),JSON.stringify(nextSelection));await tick(0);assertLinkedTarget(linkedValues('FOOD'));assert.equal(linkedCenter(),centerTarget('FOOD'));
assert.equal(linkedLine().getAttribute('stroke-dasharray'),'1 1','scope changes do not replay the viewport entrance');
renderLinked(futureData.futureAnalysis(nextSelection,'all','empty'));await tick(0);assert.equal(linkedRows().length,0);assert.equal(linkedArcs().length,0);assert.equal(selectedButtons().length,0);assertLinkedTarget([0]);assert.ok(!linkedNode.textContent.includes('選択中：'));
renderLinked(futureData.futureAnalysis(nextSelection,'all','normal'));await tick(0);assert.equal(selectedButtons().length,0,'removed selections do not resurrect on restoring older data');
// Real null/unclassified, month spans, utility IDs and coherent final labels.
for(const months of [1,6,12,24]){
 const selection={...linkedSelection,startMonth:futureData.monthAt(2026*12+9-months+1)};
 renderLinked(futureData.futureAnalysis(selection,'all','normal'),JSON.stringify(selection));await tick(0);
 assert.equal(lineLabels().length,months);const row=linkedRows()[0];await linkedFire(row,'onClick');await tick(320);assert.equal(lineLabels().length,months);assert.equal(linkedCenter(),centerTarget(row.getAttribute('data-key')));
 const nullHit=linkedHit('unclassified');if(nullHit){await linkedFire(nullHit,'onClick');await tick(320);assertLinkedTarget(linkedValues(null));assert.match(linkedNode.textContent,/選択中：未分類/);}
 await linkedFire(walk(linkedNode).find(n=>n.getAttribute?.('data-linked-categories')),'onKeyDown',{key:'Escape'});await tick(320);
}
const utilityData=futureData.futureAnalysis(linkedSelection,'utilities','normal');renderLinked(utilityData,'utility-scope','utility');await tick(0);
assertLinkedTarget(utilityData.trend.map(row=>row.amount));
assert.ok(!walk(linkedNode).some(n=>n.getAttribute?.('aria-label')==='光熱・通信の推移表示'));
const utilityRows=linked.linkedCategorySeries(utilityData,'utility');await linkedFire(linkedHit(utilityRows[0].id),'onClick');await tick(320);assertLinkedTarget(utilityRows[0].values);assert.equal(selectedButtons().length,2);
await linkedFire(linkedRow(utilityRows[1].id),'onClick');await tick(320);assertLinkedTarget(utilityRows[1].values);
await linkedFire(clearButton(),'onClick');await tick(320);assertLinkedTarget(utilityData.trend.map(row=>row.amount));assert.equal(selectedButtons().length,0);
// Batch a keyboard clear with category removal: resolve against the committed DOM.
for(const empty of [false,true]){
 renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'focus-fallback');await tick(0);
 await linkedFire(linkedRow('FOOD'),'onClick');const button=clearButton();button.focus();
 const result=futureData.futureAnalysis(linkedSelection,'utilities',empty?'empty':'normal');
 const nextData={...result,categories:result.categories.filter(row=>row.id!=='FOOD')};
 now+=.01;flushSync(()=>{
   eventProps(button).onClick({detail:0,currentTarget:button});
   linkedRoot.render(React.createElement(React.StrictMode,null,React.createElement(linked.AnalyticsLinkedCategories,{data:nextData,scope:'focus-fallback',sub:'選択したProjectの月別合計'})));
 });await tick(0);
 const expected=empty?walk(linkedNode).find(n=>n.localName==='summary'):linkedRows()[0];
 assert.ok(expected);assert.ok(doc.activeElement===expected,`removed category restores fallback: actual=${doc.activeElement?.getAttribute?.('data-key')??doc.activeElement?.localName}, expected=${expected?.getAttribute?.('data-key')??expected?.localName}`);assert.ok(linkedNode.contains(expected));
}
// No delayed focus is queued after unmount, or if another element already owns focus.
renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'focus-cancel');await tick(0);await linkedFire(linkedRow('FOOD'),'onClick');
let cancelButton=clearButton();cancelButton.focus();let beforeFocus=focusCalls.length;
now+=.01;flushSync(()=>{eventProps(cancelButton).onClick({detail:0,currentTarget:cancelButton});linkedRoot.render(React.createElement('div'));});await tick(16);assert.equal(focusCalls.length,beforeFocus);
renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'focus-moved');await tick(0);await linkedFire(linkedRow('FOOD'),'onClick');
cancelButton=clearButton();cancelButton.focus();const movedTo=linkedRow('UTILITIES');
now+=.01;flushSync(()=>{eventProps(cancelButton).onClick({detail:0,currentTarget:cancelButton});movedTo.focus();});await tick(16);assert.equal(doc.activeElement,movedTo,'another focus change is respected');
console.log('P2 focus DOM model: Basic/Pro all three tabs + Current keyboard clear/reselect, pointer no-force, removed-category/empty fallbacks, Escape, focus-move/unmount cancellation PASS. Native browser focus/events unverified.');
// Current mounts the same owner with canonical Current amounts and source ledger.
const currentDemo=load(resolve(dirname(chartsPath),'dedicatedAnalyticsDemoData.ts'));
const currentLedger=load(resolve(dirname(chartsPath),'dedicatedAnalyticsDemoExpenses.ts')).demoExpenses;
function renderCurrent(selection,scenario='normal'){
 const data=currentDemo.demoResult(selection,scenario);
 const records=currentLedger.filter(r=>scenario!=='empty'&&data.includedProjectTokens.includes(r.projectToken)&&r.paidOn.slice(0,7)>=data.period.startMonth&&r.paidOn.slice(0,7)<=data.period.endMonth&&(scenario!=='previousZero'||r.paidOn.slice(0,7)!==data.endMonthComparison.previousMonth));
 linkedData={...dedicated.currentAnalysis(data),utilities:[],records};
 now+=.01;flushSync(()=>linkedRoot.render(React.createElement(React.StrictMode,null,React.createElement(dedicated.DedicatedAnalytics,{state:{status:'ready',data},records,categoryView:'bars',onCategoryViewChange(){}}))));
 return data;
}
renderCurrent(linkedSelection);await tick(16);
assert.deepEqual(walk(linkedNode).filter(n=>hasClass(n,'card-title')).map(n=>n.textContent),['カテゴリ別支出','月次支出推移','プロジェクト別支出'],'Current actual mounted cards follow visual/keyboard DOM order');
assert.ok(linkedArcs().every(n=>parseFloat(n.getAttribute('stroke-dasharray'))===0),'Current waits for entry');
for(const o of [...observers])for(const target of o.targets)observeTarget(target,true);await tick(0);await tick(575);
assert.ok(linkedArcs().some(n=>parseFloat(n.getAttribute('stroke-dasharray'))>0),'Current has partial reveal frames');
await tick(575);assertLinkedTarget(linkedData.trend.map(t=>t.amount));
const currentSeries=linked.linkedCategorySeries(linkedData);
for(const row of currentSeries)assert.equal(row.values.reduce((a,b)=>a+b,0),row.amount);
for(let i=0;i<linkedData.labels.length;i++)assert.equal(currentSeries.reduce((s,r)=>s+r.values[i],0),linkedData.trend[i].amount);
await linkedFire(linkedRow('FOOD'),'onFocus');await tick(320);assert.equal(linkedCenter(),centerTarget('FOOD'));assert.equal(selectedButtons().length,0);
await linkedFire(linkedRow('FOOD'),'onKeyDown',{key:'Enter',preventDefault(){}});await tick(320);assertLinkedTarget(linkedValues('FOOD'));
const currentOther=currentSeries.find(r=>r.id!=='FOOD'&&r.amount>0).id;
await linkedFire(linkedHit(currentOther),'onClick');await tick(320);assertLinkedTarget(linkedValues(currentOther));
const currentClear=clearButton();currentClear.focus();await linkedFire(currentClear,'onClick',{detail:0,currentTarget:currentClear});await tick(320);assertLinkedTarget(linkedData.trend.map(t=>t.amount));
assert.equal(doc.activeElement,linkedRow(currentOther),'Current restores the selected row');
await linkedFire(doc.activeElement,'onKeyDown',{key:' ',preventDefault(){}});await tick(320);assertLinkedTarget(linkedValues(currentOther));
const escapeClear=clearButton();escapeClear.focus();await linkedFire(escapeClear,'onKeyDown',{key:'Escape',currentTarget:escapeClear,stopPropagation(){}});await tick(320);assert.equal(doc.activeElement,linkedRow(currentOther));
renderCurrent({...linkedSelection,projectTokens:['p1'],startMonth:linkedSelection.endMonth});await tick(320);assertLinkedTarget(linkedData.trend.map(t=>t.amount));
await setPreference(true);await linkedFire(linkedRow(linkedData.categories[0].id),'onClick');await tick(16);assertLinkedTarget(linkedValues(linkedData.categories[0].id));
renderCurrent(linkedSelection,'empty');await tick(16);assert.equal(linkedArcs().length,0);assert.equal(selectedButtons().length,0);await setPreference(false);
console.log('Current linked DOM: real canonical ledger, viewport waiting/partial/completed, exact monthly/category conservation, focus/keyboard/select/switch/clear, project/period, empty and live reduce PASS. Browser visuals unverified.');
for(const status of ['loading','error','accessInvalidated']){
 renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'initial');await tick(0);for(const observer of [...observers])for(const target of observer.targets)observeTarget(target,true);await tick(650);await linkedFire(linkedRow('FOOD'),'onClick');await tick(70);
 now+=.01;flushSync(()=>linkedRoot.render(React.createElement(dedicated.DedicatedAnalytics,{state:{status,onRetry(){}},categoryView:'bars',onCategoryViewChange(){}})));
 assert.equal(walk(linkedNode).filter(n=>hasClass(n,'linked-donut-hit')).length,0);assert.equal(observers.size,0);assert.ok(!linkedNode.textContent.includes('¥'));assert.ok(animations.every(a=>!a.value.isAnimating()));
}
// Remount after invalidation to test selection before/during the one-shot reveal.
renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'entrance');await tick(16);
await linkedFire(linkedRow('FOOD'),'onClick');assert.equal(linkedLine().getAttribute('stroke-dasharray'),'0 1');assertLinkedTarget(linkedValues('FOOD'));
for(const observer of [...observers])for(const target of observer.targets)observeTarget(target,true);await tick(0);await tick(200);
const beforeReveal=Number(linkedLine().getAttribute('stroke-dasharray').split(' ')[0]);assert.ok(beforeReveal>0&&beforeReveal<1);
await linkedFire(linkedHit(otherId),'onClick');await tick(100);
const duringReveal=Number(linkedLine().getAttribute('stroke-dasharray').split(' ')[0]);assert.ok(duringReveal>=beforeReveal&&duringReveal<1,'selection cannot reset the reveal progress');
await tick(400);assertLinkedTarget(linkedValues(otherId));assert.equal(linkedLine().getAttribute('stroke-dasharray'),'1 1');
for(const observer of [...observers])for(const target of observer.targets)observeTarget(target,false);
animationCount=animations.filter(a=>a.options.duration===.3).length;
await linkedFire(linkedRow('FOOD'),'onClick');assertLinkedTarget(linkedValues('FOOD'));assert.equal(animations.filter(a=>a.options.duration===.3).length,animationCount,'offscreen coordinate updates snap');
for(const observer of [...observers])for(const target of observer.targets)observeTarget(target,true);await tick(16);assert.equal(linkedLine().getAttribute('stroke-dasharray'),'1 1');
// Three requested fixes, independently checked against actual Motion DOM writes.
// Reuse an existing owner, then unmount it once to get a fresh viewport instance.
now+=.01;flushSync(()=>linkedRoot.render(React.createElement('div')));await tick(16);
renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'donut-fixes');await tick(16);
const total=linkedData.total,food=linkedData.categories.find(row=>row.id==='FOOD');
const second=linkedData.categories.find(row=>row.id!==food.id&&row.amount!==food.amount&&row.amount>0);
const secondId=second.id??'unclassified';
const shape=node=>({width:Number(node.style['--linked-arc-width']),x:Motion.visualElementStore.get(node.parentElement).getValue('x').get(),y:Motion.visualElementStore.get(node.parentElement).getValue('y').get()});
const focusPath=node=>walk(node.parentElement).find(n=>hasClass(n,'linked-donut-focus'));
const frameStable=()=>assert.ok(!linkedHit('FOOD').style.transform,'stationary hit region avoids hover/leave oscillation');
assert.deepEqual(shape(linkedArc('FOOD')),{width:20,x:0,y:0});frameStable();
assert.equal(focusPath(linkedArc('FOOD')).getAttribute('d'),linkedHit('FOOD').getAttribute('d'));
assert.equal(focusPath(linkedArc('FOOD')).getAttribute('aria-hidden'),'true');
assert.equal(linkedHit('FOOD').getAttribute('tabindex'),'0');
assert.match(linkedHit('FOOD').getAttribute('d'),/^M [^A]+ A [^A]+ A [^A]+$/,'replacement focus consists only of arc segments, no rectangular/chord lines');
assert.equal(visualAmount(),0);assert.equal(linkedCenter(),centerTarget('total'));
const countBeforeEntry=animations.length;
observeTarget(linkedVisual(),true);await tick(0);
const entrance=animations.slice(countBeforeEntry).find(a=>a.target===total&&a.options.duration===.6);
assert.ok(entrance);const moneyValue=entrance.value,countControls=()=>animations.filter(a=>a.value===moneyValue);
assert.equal(visualAmount(),0);await tick(300);assert.ok(visualAmount()>0&&visualAmount()<total,'initial viewport count has a real intermediate value');assert.equal(linkedCenter(),centerTarget('total'));
await tick(320);assert.equal(visualAmount(),total);
let count=countControls().length;observeTarget(linkedVisual(),false);observeTarget(linkedVisual(),true);await tick(16);assert.equal(countControls().length,count,'re-entry never repeats 0-to-total');
await linkedFire(linkedHit('FOOD'),'onPointerEnter');
assert.equal(linkedCenter(),centerTarget('FOOD'),'assistive value is exact immediately, before the visual reaches it');
assert.equal(linkedVisual().getAttribute('aria-hidden'),'true');assert.equal(visualAmount(),total);
assert.deepEqual(shape(linkedArc('FOOD')),{width:20,x:0,y:0});
await tick(90);let raised=shape(linkedArc('FOOD'));assert.ok(raised.width>20&&raised.width<24);assert.ok(Math.hypot(raised.x,raised.y)>0&&Math.hypot(raised.x,raised.y)<2);
assert.equal(shape(linkedArc(secondId)).width,20,'only the hovered arc grows');assert.ok(visualAmount()>food.amount&&visualAmount()<total);
assert.equal(focusPath(linkedArc('FOOD')).getAttribute('d'),linkedHit('FOOD').getAttribute('d'));frameStable();
await tick(100);raised=shape(linkedArc('FOOD'));assert.equal(raised.width,24);assert.ok(Math.abs(Math.hypot(raised.x,raised.y)-2)<1e-8);
assert.doesNotMatch(linkedArc('FOOD').parentElement.style.transform,/scale|rotate/,'arc emphasis uses translation only');
const displayed=visualAmount();await linkedFire(linkedRow(secondId),'onPointerEnter');assert.equal(visualAmount(),displayed,'retarget from currently displayed amount');
assert.equal(linkedCenter(),centerTarget(secondId));await tick(90);const retargeted=visualAmount();assert.ok(retargeted>Math.min(displayed,second.amount)&&retargeted<Math.max(displayed,second.amount));
await tick(230);assert.equal(visualAmount(),second.amount);assert.equal(shape(linkedArc('FOOD')).width,20);assert.equal(shape(linkedArc(secondId)).width,24);
count=countControls().length;await linkedFire(linkedRow(secondId),'onClick');assert.equal(selectedButtons().length,2);assert.equal(countControls().length,count,'selecting the hovered target cannot restart its money animation');
await linkedFire(linkedHit('FOOD'),'onPointerEnter');await tick(320);assert.equal(visualAmount(),food.amount);assert.equal(linkedCenter(),centerTarget('FOOD'));assert.equal(selectedButtons().length,2,'hover never changes the pinned category');
await linkedFire(linkedHit('FOOD'),'onPointerLeave');await tick(320);assert.equal(visualAmount(),second.amount,'hover leave returns to the pinned category');
await linkedFire(linkedRow(secondId),'onClick');assert.equal(selectedButtons().length,0);assert.equal(linkedCenter(),centerTarget('total'),'reclick clears hover as well as selection');await tick(320);assert.equal(visualAmount(),total);
await linkedFire(linkedHit('FOOD'),'onFocus');await tick(90);assert.ok(shape(linkedArc('FOOD')).width>20);assert.equal(focusPath(linkedArc('FOOD')).getAttribute('stroke'),'var(--text)');
await linkedFire(linkedHit('FOOD'),'onKeyDown',{key:'Enter'});await tick(320);assert.equal(visualAmount(),food.amount);assert.equal(linkedCenter(),centerTarget('FOOD'));
await linkedFire(linkedHit('FOOD'),'onBlur');await tick(16);assert.equal(visualAmount(),food.amount);
await linkedFire(clearButton(),'onClick');await tick(320);assert.equal(visualAmount(),total);
// Interrupted expansion/count must stop at their latest targets on a live preference change.
await linkedFire(linkedRow('FOOD'),'onPointerEnter');await tick(60);await setPreference(true);await tick(16);
assert.equal(visualAmount(),food.amount);assert.equal(shape(linkedArc('FOOD')).width,24);assert.ok(Math.abs(Math.hypot(shape(linkedArc('FOOD')).x,shape(linkedArc('FOOD')).y)-2)<1e-8);
assert.ok(animations.every(a=>!a.value.isAnimating()));
count=countControls().length;await linkedFire(linkedRow('FOOD'),'onPointerLeave');assert.equal(visualAmount(),total);assert.equal(shape(linkedArc('FOOD')).width,20);assert.equal(countControls().length,count,'reduce mode never starts a count');
await setPreference(false);await tick(16);count=countControls().length;renderLinked({...linkedData});await tick(16);assert.equal(countControls().length,count,'theme/same-value re-render never restarts');
await linkedFire(linkedHit('FOOD'),'onPointerEnter');await tick(90);const obsoleteCount=countControls().at(-1);
await linkedFire(linkedHit(secondId),'onPointerEnter');await tick(320);assert.equal(visualAmount(),second.amount);await tick(700);assert.equal(visualAmount(),second.amount);assert.equal(obsoleteCount.value.isAnimating(),false,'superseded count control cannot overwrite latest output');
observeTarget(linkedVisual(),false);await linkedFire(linkedHit(secondId),'onPointerLeave');assert.equal(visualAmount(),total,'offscreen count updates snap');
// Exact tables/aria labels remain integer JPY while only the hidden-from-AT visual changes.
assert.ok(walk(linkedNode).some(n=>n.localName==='td'&&n.textContent===module.exports.yen(linkedData.trend[0].amount)));
assert.ok(linkedHit('FOOD').getAttribute('aria-label').includes(module.exports.yen(food.amount)));
// Numeric edge cases are isolated Rank props, not app fixtures or sample UI.
now+=.01;flushSync(()=>linkedRoot.render(React.createElement('div')));await setPreference(true);
renderLinked(futureData.futureAnalysis(linkedSelection,'all','normal'),'initial-reduce');await tick(0);assert.equal(visualAmount(),linkedData.total,'initial reduce never renders zero');
await linkedFire(linkedHit('FOOD'),'onPointerEnter');assert.equal(visualAmount(),food.amount);
now+=.01;flushSync(()=>linkedRoot.render(React.createElement('div')));await setPreference(false);
const edgeRows=[{id:'large',name:'最大',amount:Number.MAX_SAFE_INTEGER},{id:'zero',name:'ゼロ',amount:0}];
const edgeProps={rows:edgeRows,total:Number.MAX_SAFE_INTEGER,donut:true,combined:true,interaction:{highlighted:null,selected:null,reduced:false,selectionId:'edge',onHover(){},onSelect(){},onClear(){}}};
const renderEdge=props=>{now+=.01;flushSync(()=>linkedRoot.render(React.createElement(React.StrictMode,null,React.createElement(module.exports.Rank,props))));};
renderEdge(edgeProps);await tick(16);assert.equal(visualAmount(),0);assert.equal(linkedCenter(),`期間支出総額 ${module.exports.yen(Number.MAX_SAFE_INTEGER)}`);
assert.equal(linkedHit('zero'),undefined,'zero-length arcs do not create invisible keyboard tab stops');assert.equal(linkedRow('zero').getAttribute('tabindex'),'0','zero category remains keyboard-accessible through its row');
observeTarget(linkedVisual(),true);await tick(0);await tick(300);assert.ok(visualAmount()>0&&visualAmount()<Number.MAX_SAFE_INTEGER);assert.equal(linkedCenter(),`期間支出総額 ${module.exports.yen(Number.MAX_SAFE_INTEGER)}`);
await tick(320);assert.equal(visualAmount(),Number.MAX_SAFE_INTEGER,'count completion preserves the exact safe integer');
renderEdge({...edgeProps,interaction:{...edgeProps.interaction,highlighted:module.exports.rankCategoryKey('zero'),selected:module.exports.rankCategoryKey('zero')}});await tick(0);assert.equal(linkedCenter(),'ゼロ ¥0');await tick(320);assert.equal(visualAmount(),0);
renderEdge({...edgeProps,rows:[],total:0});await tick(0);assert.equal(linkedVisual(),undefined);assert.match(linkedNode.textContent,/合計 ¥0・0件/);assert.equal(observers.size,0);assert.ok(animations.every(a=>!a.value.isAnimating()));
const savedIO=globalThis.IntersectionObserver;delete globalThis.IntersectionObserver;renderEdge(edgeProps);await tick(16);assert.equal(visualAmount(),Number.MAX_SAFE_INTEGER,'missing viewport API falls back to the completed amount');globalThis.IntersectionObserver=savedIO;
console.log('Donut fixes DOM model: arc-shaped focus geometry/tab stops, 180ms 20-to-24 width and 0-to-2 translation with stationary hit regions, initial 600ms and hover/pinned/clear 300ms visual-only counts, current-value retarget, exact AT text/tables, live reduce and cleanup PASS. Native SVG outline paint/focus-visible and browser/video matching remain unverified.');
flushSync(()=>linkedRoot.unmount());assert.equal(observers.size,0);
for(const [target,events] of [[doc,['pointerdown','keydown']],[win,['scroll','resize']],[preference,['change']]])for(const event of events)assert.equal(getEventListeners(target,event).length,target===win?(globalListenerBaseline[event]??0):0);
console.log('Linked category DOM model: real fixture records; bidirectional hover without line changes, row/arc toggle, current-frame 300ms scale/coordinate retarget, exact money/center, touch-click and keyboard handler states, clear/Escape, scope/invalid-data cleanup, null/utility IDs, 1/6/12/24 months and live reduce PASS. Native events, SVG hit-testing, layoutId projection, CSS/paint and browser visual parity unverified.');

}

{
// Restoration has two independent controls: once-only reveal and normalized
// complete-ring morph. Drive the normal linked Rank path directly without a preview UI.
const node=doc.createElement('div'),root=createRoot(node);
const interaction={highlighted:null,selected:null,reduced:false,selectionId:'regression',onHover(){},onSelect(){},onClear(){}};
const samples={'均等':[30000,30000,30000],'集中':[88000,9000,3000],'0%あり':[0,0,60000]};
let instance=0, previousInstance=-1, sample='均等';
const render=element=>{now+=.01;flushSync(()=>root.render(React.createElement(React.StrictMode,null,element)));};
const page=()=>{
 if(previousInstance!==instance){sample='均等';previousInstance=instance;}
 const rows=[{id:'FOOD',name:'食費'},{id:'UTILITIES',name:'光熱費'},{id:null,name:'未分類'}].map((row,i)=>({...row,amount:samples[sample][i]}));
 return React.createElement(module.exports.Rank,{key:instance,rows,total:rows.reduce((s,row)=>s+row.amount,0),donut:true,combined:true,interaction});
};
const segments=()=>walk(node).filter(n=>n.localName==='circle'&&n.getAttribute('r')==='64');
const svg=()=>segments()[0].ownerSVGElement;
const snapshot=()=>segments().map(n=>({node:n,id:n.getAttribute('data-category-id'),start:-Number(n.getAttribute('stroke-dashoffset')),length:Number(n.getAttribute('stroke-dasharray').split(' ')[0]),color:n.getAttribute('stroke')}));
const sum=()=>snapshot().reduce((sum,arc)=>sum+arc.length,0);
const control=(duration)=>animations.filter(a=>a.options.duration===duration).at(-1);
const choose=async label=>{sample=label;render(page());await tick(0);};
function full(){let end=0;for(const arc of snapshot()){assert.ok(arc.length>=-1e-9);assert.ok(Math.abs(arc.start-end)<1e-8);end=arc.start+arc.length;assert.equal(arc.node.getAttribute('pathLength'),null);}assert.ok(Math.abs(end-C)<1e-8);}
function ratios(expected){full();const arcs=snapshot();expected.forEach((ratio,index)=>assert.ok(Math.abs(arcs[index].length-ratio*C)<1e-8));}
await setPreference(false);const beforeWrites=circleWrites.length;render(page());await tick(16);
const waiting=segments();assert.equal(sum(),0);assert.ok(!circleWrites.slice(beforeWrites).some(write=>waiting.includes(write.node)&&parseFloat(write.value)>0),'no completed stroke is written before viewport entry');
assert.equal(svg().getAttribute('data-donut-motion'),'true');assert.ok(node.textContent.includes('¥90,000'));
const beforeEntry=animations.length;await tick(400);assert.equal(sum(),0);assert.equal(animations.length,beforeEntry,'offscreen reveal stays waiting');
observeTarget(svg(),true);await tick(0);assert.equal(sum(),0);const reveal=control(1.15);assert.ok(reveal);assert.equal(reveal.options.ease,'linear');
await tick(20);let drawing=snapshot();assert.ok(drawing[0].length>0);assert.equal(drawing[1].length,0);assert.equal(drawing[2].length,0,'short stagger delays later arcs');
await tick(555);const middle=snapshot();assert.ok(sum()>0&&sum()<C);assert.ok(middle.every(arc=>arc.length>0&&arc.length<C/3));
await tick(575);ratios([1/3,1/3,1/3]);const stable=segments(),stableSvg=svg();
let count=animations.filter(a=>a.options.duration===1.15).length;observeTarget(svg(),false);observeTarget(svg(),true);await tick(16);ratios([1/3,1/3,1/3]);assert.equal(animations.filter(a=>a.options.duration===1.15).length,count);
await choose('集中');const morph=control(.75);assert.ok(morph);assert.equal(morph.options.ease,'easeInOut');ratios([1/3,1/3,1/3]);
await tick(375);full();const moving=snapshot();assert.ok(moving[0].length>C/3&&moving[0].length<.88*C);
await choose('0%あり');const retarget=snapshot();retarget.forEach((arc,i)=>assert.ok(Math.abs(arc.length-moving[i].length)<1e-8));
const derived=()=>segments().map(n=>[Motion.visualElementStore.get(n).getValue('strokeDasharray').get(),Motion.visualElementStore.get(n).getValue('strokeDashoffset').get()]);
Motion.frameSteps.preRender.process({timestamp:now,delta:16,isProcessing:true});const beforeStale=derived();morph.options.onUpdate(1);Motion.frameSteps.preRender.process({timestamp:now,delta:16,isProcessing:true});assert.deepEqual(derived(),beforeStale,'obsolete boundary frames cannot overwrite the retarget');
for(let i=0;i<15;i++){await tick(50);full();}ratios([0,0,1]);assert.deepEqual(segments(),stable);assert.equal(svg(),stableSvg);assert.ok(node.textContent.includes('¥60,000'));
await choose('均等');await tick(250);full();await choose('集中');await tick(100);full();await choose('均等');for(let i=0;i<15;i++){await tick(50);full();}ratios([1/3,1/3,1/3]);await tick(800);ratios([1/3,1/3,1/3]);
count=animations.length;await choose('均等');node.setAttribute('data-theme','dark');render(page());await tick(16);assert.equal(animations.length,count,'same ratios and theme do not restart either control');
// Initial/live preference changes complete both controls, then never replay.
await setPreference(true);instance++;render(page());await tick(16);ratios([1/3,1/3,1/3]);await choose('集中');await tick(16);ratios([.88,.09,.03]);
await setPreference(false);instance++;render(page());await tick(16);assert.equal(sum(),0);observeTarget(svg(),true);await tick(0);await tick(250);assert.ok(sum()>0&&sum()<C);const interrupted=control(1.15);
await setPreference(true);await tick(16);ratios([1/3,1/3,1/3]);assert.equal(interrupted.value.isAnimating(),false);
await setPreference(false);count=animations.filter(a=>a.options.duration===1.15).length;observeTarget(svg(),false);observeTarget(svg(),true);await tick(16);assert.equal(animations.filter(a=>a.options.duration===1.15).length,count);
await choose('集中');await tick(200);full();const interruptedMorph=control(.75);await setPreference(true);await tick(16);ratios([.88,.09,.03]);assert.equal(interruptedMorph.value.isAnimating(),false);
await setPreference(false);instance++;render(page());await tick(16);await choose('集中');assert.equal(sum(),0,'pre-entry changes remain hidden and target latest data');observeTarget(svg(),true);await tick(0);await tick(1150);ratios([.88,.09,.03]);
instance++;render(page());await tick(16);observeTarget(svg(),true);await tick(0);await tick(200);const inFlight=control(1.15),before=snapshot();count=animations.filter(a=>a.options.duration===1.15).length;
await choose('集中');snapshot().forEach((arc,i)=>assert.ok(Math.abs(arc.length-before[i].length)<1e-8));await tick(100);assert.equal(control(1.15),inFlight);assert.equal(animations.filter(a=>a.options.duration===1.15).length,count,'data change never restarts the initial reveal');await tick(850);ratios([.88,.09,.03]);
observeTarget(svg(),false);count=animations.length;await choose('0%あり');ratios([0,0,1]);assert.equal(animations.length,count,'offscreen changes snap, not redraw');
// The opted-in path uses the same retained ID slots as Current's tested morph.
const rows=[{id:'a',name:'A',amount:60},{id:'b',name:'B',amount:30},{id:null,name:'未分類',amount:10}];
const rank=rows=>React.createElement(module.exports.Rank,{rows,total:rows.reduce((s,r)=>s+r.amount,0),donut:true,combined:true,interaction});
render(rank(rows));await tick(16);observeTarget(svg(),true);await tick(0);await tick(1150);full();const aNode=segments()[0];
render(rank([...rows,{id:'new',name:'追加',amount:50}]));await tick(0);full();assert.equal(snapshot().find(a=>a.id==='new').length,0);for(let i=0;i<15;i++){await tick(50);full();}
render(rank([rows[2],rows[0],{id:'new',name:'追加',amount:50}]));await tick(0);full();assert.equal(segments()[0],aNode);const removed=snapshot().find(a=>a.id==='b');assert.equal(removed.node.textContent,'');await tick(375);full();assert.ok(snapshot().find(a=>a.id==='b').length>0);await tick(375);full();assert.equal(snapshot().find(a=>a.id==='b').length,0);
render(React.createElement('div'));await tick(16);assert.equal(observers.size,0);assert.ok(animations.every(a=>!a.value.isAnimating()));flushSync(()=>root.unmount());
console.log('Donut restoration DOM model: zero waiting/entry, 40ms stagger and partial 575ms frames, completed 1150ms, independent 750ms synchronized full-ring morph, linked Rank balanced/dominant/zero, retarget/stale guard/IDs/add/remove, same-value/theme, offscreen, initial/live reduce and cleanup PASS. Native hydration/CSS fallback paint and video parity unverified.');
}

// Phase B.1: real React reconciliation in the same Node DOM model, no browser.
{
 const compact=Object.assign(new EventTarget(),{matches:true});
 win.matchMedia=query=>query.includes('max-width')?compact:preference;
 preference.matches=true;
 const node=doc.createElement('div'),client=createRoot(node);
 const render=element=>flushSync(()=>client.render(element));
 const elements=()=>walk(node).filter(n=>n.nodeType===1);
 const named=(name)=>elements().find(n=>n.localName==='button'&&n.textContent===name);
 const click=n=>flushSync(()=>eventProps(n).onClick({currentTarget:n,detail:0,preventDefault(){},stopPropagation(){}}));
 const expanded=card=>card.getAttribute('data-analysis-expanded');
 const visible=n=>{for(let p=n;p&&p!==node;p=p.parentElement)if(eventProps(p)?.hidden)return false;return true;};
 const {AnalyticsFilters}=load(resolve(dirname(chartsPath),'AnalyticsFilters.tsx'));
 const {initialSelection,demoProjects,aggregateDemo}=load(resolve(dirname(chartsPath),'dedicatedAnalyticsDemoData.ts'));
 const {AnalyticsLinkedCategories}=load(resolve(dirname(chartsPath),'AnalyticsLinkedCategories.tsx'));
 const {currentAnalysis}=load(resolve(dirname(chartsPath),'DedicatedAnalytics.tsx'));
 const {demoExpenses}=load(resolve(dirname(chartsPath),'dedicatedAnalyticsDemoExpenses.ts'));
 let draft=initialSelection,applied=initialSelection,applyCount=0,filterError;
 const longName='非常に長いプロジェクト名'.repeat(10);
 const pickerProjects=demoProjects.map((project,index)=>index===0?{...project,name:longName}:project);
 const filter=()=>React.createElement(AnalyticsFilters,{selection:draft,applied,error:filterError,projects:pickerProjects,onChange(next){draft=next;},onApply(){applyCount++;applied=draft;}});
 render(filter());
 assert.doesNotMatch(node.textContent,/表示中の条件を適用済み|支払日のデモ収録範囲/);
 assert.ok(!elements().some(n=>n.getAttribute('id')==='analytics-period-help'),'removed help has no empty element');
 assert.ok(elements().filter(n=>n.localName==='input'&&n.getAttribute('id')?.startsWith('analytics-')).every(n=>!n.getAttribute('aria-describedby')?.includes('analytics-period-help')),'date inputs do not refer to removed help');
 assert.equal(elements().find(n=>hasClass(n,'analytics-filter-status'))?.textContent,'分析条件を適用しました');
 let toggle=elements().find(n=>eventProps(n)?.className==='analytics-disclosure');
 assert.equal(toggle.getAttribute('aria-expanded'),'true');
 const periodInput=id=>elements().find(n=>n.getAttribute('id')===id);
 const monthInput=periodInput('analytics-start-month');
 for(const field of ['start','end']){
  const year=periodInput(`analytics-${field}-year`),select=periodInput(`analytics-${field}-month`);
  assert.equal(year.localName,'input');assert.equal(eventProps(year).inputMode,'numeric');
  assert.equal(select.localName,'select');
  assert.deepEqual(select.options.map(option=>option.value),Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')));
  assert.equal(year.parentElement,select.parentElement);
  assert.equal(year.parentElement.parentElement.localName,'fieldset');
 }
 assert.equal(elements().some(n=>n.getAttribute('role')==='dialog'||n.getAttribute('data-expense-date-root')!==null),false);
 flushSync(()=>eventProps(monthInput).onChange({target:{value:'06'}}));render(filter());
 assert.equal(applied.startMonth,'2026-05');
 monthInput.focus();click(toggle);
 assert.equal(doc.activeElement,toggle,'collapsing moves hidden-content focus to the heading');
 assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(visible(monthInput),false);
 const summary=elements().find(n=>eventProps(n)?.className==='analytics-filter-summary');
 assert.match(summary.textContent,/3プロジェクト · 2026\/05〜2026\/10/);assert.match(summary.textContent,/未適用の変更あり/);
 assert.equal((summary.textContent.match(/プロジェクト/g)??[]).length,1);assert.doesNotMatch(summary.textContent,/入力期間|適用中/);
 click(toggle);assert.equal(elements().find(n=>n===monthInput),monthInput,'filter input stays mounted');
 assert.equal(eventProps(monthInput).value,'06');assert.equal(applyCount,0);
 click(named('適用'));render(filter());assert.equal(applied.startMonth,'2026-06');assert.equal(applyCount,1);
 assert.equal(elements().find(n=>hasClass(n,'analytics-filter-status'))?.textContent,'分析条件を適用しました','applied announcement survives without the visible completion note');
 assert.equal(elements().filter(n=>hasClass(n,'selection-detail')||hasClass(n,'count')).length,0,'no redundant count elements');
 click(toggle);assert.doesNotMatch(summary.textContent,/未適用の変更あり/);assert.match(summary.textContent,/2026\/06〜2026\/10/);click(toggle);
 filterError='集計期間は最大24か月です';render(filter());click(toggle);assert.match(summary.textContent,/最大24か月/);click(toggle);
 assert.match(elements().find(n=>n.getAttribute('id')==='filterError').textContent,/最大24か月/);filterError=undefined;render(filter());
 const savedEnd=draft.endMonth;
 flushSync(()=>eventProps(periodInput('analytics-start-year')).onChange({target:{value:'1999'}}));render(filter());
 assert.equal(draft.startMonth,'1999-06');
 assert.equal(draft.endMonth,savedEnd);
 assert.equal(applied.startMonth,'2026-06');
 const picker=elements().find(n=>n.getAttribute('id')==='projectSelect');
 assert.equal(picker.textContent,'3件選択中');
 click(picker);
 const option=elements().find(n=>n.localName==='input'&&eventProps(n).type==='checkbox');
 assert.equal(option.parentElement.textContent,longName+'継続');
 assert.equal(eventProps(option).checked,true);
 flushSync(()=>eventProps(option).onChange());render(filter());assert.equal(draft.projectTokens.length,2);
 assert.equal(eventProps(option).checked,false);assert.equal(picker.textContent,'2件選択中');
 click(toggle);render(filter());assert.match(summary.textContent,/3プロジェクト/);assert.match(summary.textContent,/未適用の変更あり/);
 click(toggle);assert.equal(picker.getAttribute('aria-expanded'),'false','closing filters closes only the picker, not its selections');
 assert.equal(draft.projectTokens.length,2);
 click(toggle);compact.matches=false;flushSync(()=>compact.dispatchEvent(new Event('change')));
 assert.ok(visible(monthInput),'desktop always exposes filters even after a compact collapse');
 assert.equal(elements().some(n=>eventProps(n)?.className==='analytics-disclosure'),false);
 monthInput.focus();
 compact.matches=true;flushSync(()=>compact.dispatchEvent(new Event('change')));
 assert.equal(visible(monthInput),false,'returning to compact retains disclosure preference');
 toggle=elements().find(n=>hasClass(n,'analytics-disclosure'));
 assert.equal(doc.activeElement,toggle,'resize restores hidden filter focus to the newly mounted trigger');
 assert.deepEqual(focusCalls.at(-1).options,{preventScroll:true});
 const outside=doc.createElement('button');
 for(const width of [320,390,430,768,820,1024,1199]){
  compact.matches=false;flushSync(()=>compact.dispatchEvent(new Event('change')));
  outside.focus();const before=focusCalls.length;win.innerWidth=width;
  compact.matches=true;flushSync(()=>compact.dispatchEvent(new Event('change')));
  assert.equal(doc.activeElement,outside);assert.equal(focusCalls.length,before,'resize never changes external focus');
 }
 toggle=elements().find(n=>hasClass(n,'analytics-disclosure'));click(toggle);monthInput.focus();
 for(const matches of [false,true]){
  compact.matches=matches;flushSync(()=>compact.dispatchEvent(new Event('change')));
  assert.equal(doc.activeElement,monthInput,'expanded content retains focus in both directions');
 }
 toggle=elements().find(n=>hasClass(n,'analytics-disclosure'));click(toggle);
 compact.matches=false;flushSync(()=>compact.dispatchEvent(new Event('change')));monthInput.focus();
 flushSync(()=>{compact.matches=true;compact.dispatchEvent(new Event('change'));outside.focus();});
 assert.equal(doc.activeElement,outside,'a focus change between media notification and commit is respected');
 const savedApplied=applied;applied=null;render(filter());assert.match(summary.textContent,/分析条件は未適用です/);assert.doesNotMatch(summary.textContent,/プロジェクト|未適用の変更あり/);applied=savedApplied;
 render(React.createElement('div'));

 const data=aggregateDemo(initialSelection);
 const linked={...currentAnalysis(data),utilities:[],records:demoExpenses.filter(e=>initialSelection.projectTokens.includes(e.projectToken)&&e.paidOn.slice(0,7)>=initialSelection.startMonth&&e.paidOn.slice(0,7)<=initialSelection.endMonth)};
 const categories=()=>React.createElement(AnalyticsLinkedCategories,{data:linked,scope:'responsive',sub:'対象期間',current:true});
 render(categories());
 const cards=()=>elements().filter(n=>hasClass(n,'f-card'));
 const categoryCard=cards()[0],trendCard=cards()[1];
 assert.equal(expanded(categoryCard),'true');assert.equal(expanded(trendCard),'true');
 const row=elements().find(n=>hasClass(n,'f-rank-row')&&n.getAttribute('tabindex')==='0');
 click(row);await frame(now+16);
 const selectedName=row.textContent;
 const line=elements().find(n=>n.localName==='polyline'),svg=line.ownerSVGElement;
 const coordinates=line.getAttribute('points'),observerCount=observers.size;
 const controls=()=>elements().filter(n=>eventProps(n)?.className==='analytics-disclosure');
 row.focus();click(controls()[0]);
 assert.equal(doc.activeElement,controls()[0]);assert.equal(expanded(categoryCard),'false');assert.equal(expanded(trendCard),'true');
 assert.equal(visible(row),false);assert.equal(row.getAttribute('aria-pressed'),'true');
 click(controls()[1]);assert.equal(expanded(trendCard),'false');assert.equal(visible(line),false);
 click(controls()[0]);click(controls()[1]);await frame(now+16);
 assert.equal(row.textContent,selectedName);assert.equal(row.getAttribute('aria-pressed'),'true');
 assert.equal(elements().find(n=>n===svg),svg);assert.equal(line.getAttribute('points'),coordinates);
 assert.equal(observers.size,observerCount,'folding does not remount charts or observers');
 const ids=controls().map(n=>n.getAttribute('aria-controls'));assert.equal(new Set(ids).size,2);
 for(const id of ids)assert.ok(elements().some(n=>n.getAttribute('id')===id));
 click(controls()[0]);compact.matches=false;flushSync(()=>compact.dispatchEvent(new Event('change')));
 row.focus();compact.matches=true;flushSync(()=>compact.dispatchEvent(new Event('change')));
 assert.equal(doc.activeElement,controls()[0],'card resize restores focus to its own trigger');
 assert.equal(visible(row),false);assert.equal(expanded(trendCard),'true');click(controls()[0]);
 click(row);assert.equal(row.getAttribute('aria-pressed'),'false','category/monthly linkage still responds after reopening');
 render(React.createElement('div'));

 const {AnalyticsFuturePreview}=load(resolve(dirname(chartsPath),'AnalyticsFuturePreview.tsx'));
 for(const theme of ['light','dark'])for(const reduced of [false,true])for(const pro of [false,true])for(const tab of ['all','utilities','living','subscriptions']){
  preference.matches=reduced;
  const views={year:'items',member:'p2'};
  render(React.createElement('div',{'data-analytics-v4':'','data-theme':theme},React.createElement(AnalyticsFuturePreview,{selection:initialSelection,scenario:'normal',tab,onTab(){},pro,onPro(){},views,onViews(){}})));
  const before=cards().length;assert.ok(before>0);
  for(const control of controls())click(control);
  assert.ok(cards().every(c=>expanded(c)==='false'));
  assert.ok(elements().filter(n=>n.getAttribute('data-kpi')).every(visible),'KPI never collapses');
  assert.equal(elements().filter(n=>n.getAttribute('role')==='tab').length,4);
  assert.equal(elements().find(n=>n.getAttribute('aria-selected')==='true').getAttribute('id'),'tab-'+tab,'folding keeps the selected tab');
  for(const control of controls())click(control);
  assert.equal(cards().length,before);assert.ok(cards().every(c=>expanded(c)==='true'));
  assert.ok(elements().filter(n=>n.localName==='h2').every(visible));
  if(pro&&tab==='utilities')assert.equal(named('費目別').getAttribute('aria-pressed'),'true','year-chart selection survives folding');
  render(React.createElement('div'));
 }
 flushSync(()=>client.unmount());
 assert.equal(observers.size,0);assert.equal(getEventListeners(compact,'change').length,0);
 console.log('Responsive Analytics DOM model: filter draft/applied/selection retention, focus restoration, picker close, PC/compact resize, independent cards, mounted SVG/observer/linked selection identity, unique ARIA targets, all four Basic/Pro tabs, year-chart selection, Light/Dark markup and reduced-motion states PASS. Native keyboard/focus/CSS layout unverified.');
}

// Phase B.2: simulated measured widths + real React/Motion SVG writes.
// These assertions prove geometry/state, not native CSS overflow or font paint.
{
 const compact=Object.assign(new EventTarget(),{matches:true}),resizers=new Set();
 const previousResizeObserver=globalThis.ResizeObserver;
 globalThis.ResizeObserver=class{constructor(cb){this.cb=cb;this.targets=new Set();resizers.add(this);}observe(n){this.targets.add(n);}disconnect(){resizers.delete(this);}};
 win.matchMedia=query=>query.includes('max-width')?compact:preference;
 preference.matches=true;
 const node=doc.createElement('div'),client=createRoot(node);
 const nodes=()=>walk(node).filter(n=>n.nodeType===1),query=cls=>nodes().filter(n=>hasClass(n,cls));
 const render=props=>flushSync(()=>client.render(React.createElement(module.exports.Chart,props)));
 const click=name=>flushSync(()=>eventProps(nodes().find(n=>n.localName==='button'&&n.textContent===name)).onClick());
 const resize=width=>{const target=query('chart-scroll')[0];target.measuredWidth=width;flushSync(()=>{for(const observer of resizers)if(observer.targets.has(target))observer.cb();});};
 const svg=()=>nodes().find(n=>n.localName==='svg'),lines=()=>nodes().filter(n=>n.localName==='polyline');
 const coords=line=>line.getAttribute('points').split(' ').map(p=>p.split(',').map(Number));
 const listValues=()=>query('chart-month-list')[0];
 const check=(props,chartWidth,fontSize=14)=>{
  assert.equal(query('chart-scroll')[0].getAttribute('data-chart-mode'),'overview');
  const [,,width,height]=svg().getAttribute('viewBox').split(' ').map(Number);assert.equal(width,chartWidth);
  assert.ok(!svg().style.minWidth,'overview omits the fixed SVG min-width');
  assert.equal(lines().length,props.series.length);
  for(const line of lines()){
   const points=coords(line);assert.equal(points.length,props.labels.length);
   for(const [x,y]of points){assert.ok(x>=16&&x<=width-16);assert.ok(y>=16&&y<=height-16);}
   assert.ok(points.every((p,i)=>!i||p[0]>points[i-1][0]),'every month keeps a distinct x coordinate');
  }
  assert.equal(query('chart-point-hit').length,props.series.length*props.labels.length);
  assert.equal(query('number-label').length,0,'overview moves potentially overlapping values into month details');
  const labels=nodes().filter(n=>n.localName==='text'&&/^\d{4}\/\d{2}$/.test(n.textContent));
  assert.equal(labels[0].textContent,props.labels[0].replace('-','/'));assert.equal(labels.at(-1).textContent,props.labels.at(-1).replace('-','/'));
  const rows=new Map();
  for(const label of labels){
   const x=Number(label.getAttribute('x')),y=Number(label.getAttribute('y')),half=7*fontSize*.7/2;
   assert.ok(x-half>=0&&x+half<=width);assert.ok(y>=0&&y+4<=height);
   const previous=rows.get(y);if(previous!==undefined)assert.ok(x-previous>=half*2+12-1e-8,'same-row month labels have reserved separation');rows.set(y,x);
  }
  const axis=nodes().filter(n=>n.localName==='text'&&n.getAttribute('aria-label')!==null);
  assert.equal(axis.length,4);
  for(const label of axis){assert.equal(label.textContent,label.getAttribute('aria-label'),'axis wrapping loses no numeric digits');const first=Number(label.getAttribute('y'))+Number(label.firstChild.getAttribute('dy'));assert.ok(first>=fontSize,'wrapped maximum stays below SVG top');}
  assert.equal(query('table-scroll').length,0,'only chart numeric output becomes a vertical list');
  const months=walk(listValues()).filter(n=>n.localName==='li');assert.equal(months.length,props.labels.length);
  months.forEach((item,i)=>{
   assert.equal(walk(item).find(n=>n.localName==='time').getAttribute('dateTime'),props.labels[i]);
   const values=walk(item).filter(n=>n.localName==='dd').map(n=>n.textContent);
   assert.deepEqual(values,props.series.map(s=>props.counts?`${module.exports.number(s.values[i])}件`:module.exports.yen(s.values[i])));
   assert.deepEqual(walk(item).filter(n=>n.localName==='dt').map(n=>n.textContent),props.series.map(s=>s.name));
  });
 };
 let cases=0;
 for(const viewportWidth of [320,390,430,768,820,1024])for(const length of [1,2,6,12,24])for(const pattern of ['zero','equal','large']){
  const labels=Array.from({length},(_,i)=>`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
  const values=labels.map((_,i)=>pattern==='zero'?0:pattern==='equal'?420000:i%2?Number.MAX_SAFE_INTEGER:1);
  const props={labels,series:[{id:'a',name:'合計',values},{id:'b',name:'比較系列',values:values.map(v=>Math.floor(v/2))}],readable:true};
  render(props);resize(viewportWidth-64);await frame(now+16);check(props,viewportWidth-64);cases++;
 }
 // One shared month drives arrows, the in-flow panel, every series' points and details.
 const monthButton=label=>nodes().find(n=>n.localName==='button'&&n.getAttribute('aria-label')===label);
 const step=offset=>flushSync(()=>eventProps(monthButton(offset<0?'前月を表示':'翌月を表示')).onClick());
 const monthTrigger=()=>query('chart-month-trigger')[0],monthPanel=()=>query('chart-month-panel')[0];
 const openMonths=()=>{if(monthTrigger().getAttribute('aria-expanded')!=='true')flushSync(()=>eventProps(monthTrigger()).onClick());};
 const choose=value=>{
  openMonths();
  const candidate=walk(monthPanel()).find(n=>n.localName==='button'&&eventProps(n).value===value);assert.ok(candidate,'candidate is accessible within the existing range');
  flushSync(()=>eventProps(candidate).onClick());
  assert.equal(monthTrigger().getAttribute('aria-expanded'),'false');assert.equal(eventProps(monthPanel()).hidden,true);
  assert.equal(doc.activeElement,monthTrigger(),'selection returns focus to the month trigger');
 };
 const assertMonth=(props,index)=>{
  assert.ok(monthTrigger().textContent.includes(module.exports.month(props.labels[index])));
  const candidates=walk(monthPanel()).filter(n=>n.localName==='button');
  assert.equal(candidates.length,props.labels.length);
  assert.equal(eventProps(candidates[index])['aria-pressed'],true);
  assert.equal(candidates.filter(n=>n.getAttribute('aria-pressed')==='true').length,1);
  assert.ok(candidates[index].textContent.includes('✓'));
  assert.equal(nodes().filter(n=>n.localName==='select').length,0,'monthly controls contain no native select');
  assert.equal(eventProps(monthButton('前月を表示')).disabled,index===0);
  assert.equal(eventProps(monthButton('翌月を表示')).disabled,index===props.labels.length-1);
  const points=query('chart-point-hit').filter(n=>n.getAttribute('aria-pressed')==='true');
  assert.equal(points.length,props.series.length);
  for(const point of points)assert.ok(point.getAttribute('aria-label').includes(module.exports.month(props.labels[index])));
  const detail=query('chart-month-details')[0].textContent;
  assert.ok(detail.includes(module.exports.month(props.labels[index])));
  for(const series of props.series)assert.ok(detail.includes(module.exports.yen(series.values[index])));
 };
 for(const length of [1,2,6,12,24]){
  const labels=Array.from({length},(_,i)=>`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
  const props={labels,series:[{id:'nav-a',name:'A',values:labels.map((_,i)=>100*(i+1))},{id:'nav-b',name:'B',values:labels.map((_,i)=>200*(i+1))}]};
  render(props);resize(256);choose(labels[0]);assertMonth(props,0);step(-1);assertMonth(props,0);
  if(length>1){step(1);assertMonth(props,1);assert.match(query('chart-month-details')[0].textContent,/\+100.00%/);step(-1);assertMonth(props,0);}
  const middle=Math.floor((length-1)/2);choose(labels[middle]);assertMonth(props,middle);
  click('詳細表示');assertMonth(props,middle);click('全体表示');assertMonth(props,middle);
  choose(labels.at(-1));assertMonth(props,length-1);step(1);assertMonth(props,length-1);
  // Graph keyboard focus, touch and pointer hover update that same month.
  let point=query('chart-point-hit')[0];flushSync(()=>eventProps(point).onFocus({currentTarget:point}));assertMonth(props,0);
  point=query('chart-point-hit')[middle];flushSync(()=>eventProps(point).onPointerUp({currentTarget:point,pointerType:'touch'}));assertMonth(props,middle);
  point=query('chart-point-hit')[length-1];flushSync(()=>eventProps(point).onPointerEnter({currentTarget:point,pointerType:'mouse',clientX:200,clientY:100}));assertMonth(props,length-1);
  assert.equal(walk(monthPanel()).some(n=>n.localName==='button'&&eventProps(n).value==='2099-01'),false);assertMonth(props,length-1);
  openMonths();
  assert.equal(monthPanel().getAttribute('role'),'group');assert.equal(monthPanel().getAttribute('id'),monthTrigger().getAttribute('aria-controls'));
  const candidate=walk(monthPanel()).find(n=>n.localName==='button');candidate.focus();
  let prevented=false,stopped=false;
  const escape={key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}};
  flushSync(()=>eventProps(query('chart-month-picker')[0]).onKeyDown(escape));
  assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(doc.activeElement,monthTrigger());assert.equal(eventProps(monthPanel()).hidden,true);assertMonth(props,length-1);
  openMonths();prevented=false;stopped=false;
  eventProps(query('chart-month-picker')[0]).onKeyDown({...escape,key:'Tab'});
  assert.equal(prevented,false);assert.equal(stopped,false,'panel preserves native Tab navigation');
  for(const candidate of walk(monthPanel()).filter(n=>n.localName==='button')){assert.equal(candidate.getAttribute('type'),'button');assert.equal(candidate.getAttribute('tabindex'),null);}
  assert.equal(nodes().some(n=>['listbox','option','dialog'].includes(n.getAttribute('role'))),false);
  const picker=query('chart-month-picker')[0];
  assert.deepEqual(picker.childNodes.filter(n=>n.nodeType===1).map(n=>n.getAttribute('class')),['chart-month-controls','chart-month-panel'],'panel follows controls in normal DOM order');
  assert.ok(nodes().indexOf(query('chart-scroll')[0])<nodes().indexOf(picker));
  if(length===24)for(let index=0;index<24;index++){choose(labels[index]);assertMonth(props,index);}
  choose(labels[0]);flushSync(()=>{eventProps(monthButton('翌月を表示')).onClick();eventProps(monthButton('翌月を表示')).onClick();});assertMonth(props,Math.min(2,length-1));
  choose(labels[0]);await frame(now+16);
  const circles=nodes().filter(n=>n.localName==='circle');
  assert.equal(Number(circles[0].getAttribute('r')),7,'selected month uses the existing point-emphasis motion');
 }
 console.log('Month navigation DOM model: no native select; in-flow button group/unique ARIA target, all 24 choices, selected check/pressed state, Escape/focus return, native Tab model, first/middle/last and disabled/clamped arrows, batched actions, multi-series exact values, graph focus/touch/hover and overview/detail continuity PASS. Native input/layout unverified.');
 const labels=Array.from({length:24},(_,i)=>`${2025+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`);
 const largeProps={labels,series:[{id:'large',name:'大きい金額',values:labels.map(()=>Number.MAX_SAFE_INTEGER)}]};
 render(largeProps);resize(256);nodes().find(n=>n.localName==='text').style.fontSize='28px';resize(256);await frame(now+16);check(largeProps,256,28);
 nodes().find(n=>n.localName==='text').style.fontSize='14px';resize(256);
 let props={labels,series:[{id:'a',name:'支出件数',values:labels.map((_,i)=>i)}],counts:true};
 render(props);resize(256);await frame(now+16);check(props,256);
 choose(labels[1]);
 assert.match(query('chart-month-details')[0].textContent,/2025年2月.*1件.*前月の支出が0円/);
 const details=query('chart-data')[0];details.open=true;
 compact.matches=false;flushSync(()=>compact.dispatchEvent(new Event('change')));await frame(now+16);
 assert.equal(query('chart-month-list').length,0);assert.equal(query('table-scroll').length,1);
 assert.equal(query('chart-month-controls').length,0,'PC adds no month navigation UI');
 assert.equal(nodes().filter(n=>n.localName==='tr').length,25,'PC retains the complete monthly table');
 assert.equal(query('chart-data')[0],details);assert.equal(details.open,true,'numeric disclosure state survives breakpoint changes');
 compact.matches=true;flushSync(()=>compact.dispatchEvent(new Event('change')));resize(256);
 assert.equal(query('chart-data')[0],details);assert.equal(details.open,true);

 // A visible chart retains its drawing through resize/mode/data interruptions.
 preference.matches=false;flushSync(()=>preference.dispatchEvent(new Event('change')));
 for(const observer of observers)if(observer.targets.has(query('chart-scroll')[0]))observer.cb([{target:query('chart-scroll')[0],isIntersecting:true}]);
 await frame(now+16);
 const line=lines()[0],dot=query('chart-point-hit')[0],before=coords(line);
 resize(326);await frame(now);await frame(now+150);assert.notDeepEqual(coords(line),before);
 const midway=coords(line);resize(366);await frame(now);assert.deepEqual(coords(line),midway,'resize retarget starts at the displayed coordinates');
 click('詳細表示');await frame(now);click('全体表示');resize(756);
 props={...props,series:[{...props.series[0],values:labels.map((_,i)=>i*4)}]};render(props);
 await frame(now);await frame(now+150);
 assert.equal(lines()[0],line);assert.equal(query('chart-point-hit')[0],dot,'mode/resize/data changes keep mounted points');
 flushSync(()=>{preference.matches=true;preference.dispatchEvent(new Event('change'));});await frame(now+16);
 check(props,756);assert.equal(line.getAttribute('stroke-dasharray'),'1 1');
 assert.match(query('chart-month-details')[0].textContent,/2025年2月.*4件/,'selected month reads the latest data');
 resize(0);assert.equal(Number(svg().getAttribute('viewBox').split(' ')[2]),756,'hidden zero-width observation retains valid geometry');resize(256);await frame(now+16);check(props,256);

 // Current's real category selection updates the selected-month readout/list.
 const {AnalyticsLinkedCategories}=load(resolve(dirname(chartsPath),'AnalyticsLinkedCategories.tsx'));
 const {initialSelection,aggregateDemo}=load(resolve(dirname(chartsPath),'dedicatedAnalyticsDemoData.ts'));
 const {currentAnalysis}=load(resolve(dirname(chartsPath),'DedicatedAnalytics.tsx'));
 const {demoExpenses}=load(resolve(dirname(chartsPath),'dedicatedAnalyticsDemoExpenses.ts'));
 const a=aggregateDemo(initialSelection),data={...currentAnalysis(a),utilities:[],records:demoExpenses.filter(e=>initialSelection.projectTokens.includes(e.projectToken)&&e.paidOn.slice(0,7)>=initialSelection.startMonth&&e.paidOn.slice(0,7)<=initialSelection.endMonth)};
 flushSync(()=>client.render(React.createElement(AnalyticsLinkedCategories,{data,scope:'b2',sub:'選択期間',current:true})));resize(256);
 choose(data.labels[2]);
 const food=query('f-rank-row').find(n=>n.getAttribute('data-key')==='FOOD');flushSync(()=>eventProps(food).onClick({currentTarget:food,detail:0}));await frame(now+16);
 const amount=data.records.filter(e=>e.category==='FOOD'&&e.paidOn.slice(0,7)===data.labels[2]).reduce((sum,e)=>sum+e.amount,0);
 assert.ok(query('chart-month-details')[0].textContent.includes(module.exports.yen(amount)));assert.match(query('chart-month-details')[0].textContent,/食費/);
 const chartLine=lines()[0],controls=query('analytics-disclosure');
 openMonths();walk(monthPanel()).find(n=>n.localName==='button').focus();
 for(const control of controls)flushSync(()=>eventProps(control).onClick());resize(0);
 assert.equal(doc.activeElement,controls[1],'card collapse moves focus out of the hidden month panel');
 for(const control of controls)flushSync(()=>eventProps(control).onClick());resize(326);await frame(now+16);
 assert.equal(lines()[0],chartLine);assert.ok(query('chart-month-details')[0].textContent.includes(module.exports.yen(amount)));
 assert.equal(monthTrigger().getAttribute('aria-expanded'),'true','mounted card preserves panel disclosure state');
 flushSync(()=>client.unmount());assert.equal(resizers.size,0);assert.equal(observers.size,0);assert.equal(getEventListeners(compact,'change').length,0);
 if(previousResizeObserver===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=previousResizeObserver;
 console.log(`Phase B.2 measured-width DOM model: ${cases} viewport/span/zero-equal-large multi-series geometries plus 28px font geometry, complete points/edges, separated endpoint/month labels, exact wrapped axes, all-month vertical values/counts, month-panel/readout, PC table/disclosure continuity, rapid resize/mode/data Motion retarget/live reduce, hidden widths, category linkage and cleanup PASS. Browser overflow/font metrics/native input/visual acceptance UNVERIFIED.`);
}

// Current uses the real query hooks and API client. Only HTTP and the DOM are simulated.
{
 const {default:Current}=load(resolve(dirname(chartsPath),'DedicatedAnalyticsCurrent.tsx'));
 const {analyticsKeys,invalidateProjectAnalytics}=load(resolve(dirname(chartsPath),'../../features/analytics/analyticsQueries.ts'));
 const {projectKeys,useDeleteProjectMutation}=load(resolve(dirname(chartsPath),'../../features/projects/projectQueries.ts'));
 const {currentMonth,previousMonth}=load(resolve(dirname(chartsPath),'../../features/projects/monthSelection.ts'));
 const project=(letter,type='CONTINUOUS')=>({publicToken:letter.repeat(43),name:`Project ${letter}`,type});
 const a=project('A'),b=project('B'),event=project('E','EVENT');
 const end=currentMonth(),start=previousMonth(end);
 const node=doc.createElement('div'),client=createRoot(node);
 const queryClient=new reactQuery.QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false,staleTime:30_000},mutations:{gcTime:Infinity}}});
 let deletion;
 function DeleteHarness(){deletion=useDeleteProjectMutation();return null;}
 function render(showCurrent) {
   flushSync(()=>client.render(React.createElement(reactQuery.QueryClientProvider,{client:queryClient},
     React.createElement(DeleteHarness),showCurrent ? React.createElement('div',{'data-analytics-v4':'','data-theme':'dark'},
       React.createElement('div',{className:'main'},React.createElement(Current))) : null)));
 }
 const currentScope=()=>walk(node).find(element=>element.getAttribute?.('data-current-analytics')==='true');
 const scoped=(predicate)=>{
   const element=walk(node).find(predicate);
   assert.ok(element && currentScope().contains(element),'Current CSS marker contains the rendered target');
   return element;
 };
 const wasCompact=desktopViewport.matches,wasReduced=preference.matches;
 desktopViewport.matches=true;
 const originalFetch=globalThis.fetch,requests=[];
 globalThis.fetch=(path,{signal,method})=>new Promise(resolve=>requests.push({
   path,signal,method,send(body,status=200){resolve(new Response(status===204 ? null : JSON.stringify(body),{status}));},
 }));
 const waitFor=async predicate=>{
   for(let attempt=0;attempt<100;attempt++){
     if(predicate())return;
     await new Promise(resolve=>setTimeout(resolve,5));
   }
   assert.fail(`Timed out: ${node.textContent}`);
 };
 const click=label=>{
   const button=walk(node).find(element=>element.localName==='button'&&element.textContent===label);
   assert.ok(button,label);
   flushSync(()=>eventProps(button).onClick({currentTarget:button,detail:1}));
 };
 const select=name=>{
   const option=walk(node).find(element=>element.localName==='label'&&element.textContent===`${name}継続`);
   const input=option?.childNodes.find(element=>element.localName==='input');
   assert.ok(input,name);
   assert.equal(eventProps(input).type,'checkbox');
   flushSync(()=>eventProps(input).onChange());
 };
 const changePeriodControl=(field,part,value)=>{
   const input=walk(node).find(element=>element.getAttribute?.('id')===`analytics-${field}-${part}`);
   flushSync(()=>eventProps(input).onChange({target:{value}}));
 };
 const setMonth=(field,value)=>{
   const [year,month]=value.split('-');
   changePeriodControl(field,'year',year);
   changePeriodControl(field,'month',month);
 };
 const read=async (index,path)=>{
   await waitFor(()=>requests.length>index);
   assert.equal(requests[index].path,path);
   return requests[index];
 };
 const analyticsPath=(projects,startMonth,endMonth)=>`/api/analytics?startMonth=${startMonth}&endMonth=${endMonth}&projectType=CONTINUOUS${projects.map(project=>`&projectToken=${project.publicToken}`).join('')}`;
 const arcs=()=>walk(node).filter(element=>element.localName==='circle'&&element.getAttribute('r')==='64');
 const ring=()=>arcs()[0].ownerSVGElement;
 const painted=()=>arcs().reduce((total,arc)=>total+parseFloat(arc.getAttribute('stroke-dasharray')),0);
 const safeArcs=()=>{
   let paintedEnd=0;
   for(const arc of arcs()){
     const [length,gap]=arc.getAttribute('stroke-dasharray').split(' ').map(Number);
     const start=-Number(arc.getAttribute('stroke-dashoffset'));
     assert.equal(arc.getAttribute('pathLength'),'1');
     assert.equal(gap,1);
     assert.equal(arc.getAttribute('stroke-linecap'),'butt');
     assert.ok(length>=0&&start>=paintedEnd-1e-9&&start+length<=1+1e-9);
     assert.doesNotMatch(arc.parentElement.style.transform??'',/translate/);
     paintedEnd=start+length;
   }
 };
 const finishReveal=async ()=>{
   await tick(0);assert.equal(painted(),0);safeArcs();
   await tick(575);assert.ok(painted()>0&&painted()<1);safeArcs();
   await tick(575);assert.ok(Math.abs(painted()-1)<1e-9);safeArcs();
 };
 const monthDetails=()=>walk(node).find(element=>hasClass(element,'chart-month-details')).textContent;
 const endMonthKpi=()=>walk(node).find(element=>element.getAttribute?.('data-kpi')==='終了月の前月比').textContent;
 const pointLabel=()=>walk(node).find(element=>hasClass(element,'chart-point-hit')).getAttribute('aria-label');
 const selectCategory=key=>{
   const row=walk(node).find(element=>hasClass(element,'f-rank-row')&&element.getAttribute('data-key')===key);
   assert.ok(row,key);
   flushSync(()=>eventProps(row).onClick({currentTarget:row,detail:0}));
 };
 const response=(projects,months,amounts,comparison,categoryBreakdown,projectAmounts)=>{
   const items=months.map((month,index)=>({month,totalExpense:amounts[index],expenseCount:amounts[index]?1:0}));
   const last=items.at(-1);
   return {projectType:'CONTINUOUS',eventInclusion:'EXCLUDED',currency:'JPY',includedProjectTokens:projects.map(p=>p.publicToken),excludedProjects:[],
     period:{startMonth:months[0],endMonth:last.month},totalExpense:amounts.reduce((total,amount)=>total+amount,0),
     expenseCount:items.filter(item=>item.expenseCount).length,
     endMonthComparison:{...comparison,month:last.month,totalExpense:last.totalExpense},categoryBreakdown,monthlyTrend:items,
     projectComparison:projects.map(({publicToken,name},index)=>({publicToken,name,totalExpense:projectAmounts[index],expenseCount:projectAmounts[index]?1:0}))};
 };
 try {
   await setPreference(false);
   render(true);
   assert.match(node.textContent,/Project一覧を読み込み中/);
   assert.ok(hasClass(currentScope().parentElement,'main'));
   assert.equal(currentScope().parentElement.parentElement.getAttribute('data-analytics-v4'),'');
   scoped(element=>element.localName==='h1'&&element.textContent==='支出分析');
   (await read(0,'/api/projects')).send({},500);
   await waitFor(()=>node.textContent.includes('Project一覧を取得できませんでした'));
   click('再試行');
   (await read(1,'/api/projects')).send([a,b,event]);
   await waitFor(()=>node.textContent.includes('集計する継続Projectを選択'));
   scoped(element=>hasClass(element,'filter-row'));
   assert.equal(scoped(element=>hasClass(element,'project-selection-label')).textContent,'プロジェクトを選択');
   assert.equal(requests.length,2,'no implicit ledger request');
   assert.doesNotMatch(node.textContent,/Project E/);
   select(a.name);
   const older=await read(2,analyticsPath([a],end,end));
   assert.match(node.textContent,/支出データを読み込み中/);
   select(b.name);
   const latest=await read(3,analyticsPath([a,b],end,end));
   assert.equal(older.signal.aborted,true);
   const previousZero={previousMonth:start,previousTotalExpense:0,difference:1234,percentageChange:null,comparisonState:'NO_PREVIOUS_DATA'};
   const october=response([a,b],[end],[1234],previousZero,[{category:null,totalExpense:1234,expenseCount:1}],[0,1234]);
   latest.send(october);
   await waitFor(()=>node.textContent.includes('¥1,234'));
   assert.equal(painted(),0);
   observeTarget(ring(),true);await finishReveal();
   older.send(response([a],[end],[9999],previousZero,[],[9999]));
   await new Promise(setImmediate);
   assert.match(endMonthKpi(),/前月の支出なし/);
   assert.match(monthDetails(),/前月の支出が0円/);
   assert.match(pointLabel(),/前月の支出なし/);
   assert.doesNotMatch(monthDetails(),/比較対象月なし/);
   selectCategory('unclassified');
   const linked=scoped(element=>element.getAttribute?.('data-linked-categories')==='category');
   const frame=walk(linked).find(element=>hasClass(element,'linked-category-selection'));
   assert.ok(frame);
   assert.equal(frame.parentElement.getAttribute('role'),'button');
   assert.equal(frame.parentElement.getAttribute('aria-pressed'),'true');
   assert.equal(frame.parentElement.getAttribute('tabindex'),'0');
   const arc=walk(linked).find(element=>hasClass(element,'linked-donut-arc'));
   assert.ok(arc && arc.childNodes.some(element=>hasClass(element,'linked-donut-hit')));
   assert.ok(walk(arc).some(element=>hasClass(element,'linked-donut-focus')));
   assert.match(monthDetails(),/未分類.*前月のカテゴリ内訳は未取得/);
   assert.match(pointLabel(),/前月のカテゴリ内訳は未取得/);
   assert.doesNotMatch(monthDetails(),/前月の支出が0円|比較対象月なし/);
   click('選択解除');
   const singleMonthKey=analyticsKeys.overview([a.publicToken,b.publicToken],end,end);
   const comparable={previousMonth:start,previousTotalExpense:1000,difference:234,percentageChange:'23.40',comparisonState:'COMPARABLE'};
   queryClient.setQueryData(singleMonthKey,response([a,b],[end],[1234],comparable,october.categoryBreakdown,[0,1234]));
   await waitFor(()=>endMonthKpi().includes('+23.40%'));
   assert.match(monthDetails(),/\+23.40%/);
   assert.match(pointLabel(),/\+23.40%/);
   assert.match(node.textContent,/未分類/);
   assert.doesNotMatch(node.textContent,/¥9,999|比較率.*100\.00%/);
   queryClient.setQueryData(singleMonthKey,response([a,b],[end],[0],{
     previousMonth:start,previousTotalExpense:0,difference:0,percentageChange:null,comparisonState:'BOTH_MONTHS_EMPTY',
   },[],[0,0]));
   await waitFor(()=>endMonthKpi().includes('両月の支出なし'));
   assert.match(monthDetails(),/両月の支出が0円/);
   assert.doesNotMatch(monthDetails(),/比較対象月なし|0\.00%/);
   for(const [year,error] of [['','西暦4桁'],['0000','西暦4桁'],['12345','西暦4桁'],['20x6','西暦4桁'],['9999','終了年月以前'],['0001','最大24か月']]){
     changePeriodControl('start','year',year);
     click('適用');
     assert.match(walk(node).find(n=>n.getAttribute?.('id')==='filterError').textContent,new RegExp(error));
     assert.equal(requests.length,4,'invalid Apply sends no request');
   }
   setMonth('start',start);
   assert.equal(requests.length,4,'draft changes do not fetch');
   click('適用');
   (await read(4,analyticsPath([a,b],start,end))).send({},500);
   await waitFor(()=>node.textContent.includes('支出データを取得できませんでした'));
   assert.doesNotMatch(node.textContent,/¥1,234|支出はありません/);
   click('再試行');
   const twoMonth=response([a,b],[start,end],[200,500],{
     previousMonth:start,previousTotalExpense:200,difference:300,percentageChange:'150.00',comparisonState:'COMPARABLE',
   },[{category:'FOOD',totalExpense:200,expenseCount:1},{category:'OTHER',totalExpense:500,expenseCount:1}],[200,500]);
   (await read(5,analyticsPath([a,b],start,end))).send(twoMonth);
   await waitFor(()=>node.textContent.includes('¥700'));
   assert.match(node.textContent,/\+150\.00%/);
   assert.match(node.textContent,/食費/);
   assert.match(node.textContent,/その他/);
   assert.doesNotMatch(node.textContent,/未分類|¥1,234/);
   assert.equal(painted(),0,'changed range starts at zero only after the HTTP response');
   observeTarget(ring(),true);await finishReveal();
   const stableRing=ring();
   const foodRow=walk(node).find(n=>hasClass(n,'f-rank-row')&&n.getAttribute('data-key')==='FOOD');
   const hit=id=>walk(node).find(n=>hasClass(n,'linked-donut-hit')&&n.getAttribute('data-category-control')===id);
   const exact=()=>walk(node).find(n=>hasClass(n,'linked-donut-exact')).textContent;
   const overallPoint=pointLabel();
   foodRow.focus();selectCategory('FOOD');await tick(0);await tick(180);
   assert.equal(hit('FOOD').getAttribute('aria-pressed'),'true');
   assert.match(exact(),/食費 ¥200/);
   const otherArc=arcs().find(n=>n.getAttribute('data-category-id')==='OTHER');
   assert.equal(Number(otherArc.style.opacity),.45);
   assert.equal(pointLabel(),overallPoint,'period categories do not invent monthly category values');
   const reveals=()=>animations.filter(a=>a.options.duration===1.15).length;
   const firstRevealCount=reveals();
   changePeriodControl('start','year','1999');setMonth('start',start);
   await tick(16);assert.equal(reveals(),firstRevealCount);assert.ok(Math.abs(painted()-1)<1e-9);
   click('適用');await tick(0);assert.equal(painted(),0);
   await tick(280);assert.ok(painted()>0&&painted()<1);safeArcs();
   click('適用');await finishReveal();
   assert.equal(reveals(),firstRevealCount+2);
   assert.equal(ring(),stableRing);assert.equal(doc.activeElement,foodRow);
   assert.equal(hit('FOOD').getAttribute('aria-pressed'),'true');
   flushSync(()=>eventProps(hit('FOOD')).onClick());await tick(0);await tick(180);
   assert.equal(foodRow.getAttribute('aria-pressed'),'false');
   assert.equal(Number(otherArc.style.opacity),1);
   assert.match(exact(),/期間支出総額 ¥700/);
   await setPreference(true);
   const reducedRevealCount=reveals();
   click('適用');await tick(0);assert.equal(reveals(),reducedRevealCount);assert.ok(Math.abs(painted()-1)<1e-9);
   safeArcs();await setPreference(false);

   const stale=queryClient.refetchQueries({queryKey:['analytics','overview'],type:'active'});
   const staleRead=await read(6,analyticsPath([a,b],start,end));
   await waitFor(()=>queryClient.isFetching({queryKey:['analytics','overview']})===1);
   await tick(16);
   const waitingRevealCount=reveals();
   click('適用');await tick(0);
   assert.equal(reveals(),waitingRevealCount,'Apply waits while a replacement response is in flight');
   assert.ok(Math.abs(painted()-1)<1e-9);
   const refreshed=invalidateProjectAnalytics(queryClient,b.publicToken);
   const freshRead=await read(7,analyticsPath([a,b],start,end));
   assert.equal(staleRead.signal.aborted,true);
   await waitFor(()=>!node.textContent.includes('¥700'));
   freshRead.send(response([a,b],[start,end],[200,600],{
     previousMonth:start,previousTotalExpense:200,difference:400,percentageChange:'200.00',comparisonState:'COMPARABLE',
   },[{category:'FOOD',totalExpense:200,expenseCount:1},{category:'OTHER',totalExpense:600,expenseCount:1}],[200,600]));
   await refreshed;
   staleRead.send(twoMonth);
   await stale;
   await waitFor(()=>node.textContent.includes('¥800'));
   assert.doesNotMatch(node.textContent,/¥700/);
   assert.equal(painted(),0);
   observeTarget(ring(),true);await finishReveal();
   assert.equal(reveals(),waitingRevealCount+1,'only the latest ready result starts a reveal');

   select(a.name);
   (await read(8,analyticsPath([b],start,end))).send(twoMonth);
   await waitFor(()=>node.textContent.includes('支出データを取得できませんでした'));
   assert.doesNotMatch(node.textContent,/¥700|¥800/);
   setMonth('start','0001-01');
   setMonth('end','0001-01');
   click('適用');
   (await read(9,analyticsPath([b],'0001-01','0001-01'))).send(response([b],['0001-01'],[0],{
     previousMonth:null,previousTotalExpense:null,difference:null,percentageChange:null,comparisonState:'NO_PREVIOUS_MONTH',
   },[],[0]));
   await waitFor(()=>node.textContent.includes('対象期間の支出はありません'));
   assert.match(endMonthKpi(),/比較できる前月がありません/);
   assert.match(monthDetails(),/比較対象月なし/);
   assert.match(pointLabel(),/比較対象月なし/);
   assert.doesNotMatch(node.textContent,/前月の支出なし|¥800/);

   // Revisit a fresh, cached multiple-Project range before deleting one member.
   setMonth('start',start);
   setMonth('end',end);
   click('適用');
   select(a.name);
   await waitFor(()=>node.textContent.includes('¥800'));
   const overviewKey=analyticsKeys.overview([a.publicToken,b.publicToken],start,end);
   const unrelatedKey=analyticsKeys.overview([a.publicToken],start,end);
   const unrelated=response([a],[start,end],[0,55],{
     previousMonth:start,previousTotalExpense:0,difference:55,percentageChange:null,comparisonState:'NO_PREVIOUS_DATA',
   },[{category:'FOOD',totalExpense:55,expenseCount:1}],[55]);
   queryClient.setQueryData(unrelatedKey,unrelated);
   queryClient.setQueryData(singleMonthKey,october);

   const race=requests.length;
   const oldOverview=queryClient.refetchQueries({queryKey:overviewKey,exact:true});
   const oldCatalog=queryClient.refetchQueries({queryKey:projectKeys.analyticsCatalog,exact:true});
   const overviewRead=await read(race,analyticsPath([a,b],start,end));
   const catalogRead=await read(race+1,'/api/projects');
   const deleteProject=deletion.mutateAsync(b);
   const deleteRead=await read(race+2,'/api/projects/'+b.publicToken);
   assert.equal(deleteRead.method,'DELETE');
   deleteRead.send(null,204);
   await deleteProject;
   const replacement=await read(race+3,'/api/projects');
   assert.equal(overviewRead.signal.aborted,true);
   assert.equal(catalogRead.signal.aborted,true);
   await waitFor(()=>!node.textContent.includes(b.name));
   assert.doesNotMatch(node.textContent,/¥800|¥1,234/);
   assert.equal(queryClient.getQueryState(overviewKey),undefined);
   assert.equal(queryClient.getQueryState(singleMonthKey).isInvalidated,true);
   assert.deepEqual(queryClient.getQueryData(unrelatedKey),unrelated);
   assert.equal(queryClient.getQueryState(unrelatedKey).isInvalidated,false);
   replacement.send([a,event]);
   await waitFor(()=>node.textContent.includes("Projectを再選択してください"));
   assert.doesNotMatch(node.textContent,/適用中：/);
   select(a.name);
   click('適用');
   await waitFor(()=>node.textContent.includes('¥55'));

   overviewRead.send(twoMonth);
   catalogRead.send([a,b,event]);
   await Promise.all([oldOverview,oldCatalog]);
   assert.deepEqual(queryClient.getQueryData(projectKeys.analyticsCatalog),[a,event]);
   render(false);
   await queryClient.invalidateQueries({queryKey:projectKeys.analyticsCatalog,refetchType:"none"});
   render(true);
   const remountRead=await read(race+4,'/api/projects');
   assert.doesNotMatch(node.textContent,/Project B|¥800|¥1,234/);
   setMonth('start',start);
   select(a.name);
   assert.doesNotMatch(node.textContent,/¥55/,'a draft period still needs Apply after Project selection');
   click('適用');
   await waitFor(()=>node.textContent.includes('¥55'));
   assert.doesNotMatch(node.textContent,/Project B|¥800|¥1,234/);
   assert.equal(requests.length,race+5,'only the catalog refetches; the unaffected selection remains usable');
   remountRead.send([a,event]);

   const key='spendingmate.dev.analytics.selection';
   const stored=new Map();
   win.sessionStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
   click('適用');
   const saved={projectTokens:[a.publicToken],startMonth:start,endMonth:end};
   assert.deepEqual(JSON.parse(stored.get(key)),saved);
   setMonth('start',end);
   assert.deepEqual(JSON.parse(stored.get(key)),saved,'draft dates are not persisted');
   let next=requests.length;
   for(const reload of [false,true]){
     render(false);
     if(reload)queryClient.clear();
     render(true);
     const catalog=await read(next++,'/api/projects');
     assert.doesNotMatch(node.textContent,/¥55/);
     assert.equal(requests.length,next,'wait for the fresh catalog even with cached results');
     catalog.send([a,event]);
     (await read(next++,analyticsPath([a],start,end))).send(queryResponseForRestore());
     await waitFor(()=>node.textContent.includes('¥55'));
     assert.equal(eventProps(walk(node).find(n=>n.getAttribute?.('id')==='analytics-start-month')).value,start.slice(5));
   }

   function queryResponseForRestore(){
     return response([a],[start,end],[20,35],{
       previousMonth:start,previousTotalExpense:20,difference:15,percentageChange:'75.00',comparisonState:'COMPARABLE',
     },[{category:'FOOD',totalExpense:55,expenseCount:2}],[55]);
   }

   for(const invalid of [
     {...saved,projectTokens:[a.publicToken,a.publicToken]},
     {...saved,startMonth:'0000-01'},
     {...saved,startMonth:'0001-01'},
     {...saved,projectTokens:Array.from({length:21},(_,i)=>String(i).padStart(43,'0'))},
     {...saved,projectTokens:[a.publicToken,b.publicToken]},
   ]){
     render(false);
     stored.set(key,JSON.stringify(invalid));
     render(true);
     (await read(next++,'/api/projects')).send([a,event]);
     await waitFor(()=>!stored.has(key));
     assert.doesNotMatch(node.textContent,/¥55/);
     assert.equal(requests.length,next,'invalid or missing selections do not fetch even a subset');
     if(invalid.projectTokens.includes(b.publicToken))assert.match(node.textContent,/再選択してください/);
   }
   render(false);
   Object.defineProperty(win,'sessionStorage',{configurable:true,get(){throw new Error('storage disabled');}});
   render(true);
   select(a.name);
   (await read(next++,analyticsPath([a],end,end))).send(response([a],[end],[35],previousZero,
     [{category:'FOOD',totalExpense:35,expenseCount:1}],[35]));
   await waitFor(()=>node.textContent.includes('¥35'));
 }finally{
   flushSync(()=>client.unmount());
   desktopViewport.matches=wasCompact;
   preference.matches=wasReduced;
   queryClient.clear();
   globalThis.fetch=originalFetch;
   delete win.sessionStorage;
 }
 console.log('DEV Current API: selection, retry, invalidation, single-month API comparison and category-history states, deletion during catalog/overview reads, cached ranges and remount PASS.');
}
