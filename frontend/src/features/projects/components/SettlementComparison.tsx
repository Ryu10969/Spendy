import {
  SETTLEMENT_STRATEGIES,
  SETTLEMENT_STRATEGY_LABELS,
  type SettlementStrategy,
} from "../../../api/settlementApi";
import type { ProjectMember } from "../../../types/project";
import { formatYen } from "../../../utils/formatMoney";
import type { SettlementComparison as Comparison } from "../../settlements/settlementQueries";
import { areSettlementPlansEquivalent } from "./settlementPlanEquivalent";
import styles from "./SettlementComparison.module.css";

type Props = {
  comparison: Comparison;
  selectedStrategy: SettlementStrategy;
  members: ProjectMember[];
};

export function SettlementComparison({ comparison, selectedStrategy, members }: Props) {
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  const nameOf = (memberId: string) => names.get(memberId) ?? "不明なメンバー";
  const identical = areSettlementPlansEquivalent(
    comparison.FEWER_TRANSFERS,
    comparison.UNDERSTANDABLE,
  );
  const displayedStrategies = identical ? [selectedStrategy] : SETTLEMENT_STRATEGIES;

  return (
    <div className={styles.grid} role="group" aria-label="精算方式ごとの結果">
      {identical ? <p className={styles.sameResult}>この支出状態では、2つの方式の送金結果は同じです。</p> : null}
      {displayedStrategies.map((strategy) => {
        const result = comparison[strategy];
        return (
          <section key={strategy} className={styles.column}
            aria-label={identical ? "共通の送金内容" : SETTLEMENT_STRATEGY_LABELS[strategy]}>
            <div className={styles.heading}>
              <h3>{identical ? "共通の送金内容" : SETTLEMENT_STRATEGY_LABELS[strategy]}</h3>
              {!identical && strategy === selectedStrategy ? <span className={styles.selected}>選択中</span> : null}
            </div>
            <p className={styles.count}>送金する内容 {result.transfers.length}件</p>
            {result.transfers.length ? (
              <ol className={styles.list}>
                {result.transfers.map((transfer) => (
                  <li key={transfer.id}>
                    <span className={styles.parties}>
                      {transfer.transferOrder}. {nameOf(transfer.fromMemberId)} から {nameOf(transfer.toMemberId)} へ
                    </span>
                    <strong>{formatYen(transfer.finalRoundedAmount)}</strong>
                    <span className={styles.status}>
                      {transfer.status === "COMPLETED" ? "完了" : "未精算"}
                    </span>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.empty}>精算が必要な取引はありません。</p>}
          </section>
        );
      })}
    </div>
  );
}
