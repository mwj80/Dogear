export const CURATED_REWARDS = [
  { id: "amazon-5", label: "Amazon $5", productId: "OKMHM2X2OHYV", amount: 5 },
  { id: "amazon-10", label: "Amazon $10", productId: "OKMHM2X2OHYV", amount: 10 },
  { id: "visa-5", label: "Visa $5", productId: "Q24BD9EZ332JT", amount: 5 },
  { id: "visa-10", label: "Visa $10", productId: "Q24BD9EZ332JT", amount: 10 },
  { id: "custom", label: "Custom (no gift card)", productId: "", amount: 0 }
] as const;

export function curatedById(id: string) {
  return CURATED_REWARDS.find((r) => r.id === id);
}
