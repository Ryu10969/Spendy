export function formatYen(amount: number): string {
  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error("JPY amount must be a finite integer.");
  }

  const absoluteAmount = Math.abs(amount).toLocaleString("ja-JP");
  const sign = amount < 0 ? "-" : "";

  return `${sign}¥${absoluteAmount}`;
}

export function formatSignedYen(amount: number): string {
  if (amount === 0) {
    return formatYen(0);
  }

  return amount > 0 ? `+${formatYen(amount)}` : formatYen(amount);
}
