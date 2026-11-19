import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { brand } from "@united-technologies/shared/brand";
import { plans } from "@united-technologies/shared/plans";
import { starterTemplates } from "../src/services/template-library.js";

const prisma = new PrismaClient();
const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const productName = process.env.PRODUCT_NAME ?? brand.productName;

if (!email || !password || Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 72) {
  throw new Error("Set SEED_ADMIN_EMAIL and a SEED_ADMIN_PASSWORD of 12 to 72 bytes in apps/api/.env.");
}

try {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [key, plan] of Object.entries(plans)) {
    await prisma.plan.upsert({
      where: { key },
      update: {
        name: plan.name,
        limits: plan,
        active: true,
      },
      create: {
        key,
        name: plan.name,
        limits: plan,
      },
    });
  }
  for (const template of starterTemplates) {
    await prisma.template.upsert({
      where: { id: template.id },
      update: {
        name: template.name,
        format: template.format,
        language: template.language,
        templateJson: template.templateJson,
        active: true,
      },
      create: {
        id: template.id,
        name: template.name,
        format: template.format,
        language: template.language,
        templateJson: template.templateJson,
        workspaceId: null,
        resellerId: null,
        active: true,
      },
    });
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: `${productName} Administrator`, passwordHash },
    create: { name: `${productName} Administrator`, email, passwordHash },
  });
  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      name: "United Studio",
      resellerId: null,
      memberships: { some: { userId: user.id, role: "OWNER" } },
    },
  });
  const workspace = existingWorkspace ?? await prisma.workspace.create({
    data: {
      name: "United Studio",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      subscription: { create: { plan: "trial", status: "trialing" } },
      memberships: { create: { userId: user.id, role: "OWNER" } },
    },
  });
  const existingBrand = await prisma.brand.findFirst({
    where: { workspaceId: workspace.id, name: "United Studio" },
  });
  const brand = existingBrand ?? await prisma.brand.create({
    data: {
      workspaceId: workspace.id,
      resellerId: workspace.resellerId,
      name: "United Studio",
    },
  });
  await prisma.membership.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: { role: "OWNER" },
    create: { userId: user.id, workspaceId: workspace.id, role: "OWNER" },
  });
  console.info(`Seeded workspace ${workspace.id} and administrator ${email}.`);
} finally {
  await prisma.$disconnect();
}
