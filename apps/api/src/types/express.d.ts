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
        role: MembershipRole;
        trialEndsAt: Date;
        subscriptionStatus: string | null;
      };
    }
  }
}

export {};
