import { AnalyticsLinkedCategories } from "./AnalyticsLinkedCategories";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { LayoutGroup, motion } from "motion/react";
import type { AnalyticsSelection } from "./dedicatedAnalyticsPresentation";
import { monthIndex } from "./dedicatedAnalyticsPresentation";
import { demoProjects } from "./dedicatedAnalyticsDemoData";
import { AllAnalysis, Card, Chart, ComparisonMetric, DataTable, Metric, Rank, RankBar, Segmented, month, number, rankFoot, signed, yen } from "./AnalyticsV4Charts";
import { compare, contracts, futureAnalysis, monthAt, sum, utilities } from "./analyticsFuturePreviewData";
import type { FutureTab } from "./analyticsFuturePreviewData";

type Result = ReturnType<typeof futureAnalysis>;
const linkedScope = (selection: AnalyticsSelection, dimension: string) => JSON.stringify([dimension,[...selection.projectTokens].sort(),selection.startMonth,selection.endMonth]);
type PreviewViews = { year: string; member: string };
const tag = <span className="pro-tag">PRO候補</span>;
function ProHeading({children}:{children:ReactNode}) {return <div className="pro-heading">{tag}<span>{children}</span><span>将来構想・未承認</span></div>;}
function ProPreview({children,onPro}:{children:ReactNode;onPro:()=>void}) {return <aside className="pro-preview"><div><h3>Proで追加する分析の構想 {tag}</h3><p>{children}</p></div><button onClick={onPro}>Proのサンプルを見る →</button></aside>;}

