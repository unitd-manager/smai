export type PlanKey = "trial" | "starter" | "pro" | "agency" | "enterprise";

export type Plan = {
  name: string;
  brands: number;
  connectedAccounts: number;
  scheduledPostsPerMonth: number;
  aiGenerationsPerMonth: number;
  storageGb: number;
  teamSeats: number;
};

export const plans: Record<PlanKey, Plan> = {
  trial: {
    name: "Trial",
    brands: 3,
    connectedAccounts: 10,
    scheduledPostsPerMonth: 100,
    aiGenerationsPerMonth: 100,
    storageGb: 5,
    teamSeats: 5,
  },
  starter: {
    name: "Starter",
    brands: 1,
    connectedAccounts: 5,
    scheduledPostsPerMonth: 100,
    aiGenerationsPerMonth: 100,
    storageGb: 10,
    teamSeats: 3,
  },
  pro: {
    name: "Pro",
    brands: 5,
    connectedAccounts: 20,
    scheduledPostsPerMonth: 500,
    aiGenerationsPerMonth: 500,
    storageGb: 100,
    teamSeats: 10,
  },
  agency: {
    name: "Agency",
    brands: 25,
    connectedAccounts: 100,
    scheduledPostsPerMonth: 2500,
    aiGenerationsPerMonth: 2500,
    storageGb: 500,
    teamSeats: 50,
  },
  enterprise: {
    name: "Enterprise",
    brands: 100,
    connectedAccounts: 500,
    scheduledPostsPerMonth: 10000,
    aiGenerationsPerMonth: 10000,
    storageGb: 2000,
    teamSeats: 250,
  },
};
