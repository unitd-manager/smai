import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth, requireCompleteBrandProfile, requireWorkspace } from "../middleware/auth.js";
import { getInstagramListeningData } from "../services/instagram.js";

const router = Router();

router.use(requireAuth, requireWorkspace, requireCompleteBrandProfile);

router.get("/", async (req, res, next) => {
  try {
    const accounts = await prisma.socialAccount.findMany({
      where: { workspaceId: req.workspace!.id, provider: "instagram", status: "CONNECTED" },
      select: {
        id: true,
        displayName: true,
        providerAccountId: true,
        encryptedTokens: true,
        tokenExpiresAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!accounts.length) {
      res.json({ accounts: [], selectedAccountId: null, posts: [], fetchedAt: new Date().toISOString() });
      return;
    }

    const selectedId = typeof req.query.accountId === "string" ? req.query.accountId : accounts[0]!.id;
    const account = accounts.find((item) => item.id === selectedId);
    if (!account) {
      res.status(404).json({ error: "That Instagram account is not connected to this workspace." });
      return;
    }
    const result = await getInstagramListeningData(account);
    res.json({
      accounts: accounts.map(({ id, displayName }) => ({ id, displayName })),
      selectedAccountId: account.id,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

export { router as listeningRouter };
