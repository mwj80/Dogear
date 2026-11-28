export const CURATED_REWARDS = [
  { id: "amazon-5", label: "Amazon $5", productId: "OKMHM2X2OHYV", amount: 5 },
  { id: "amazon-10", label: "Amazon $10", productId: "OKMHM2X2OHYV", amount: 10 },
  { id: "roblox-5", label: "Roblox $5", productId: "ROBLOX5PLACE", amount: 5 },
  { id: "roblox-10", label: "Roblox $10", productId: "ROBLOX5PLACE", amount: 10 },
  { id: "googleplay-5", label: "Google Play $5", productId: "GOOGLEPLAY5", amount: 5 },
  { id: "googleplay-10", label: "Google Play $10", productId: "GOOGLEPLAY5", amount: 10 },
  { id: "target-5", label: "Target $5", productId: "TARGET5PLACE", amount: 5 },
  { id: "target-10", label: "Target $10", productId: "TARGET5PLACE", amount: 10 },
  { id: "starbucks-5", label: "Starbucks $5", productId: "STARBUCKS5", amount: 5 },
  { id: "visa-5", label: "Visa $5", productId: "Q24BD9EZ332JT", amount: 5 },
  { id: "custom", label: "Custom (no gift card)", productId: "", amount: 0 }
] as const;

export function curatedById(id: string) {
  return CURATED_REWARDS.find((r) => r.id === id);
}

export const GIFT_OPTIONS = CURATED_REWARDS.filter((r) => r.productId);
