import type { SettlementResponse } from "../../../api/settlementApi";
import type { ProjectMember } from "../../../types/project";
import { formatSignedYen, formatYen } from "../../../utils/formatMoney";
import styles from "./SettlementExplanation.module.css";

type Props = {
  result: SettlementResponse;
  members: ProjectMember[];
  showBalanceColors?: boolean;
};

export function SettlementExplanation({ result, members, showBalanceColors = false }: Props) {
  const names = new Map(members.map((member) => [member.id, member.displayName]));
  const nameOf = (memberId: string) => names.get(memberId) ?? "不明なメンバー";

  return (
    <section className={styles.explanation} aria-labelledby="settlement-explanation-title">
      <h3 id="settlement-explanation-title">計算過程</h3>
      <ol className={styles.stages}>
        <li className={styles.stage}>
          <h4>各メンバーの収支を計算</h4>
          <p>支払った金額から負担額を引き、受け取る・支払う差額を求めます。</p>
          {result.balances.length ? (
            <ul className={styles.balances} tabIndex={showBalanceColors ? 0 : undefined}>
              {result.balances.map((balance) => (
                <li key={balance.memberId}>
                  <span className={styles.name}>{nameOf(balance.memberId)}</span>
                  <strong className={`${styles.money} ${balance.exactBalance > 0 ? styles.receivable : ""}`}
                    data-balance={showBalanceColors ? Math.sign(balance.exactBalance) : undefined}>
                    {formatSignedYen(balance.exactBalance)}
                  </strong>
                  <span className={styles.balanceMeaning}>
                    {balance.exactBalance > 0 ? "受け取る" : balance.exactBalance < 0 ? "支払う" : "差額なし"}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p>計算対象の支出はありません。</p>}
        </li>
        <li className={styles.stage}>
          <h4>送金の組み合わせを決定</h4>
          <p>
            {result.strategy === "UNDERSTANDABLE"
              ? "送金直前の差額を、メンバー順に組み合わせます。"
              : "送金直前の差額が大きい支払う側と受け取る側から組み合わせます。"}
          </p>
          {result.transfers.length ? (
            <ol className={styles.matches}>
              {result.transfers.map((transfer) => (
                <li key={transfer.id}>
                  <div className={styles.match} tabIndex={showBalanceColors ? 0 : undefined}>
                    <span className={styles.party}>
                      <strong>{nameOf(transfer.fromMemberId)}</strong>
                      <span data-balance={showBalanceColors ? Math.sign(transfer.explanation.fromExactBalanceBefore) : undefined}><span className={styles.srOnly}>送金直前の差額 </span>
                        {formatSignedYen(transfer.explanation.fromExactBalanceBefore)}</span>
                    </span>
                    <span className={styles.direction}>から →</span>
                    <span className={styles.party}>
                      <strong>{nameOf(transfer.toMemberId)} へ</strong>
                      <span data-balance={showBalanceColors ? Math.sign(transfer.explanation.toExactBalanceBefore) : undefined}><span className={styles.srOnly}>送金直前の差額 </span>
                        {formatSignedYen(transfer.explanation.toExactBalanceBefore)}</span>
                    </span>
                    <span className={styles.matchAmount}>送金額 <strong>{formatYen(transfer.exactAmount)}</strong></span>
                  </div>
                  {transfer.roundingAdjustment !== 0 ? (
                    <p className={styles.adjustment}>
                      丸め前 {formatYen(transfer.exactAmount)} · 初回丸め {formatYen(transfer.initiallyRoundedAmount)} ·
                      調整 {formatSignedYen(transfer.roundingAdjustment)} · 最終額 {formatYen(transfer.finalRoundedAmount)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : <p>組み合わせる差額はありません。</p>}
        </li>
        <li className={styles.stage}>
          <h4>送金内容を確定</h4>
          {result.transfers.length ? (
            <ol className={styles.plan}>
              {result.transfers.map((transfer) => (
                <li key={transfer.id}>
                  <span>{nameOf(transfer.fromMemberId)} → {nameOf(transfer.toMemberId)}</span>
                  <strong>{formatYen(transfer.finalRoundedAmount)}</strong>
                </li>
              ))}
            </ol>
          ) : <p>送金は必要ありません。</p>}
        </li>
      </ol>
    </section>
  );
}
