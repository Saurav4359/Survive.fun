import type { RugCondition } from "@survivefun/types";

const LABELS: Record<RugCondition, string> = {
  dev_sold_over_25_percent: "Dev sold over 25% of supply",
  price_dropped_over_90_percent: "Price dropped over 90%",
  liquidity_removed_over_80_percent: "Liquidity removed over 80%",
  bonding_stalled_before_graduation: "Bonding stalled before graduation",
};

/** Human-readable rug reason for banners and feeds. */
export function formatRugConditionLabel(raw: string | null | undefined): string {
  if (raw == null || raw === "") {
    return "Rug conditions were met";
  }
  if (raw in LABELS) {
    return LABELS[raw as RugCondition];
  }
  return raw.replace(/_/g, " ");
}
