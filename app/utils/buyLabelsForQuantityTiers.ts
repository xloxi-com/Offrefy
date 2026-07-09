/** Buy labels for quantity tiers (matches storefront widget). */
export function buyLabelsForQuantityTiers(buyNums: number[]): string[] {
  const n = buyNums.length;
  if (n === 0) return [];
  return buyNums.map((b, i) => {
    if (n === 1) return b <= 1 ? "Buy 1" : `Buy ${b}+`;
    if (i === 0) return b === 1 ? "Buy 1" : `Buy ${b}`;
    if (i === n - 1) return `Buy ${b}+`;
    const next = buyNums[i + 1]!;
    if (next - b === 1) return `Buy ${b}`;
    return `Buy ${b}–${next - 1}`;
  });
}