function DeltaCard({a,selection,tab,scenario}:{a:Result;selection:AnalyticsSelection;tab:FutureTab;scenario:string}) {
  const options={...selection,startMonth:selection.endMonth},current=futureAnalysis(options,tab,scenario),prev=futureAnalysis({...selection,startMonth:a.previousMonth,endMonth:a.previousMonth},tab,scenario);
  if(a.comparison.previous === null)return <Card title="支出増減の内訳" sub="終了月と直前月の比較" extra={tag}><p>比較元データ未取得のため表示できません。</p></Card>;
  const definitions=tab === "utilities" ? utilities : [{id:"FOOD",name:"食費"},{id:"UTILITIES",name:"光熱費"},{id:"TRANSPORTATION",name:"交通費"},{id:"ACCOMMODATION",name:"宿泊費"},{id:"DAILY_NECESSITIES",name:"日用品"},{id:"ENTERTAINMENT",name:"娯楽費"},{id:"OTHER",name:"その他"},{id:null,name:"未分類"}];
  const rows=definitions.map(c => ({...c,amount:sum([(tab === "utilities" ? current.utilities : current.categories).find(r => r.id === c.id)?.amount ?? 0,-(scenario === "previous-zero" ? 0 : (tab === "utilities" ? prev.utilities : prev.categories).find(r => r.id === c.id)?.amount ?? 0)])}));
  const max=Math.max(1,...rows.map(r => Math.abs(r.amount)));
  return <Card title="支出増減の内訳" sub={`${month(selection.endMonth)}と${month(a.previousMonth)}を比較`} extra={tag} foot="支出額の変化であり、良否の評価や原因の推測ではありません。"><div className="delta-summary">{signed(a.comparison.difference ?? 0)}<small>終了月の支出変化</small></div>{rows.map(r => <div className="delta-row" key={`${tab}:${r.id ?? "unclassified"}`}><span>{r.name}</span><RankBar key={Math.sign(r.amount)} className="delta-track" target={`${Math.abs(r.amount)/max*100}%`} color={`var(${r.amount < 0 ? "--negative" : "--red"})`} /><strong>{r.amount > 0 ? "↑" : r.amount < 0 ? "↓" : "→"} {signed(r.amount)}</strong></div>)}<div className="delta-check">内訳の合計 <b>{signed(sum(rows.map(r => r.amount)))}</b></div></Card>;
}
function MemberCard({a,selection,member,setMember}:{a:Result;selection:AnalyticsSelection;member:string;setMember:(v:string)=>void}) {
  const token=selection.projectTokens.includes(member) ? member : selection.projectTokens[0],p=demoProjects.find(p => p.publicToken === token)!;
  const records=a.records.filter(e => e.projectToken === token),total=sum(records.map(e => e.amount));
  return <Card title="共同生活の立替負担" sub="Project内の立替額と負担割当額を比較" extra={tag} foot="異なるProjectの同名メンバーは統合しません。差額は精算金額や送金指示ではありません。"><div className="member-controls" role="group" aria-label="立替負担の対象Project">{a.projects.map(p => <button key={p.id} aria-pressed={token === p.id} onClick={() => setMember(p.id!)}>{p.name}</button>)}</div><p className="member-project-summary">{`${p.name} · 期間支出総額 ${yen(total)}`}</p><DataTable columnRoles={[undefined,"amount","amount",undefined,"amount"]} headers={["Project内メンバー","立替総額","負担割当額","支出件数","立替 − 負担"]} rows={[["a","Aさん"],["b",token === "p2" ? "Cさん" : token === "p3" ? "Dさん" : "Bさん"]].map(([id,name]) => {const paid=sum(records.filter(e => e.payer === id).map(e => e.amount)),burden=sum(records.flatMap(e => e.allocations.filter(s => s.memberId === id).map(s => s.amount)));return [name,yen(paid),yen(burden),`${number(records.filter(e => e.payer === id).length)}件`,signed(paid-burden)];})} /></Card>;
}
function UtilitiesPage({a,selection,scenario,pro,onPro,views,onViews}:{a:Result;selection:AnalyticsSelection;scenario:string;pro:boolean;onPro:()=>void;views:PreviewViews;onViews:(v:PreviewViews)=>void}) {
  const year=views.year,setYear=(v:string)=>onViews({...views,year:v}),start=monthAt(monthIndex(selection.endMonth)-11);
  const history=start >= "2024-10" ? futureAnalysis({...selection,startMonth:start},"utilities",scenario) : null;
  const controls=(value:string,onChange:(v:string)=>void,label:string) => <Segmented label={label} options={[["total","合計"],["items","費目別"]]} value={value} onChange={onChange} />;
  return <><section className="f-kpis" aria-label="分析サマリー"><Metric label="期間の光熱・通信費" value={yen(a.total)} note="5費目の支払日が期間内の支出" /><Metric label="月平均支出" value={yen(a.total/a.labels.length)} note={`${a.labels.length}か月で除算・円単位で四捨五入`} /><ComparisonMetric compact comparison={a.comparison} end={selection.endMonth} prior={a.previousMonth} />{pro ? <ComparisonMetric compact label="終了月の前年同月比" comparison={a.yearComparison} end={selection.endMonth} prior={a.yearMonth} /> : null}</section>
    <AnalyticsLinkedCategories data={a} scope={linkedScope(selection,"utilities")} dimension="utility" title="光熱・通信費の月次推移" totalName="合計" sub="5費目の合計" />
    {pro ? <><ProHeading>固定費の長期的な変化</ProHeading>{history ? <Card title="過去12か月の支出推移" sub={`${month(start)}〜${month(selection.endMonth)} · 集計期間外を含む比較用サンプル`} extra={controls(year,setYear,"過去12か月の推移表示")} foot={`過去12か月合計 ${yen(history.total)} · 月平均 ${yen(history.total/12)}`}><Chart readable series={year === "total" ? [{id:"utilities-history-total",name:"光熱・通信費",values:history.trend.map(t => t.amount)}] : history.utilities} labels={history.labels} /></Card> : <Card title="過去12か月の支出推移" sub="比較用サンプル" extra={tag}><p>必要な過去データが収録範囲にないため表示できません。</p></Card>}
      <Card title="費目別の前年同月比" sub={`${month(selection.endMonth)}と${month(a.yearMonth)}を比較`} extra={tag} foot="前年同月は共通の支出データから集計。未収録を0円として扱いません。"><DataTable columnRoles={[undefined,"amount","amount","amount","percentage"]} headers={["費目",month(a.yearMonth),month(selection.endMonth),"差額","比較率"]} rows={a.utilities.map(u => {const c=compare(u.current,u.priorYear);return [u.name,c.previous === null ? "未取得" : yen(c.previous),yen(c.current),c.difference === null ? "—" : signed(c.difference),c.rate === null ? "比較不可" : `${(c.difference ?? 0) > 0 ? "+" : ""}${c.rate}%`];})} /></Card><DeltaCard a={a} selection={selection} scenario={scenario} tab="utilities" /></> : <ProPreview onPro={onPro}>費目別の前年同月比較、過去12か月の推移、増減内訳を追加表示します。</ProPreview>}
  </>;
}
function LivingPage({a,selection,pro,onPro}:{a:Result;selection:AnalyticsSelection;pro:boolean;onPro:()=>void}) {
  return <><section className="f-kpis living-kpis" aria-label="分析サマリー"><Metric label="期間生活費総額" value={yen(a.total)} note="暫定分類：食費・日用品・交通費" /><Metric label="生活費の支出件数" value={<>{number(a.count)}<span className="f-unit">件</span></>} note="支払日が対象期間内のExpense件数" /><Metric label="1件あたり平均支出" value={a.count ? yen(a.total/a.count) : "—"} note="生活費総額 ÷ 支出件数・円単位で四捨五入" /><ComparisonMetric compact comparison={a.comparison} end={selection.endMonth} prior={a.previousMonth} /></section>
    <AnalyticsLinkedCategories data={a} scope={linkedScope(selection,"living")} title="生活費の月次推移" totalName="生活費" sub="食費・日用品・交通費の合計" /><Card title="支出件数の月次推移" sub="Expenseの件数・実際の買い物回数ではありません"><Chart readable series={[{id:"expense-count",name:"支出件数",values:a.trend.map(t => t.count)}]} labels={a.labels} counts /></Card>
    {pro ? <><ProHeading>支出頻度の詳細</ProHeading><Card title="支出頻度の詳細" sub="支払日のデモ記録に基づく集計" extra={tag} foot="同じ支払日は重複除外。Expense件数と買い物回数は異なります。店舗・商品・買い物IDの記録はありません。"><DataTable columnRoles={[undefined,undefined,"amount"]} headers={["年月","支出件数","1件平均額","支出があった日数"]} rows={a.labels.map(m => {const records=a.records.filter(e => e.paidOn.startsWith(m));return [month(m),`${records.length}件`,records.length ? yen(sum(records.map(e => e.amount))/records.length) : "—",`${new Set(records.map(e => e.paidOn)).size}日`];})} /></Card></> : <ProPreview onPro={onPro}>月別の1件平均額と支払日の頻度を追加表示します。</ProPreview>}</>;
}
function SubscriptionPage({a,selection,pro,onPro}:{a:Result;selection:AnalyticsSelection;pro:boolean;onPro:()=>void}) {
  const items=contracts.filter(c => selection.projectTokens.includes(c.projectId)),active=items.filter(c => c.status === "active" && c.start <= "2026-10-31");
  const yearly=(s:typeof contracts[number]) => s.amount*(s.cycle === "monthly" ? 12 : 1),monthly=(s:typeof contracts[number]) => yearly(s)/12,annual=sum(active.map(yearly));
  const payments=Array.from({length:6},(_,i) => {const m=monthAt(monthIndex("2026-11")+i);return {month:m,amount:sum(active.filter(c => m >= c.next.slice(0,7) && (c.cycle === "monthly" || m.slice(5) === c.next.slice(5,7))).map(c => c.amount))};});
  return <><section className="f-kpis" aria-label="分析サマリー"><Metric label="期間内の実支払額" value={yen(a.total)} note="支払日が対象期間内・日用品支出の部分集合" /><Metric label="有効なサブスク" value={<>{number(active.length)}<span className="f-unit">件</span></>} note="2026-10-31時点の架空契約" /><Metric label="契約の月額換算合計" value={yen(annual/12)} note="基準日時点の年額 ÷ 12・実支払額とは別指標" />{pro ? <Metric label="契約上の年間支払見込額" value={yen(annual)} note="基準日時点の契約を12か月維持した場合" /> : null}</section>
    <Card title="サービス別支払額・契約一覧" sub="契約情報の基準日：2026年10月31日。実支払額のみ選択期間に連動。" foot={`実支払合計 ${yen(a.total)}。サブスクはカテゴリと別の属性です。「すべて」の支出へ再加算しません。`}>{items.length ? <DataTable columnRoles={[undefined,"amount","amount","amount"]} headers={["サービス","期間内実支払額","請求周期・契約金額","月額換算","次回更新予定","状態"]} rows={items.map(s => [<div className="service-name"><span className="service-icon">{s.name[0]}</span><span>{s.name}<small>{s.kind}</small></span></div>,yen(sum(a.records.filter(e => e.contractId === s.id).map(e => e.amount))),`${s.cycle === "monthly" ? "月額" : "年額"} ${yen(s.amount)}`,yen(monthly(s)),s.next,<span className="service-state">有効</span>])} /> : <div className="empty-state">選択したProjectにサンプル契約はありません。</div>}</Card>
    <Card title="サブスクの実支払推移" sub="契約上の換算額ではなく、支払日の記録を集計"><Chart readable series={[{id:"subscription-payments",name:"実支払額",values:a.trend.map(t => t.amount)}]} labels={a.labels} /></Card>
    {pro ? <><ProHeading>定期支払分析と更新予定</ProHeading><Card title="サービス別の年間コスト" sub="2026年10月31日時点の契約を維持する場合の換算額" extra={tag} foot={rankFoot}><Rank rows={active.map((s,i) => ({id:s.id,name:s.name,amount:yearly(s),color:["--c1","--c2","--c3","--c4"][i]}))} total={annual} /></Card>
      <Card title="更新カレンダー" sub="契約に記録された次回更新予定日" extra={tag}>{active.length ? [...active].sort((a,b) => a.next.localeCompare(b.next)).map(s => <div className="date-panel" key={s.id}><span className="date">{s.next}</span><span className="service">{s.name}<small>{` · ${demoProjects.find(p => p.publicToken === s.projectId)?.name} / ${s.payer === "a" ? "Aさん" : "Bさん"}`}</small></span><strong>{yen(s.amount)}</strong></div>) : <p>対象契約なし</p>}</Card>
      <Card title="登録契約に基づく将来の支払予定" sub="2026年11月〜2027年4月 · 固定基準日からの6か月" extra={tag} foot={`6か月の予定合計 ${yen(sum(payments.map(p => p.amount)))}。金額・請求周期・次回更新日が維持される条件付き。請求・決済は実行しません。`}><DataTable columnRoles={[undefined,"amount"]} headers={["支払予定月","予定支払額"]} rows={payments.map(p => [month(p.month),yen(p.amount)])} /></Card></> : <ProPreview onPro={onPro}>年間換算額、次回更新一覧、契約から計算した支払予定を追加表示します。</ProPreview>}</>;
}
const tabs:[FutureTab,string][]=[["all","すべて"],["utilities","光熱・通信"],["living","生活費"],["subscriptions","サブスク"]];
const contexts={all:"全支出を一度ずつ集計。サブスクの実支払額も元のExpenseに含まれます。",utilities:"光熱費（UTILITIES）の詳細分類サンプル。電気・ガス・水道・携帯電話・インターネットの記録は将来用の追加属性です。",living:"暫定定義は食費・日用品・交通費。件数はExpenseの件数で、買い物回数ではありません。",subscriptions:"カテゴリとは別の契約属性。実支払額は選択期間、契約情報と換算額は2026年10月31日を基準に表示します。"};
export function FutureTabs({tab,onTab}:{tab:FutureTab;onTab:(tab:FutureTab)=>void}) {
  const groupId = useId();
  const [reduced,setReduced] = useState(() => typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== false);
  useEffect(() => {
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference?.matches !== false);
    sync(); preference?.addEventListener("change",sync);
    return () => preference?.removeEventListener("change",sync);
  },[]);
  // Only the marker participates in layout projection; panels keep their lifecycle.
  return <LayoutGroup id={groupId}><nav className="future-tabs" role="tablist" aria-label="分析の目的" onKeyDown={e => {const i=tabs.findIndex(t => t[0] === tab),next=e.key === "ArrowRight" ? (i+1)%4 : e.key === "ArrowLeft" ? (i+3)%4 : e.key === "Home" ? 0 : e.key === "End" ? 3 : -1;if(next >= 0){e.preventDefault();onTab(tabs[next][0]);document.getElementById(`tab-${tabs[next][0]}`)?.focus();}}}>{tabs.map(([id,name]) => <button role="tab" key={id} id={`tab-${id}`} aria-selected={tab === id} aria-controls="futureContent" tabIndex={tab === id ? 0 : -1} onClick={() => onTab(id)}>{name}{tab === id ? reduced ? <span className="future-tab-indicator" aria-hidden="true" /> : <motion.span className="future-tab-indicator" aria-hidden="true" layoutId="selection" initial={false} transition={{layout:{type:"tween",duration:0.22,ease:"easeInOut"}}} /> : null}</button>)}</nav></LayoutGroup>;
}
export function AnalyticsFuturePreview({selection,scenario,tab,onTab,pro,onPro,views,onViews}:{selection:AnalyticsSelection;scenario:string;tab:FutureTab;onTab:(tab:FutureTab)=>void;pro:boolean;onPro:()=>void;views:PreviewViews;onViews:(v:PreviewViews)=>void}) {
  const a=futureAnalysis(selection,tab,scenario);
  return <><FutureTabs tab={tab} onTab={onTab} /><div className="future-context"><span className="concept-inline">FUTURE CONCEPT</span>{contexts[tab]}</div><div id="futureContent" role="tabpanel" aria-labelledby={`tab-${tab}`}>
    {tab === "all" ? <AllAnalysis data={a} current={false} compactComparison categoryAnalysis={ <AnalyticsLinkedCategories data={a} scope={linkedScope(selection,"all")} sub={`選択した${a.projects.length}Projectの月別合計`} />} view="donut" onChange={() => {}}>{pro ? <><ProHeading>支出の変化と立替負担</ProHeading><DeltaCard a={a} selection={selection} tab="all" scenario={scenario} /><MemberCard a={a} selection={selection} member={views.member} setMember={v => onViews({...views,member:v})} /></> : <ProPreview onPro={onPro}>終了月の増減内訳とProject内の立替負担を追加表示します。</ProPreview>}</AllAnalysis> : tab === "utilities" ? <UtilitiesPage a={a} selection={selection} scenario={scenario} pro={pro} onPro={onPro} views={views} onViews={onViews} /> : tab === "living" ? <LivingPage a={a} selection={selection} pro={pro} onPro={onPro} /> : <SubscriptionPage a={a} selection={selection} pro={pro} onPro={onPro} />}
    <div className="future-foot">架空のデモ支出・契約から計算しています。将来構想・未承認のサンプルであり、本番API・認証認可・課金には接続していません。</div>
  </div></>;
}
