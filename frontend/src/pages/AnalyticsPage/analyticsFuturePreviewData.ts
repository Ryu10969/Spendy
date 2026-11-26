// DEV-only v4 metadata. Expense amounts/dates/IDs remain in the frozen Current ledger.
import { demoExpenses } from "./dedicatedAnalyticsDemoExpenses";
import { aggregateDemo, demoCoverage } from "./dedicatedAnalyticsDemoData";
import type { AnalyticsSelection } from "./dedicatedAnalyticsPresentation";
import { percentage, monthIndex } from "./dedicatedAnalyticsPresentation";
import { currentAnalysis } from "./DedicatedAnalytics";

export const utilities = ["電気","ガス","水道","携帯電話料金","インターネット料金"].map((name,i) => ({id:["electricity","gas","water","mobile","internet"][i],name,color:["--c1","--c2","--c3","--c4","--c5"][i]}));
export const contracts = [
  {id:"cloud",projectId:"p1",name:"CloudNest",kind:"クラウドストレージ",amount:1000,cycle:"monthly",start:"2025-05-01",next:"2026-11-01",status:"active",payer:"a"},
  {id:"desk",projectId:"p1",name:"DeskFlow",kind:"共同作業ソフト",amount:2400,cycle:"monthly",start:"2025-05-05",next:"2026-11-05",status:"active",payer:"b"},
  {id:"note",projectId:"p1",name:"NoteGarden",kind:"ノートソフト",amount:12000,cycle:"annual",start:"2025-05-15",next:"2027-05-15",status:"active",payer:"a"},
  {id:"focus",projectId:"p1",name:"FocusBox",kind:"ソフトウェア",amount:7200,cycle:"annual",start:"2025-07-20",next:"2027-07-20",status:"active",payer:"b"},
];
export const futureExpenses = demoExpenses.map(e => {
  const contract = e.projectToken === "p1" && e.category === "DAILY_NECESSITIES" ? contracts.find(c => e.paidOn.slice(8) === c.start.slice(8)) : undefined;
  const utility = e.category === "UTILITIES" ? utilities[(Number(e.paidOn.slice(8))-4)/3]?.id : undefined;
  return {...e,utility,contractId:contract?.id,payer:contract?.payer ?? ((Number(e.id.slice(1))-1)%3 ? "a" : "b"),allocations:[{memberId:"a",amount:Math.floor(e.amount/2)},{memberId:"b",amount:e.amount-Math.floor(e.amount/2)}]};
});
export const sum = (values: number[]) => Number(values.reduce((a,b) => a+BigInt(b),0n));
export function monthAt(n: number) {return `${Math.floor(n/12).toString().padStart(4,"0")}-${(n%12+1).toString().padStart(2,"0")}`;}
export function compare(current: number, previous: number | null) {const difference=previous === null ? null : Number(BigInt(current)-BigInt(previous));return {current,previous,difference,rate:previous !== null && previous > 0 ? percentage(BigInt(difference!),BigInt(previous)) : null};}
export type FutureTab = "all" | "utilities" | "living" | "subscriptions";
export function futureAnalysis(selection: AnalyticsSelection, tab: FutureTab, scenario: string) {
  const previousMonth=monthAt(monthIndex(selection.endMonth)-1),yearMonth=monthAt(monthIndex(selection.endMonth)-12);
  const relevant=futureExpenses.filter(e => selection.projectTokens.includes(e.projectToken) && (tab === "utilities" ? !!e.utility : tab === "living" ? ["FOOD","DAILY_NECESSITIES","TRANSPORTATION"].includes(e.category ?? "") : tab === "subscriptions" ? !!e.contractId : true));
  const source=scenario === "empty" ? [] : relevant.filter(e => scenario !== "previous-zero" || !e.paidOn.startsWith(previousMonth));
  const records=source.filter(e => e.paidOn.slice(0,7) >= selection.startMonth && e.paidOn.slice(0,7) <= selection.endMonth);
  const known=(m: string) => m >= demoCoverage.startMonth && m <= demoCoverage.endMonth;
  const data=currentAnalysis(aggregateDemo(selection,source));
  if(scenario === "unavailable") data.comparison=compare(data.comparison.current,null);
  const byMonth=(m: string) => sum(source.filter(e => e.paidOn.startsWith(m)).map(e => e.amount));
  return {...data,records,yearMonth,yearComparison:compare(byMonth(selection.endMonth),scenario === "unavailable" || !known(yearMonth) ? null : byMonth(yearMonth)),utilities:utilities.map(u => ({...u,amount:sum(records.filter(e => e.utility === u.id).map(e => e.amount)),values:data.labels.map(m => sum(records.filter(e => e.utility === u.id && e.paidOn.startsWith(m)).map(e => e.amount))),current:sum(source.filter(e => e.utility === u.id && e.paidOn.startsWith(selection.endMonth)).map(e => e.amount)),priorYear:scenario === "unavailable" || !known(yearMonth) ? null : sum(source.filter(e => e.utility === u.id && e.paidOn.startsWith(yearMonth)).map(e => e.amount))}))};
}
