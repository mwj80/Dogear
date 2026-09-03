export function costCents(input: {
  rewardType: "robux" | "gift_card" | "pizza" | "custom";
  faceValue: string;
  robuxPer100: number;
  giftMultiplier: number;
  pizzaFixed: number;
  customDefault: number;
}) {
  const n = Number(String(input.faceValue).replace(/[^0-9.]/g, ""));
  if (input.rewardType === "robux") {
    const robux = n || 0;
    return Math.round((robux / 100) * input.robuxPer100 * 100);
  }
  if (input.rewardType === "gift_card") {
    return Math.round((n || 0) * input.giftMultiplier * 100);
  }
  if (input.rewardType === "pizza") {
    return Math.round(input.pizzaFixed * 100);
  }
  return Math.round(input.customDefault * 100);
}
