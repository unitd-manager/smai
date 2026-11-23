import type { MembershipRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
      };
      workspace?: {
        id: string;
        resellerId: string | null;
        billingWorkspaceId: string | null;
        status: "ACTIVE" | "SUSPENDED";
        role: MembershipRole;
        trialEndsAt: Date;
        subscriptionStatus: string | null;
        subscriptionPlan: string | null;
      };
    }
  }
}

export {};
