export function redemptionResult(claim, now = Date.now()) {
  if (!claim) return { status: 404, body: { verified: false, error: 'No eligible result matches this reference.' } };
  if (claim.redeemedAt) return { status: 409, body: { verified: true, claim, error: 'This claim was already redeemed.' } };
  return { status: 200, body: { verified: true, claim: { ...claim, redeemedAt: now } } };
}
