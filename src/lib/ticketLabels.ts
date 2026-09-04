// Deliberately text-only (not computed dollar amounts) — the authoritative
// total always comes from the server response, so this can't ever be shown
// alongside a breakdown that doesn't sum to it.
export function breakdownLabel(
  memberUnits: number,
  nonMemberUnits: number
): string {
  const parts: string[] = [];
  if (memberUnits > 0) {
    parts.push(`${memberUnits} ticket${memberUnits === 1 ? "" : "s"} at member price`);
  }
  if (nonMemberUnits > 0) {
    parts.push(`${nonMemberUnits} ticket${nonMemberUnits === 1 ? "" : "s"} at non-member price`);
  }
  return parts.join(" + ");
}
