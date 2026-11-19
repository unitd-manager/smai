import { plans, type PlanKey } from "@united-technologies/shared/plans";

function isPlanKey(value: string): value is PlanKey {
  return Object.hasOwn(plans, value);
}

export function getAiGenerationLimit(
  plan: string | null | undefined,
  subscriptionStatus: string | null,
  trialEndsAt: Date,
  now = new Date(),
): number | null {
  if (subscriptionStatus === "trialing" && trialEndsAt > now) return null;
  const planKey = plan && isPlanKey(plan) ? plan : "trial";
  return plans[planKey].aiGenerationsPerMonth;
}
