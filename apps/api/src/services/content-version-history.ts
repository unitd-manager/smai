import { Prisma } from "@prisma/client";

type VersionMetadata = {
  workspaceId: string;
  createdById: string;
  snapshot: Prisma.InputJsonValue;
  note: string;
};

export async function recordGeneratedContentVersion(
  tx: Prisma.TransactionClient,
  input: VersionMetadata & { generatedContentId: string },
) {
  const latest = await tx.contentVersion.aggregate({
    where: { workspaceId: input.workspaceId, generatedContentId: input.generatedContentId },
    _max: { version: true },
  });
  return tx.contentVersion.create({
    data: {
      ...input,
      version: (latest._max.version ?? 0) + 1,
    },
    select: { id: true, version: true, note: true, createdAt: true },
  });
}

export async function recordDesignVersion(
  tx: Prisma.TransactionClient,
  input: VersionMetadata & { designId: string },
) {
  const latest = await tx.contentVersion.aggregate({
    where: { workspaceId: input.workspaceId, designId: input.designId },
    _max: { version: true },
  });
  return tx.contentVersion.create({
    data: {
      ...input,
      version: (latest._max.version ?? 0) + 1,
    },
    select: { id: true, version: true, note: true, createdAt: true },
  });
}
