import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { approvalEmailProvider, env, smtpApprovalEmailConfigured } from "../env.js";
import { prisma } from "../db.js";

const approvalBatchIssuer = "united-technologies-approval-batch";
const approvalLookaheadMs = 7 * 24 * 60 * 60 * 1000;
const reminderIntervalMs = 12 * 60 * 60 * 1000;
const maxApprovalsPerEmail = 50;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function approvalBatchToken(workspaceId: string, approvalIds: string[]) {
  return jwt.sign(
    { workspaceId, approvalIds, purpose: "approval-batch" },
    env.JWT_ACCESS_SECRET,
    { issuer: approvalBatchIssuer, expiresIn: "14d" },
  );
}

function localScheduleDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function scheduleLabel(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

function scheduleDayLabel(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}

function formatEmail(
  approvals: Array<{
    id: string;
    post: {
      title: string | null;
      caption: string;
      scheduledAt: Date | null;
      timezone: string;
      brand: { name: string };
      targets: Array<{ platform: string }>;
    };
  }>,
  reviewUrl: string,
  reminder: boolean,
) {
  const first = approvals[0]!;
  const last = approvals[approvals.length - 1]!;
  const brandName = first.post.brand.name;
  const firstDate = localScheduleDate(first.post.scheduledAt!, first.post.timezone);
  const lastDate = localScheduleDate(last.post.scheduledAt!, last.post.timezone);
  const scheduleRange = firstDate === lastDate ? firstDate : `${firstDate} to ${lastDate}`;
  const subject = `${reminder ? "Reminder: " : ""}Review ${approvals.length} scheduled post${approvals.length === 1 ? "" : "s"} (${scheduleRange})`;
  const days = new Map<string, typeof approvals>();
  for (const approval of approvals) {
    const key = localScheduleDate(approval.post.scheduledAt!, approval.post.timezone);
    days.set(key, [...(days.get(key) ?? []), approval]);
  }
  const items = [...days.entries()].map(([, posts], dayIndex) => {
    const dayLabel = scheduleDayLabel(posts[0]!.post.scheduledAt!, posts[0]!.post.timezone);
    const articles = posts.map(({ post }) => {
      const title = post.title ?? "Scheduled social post";
      const platforms = post.targets.map(({ platform }) => platform).join(", ");
      const caption = post.caption.length > 2400 ? `${post.caption.slice(0, 2400)}…` : post.caption;
      const time = scheduleLabel(post.scheduledAt!, post.timezone);
      return `<article style="border:1px solid #dbe3ee;border-radius:12px;padding:18px;margin:12px 0"><p style="color:#6354d9;font-weight:700">${escapeHtml(post.brand.name)}</p><h3 style="font-size:18px;margin:0 0 8px">${escapeHtml(title)}</h3><p style="margin:6px 0"><strong>${escapeHtml(time)}</strong> (${escapeHtml(post.timezone)})</p><p style="margin:6px 0"><strong>Channels:</strong> ${escapeHtml(platforms)}</p><p style="white-space:pre-wrap;line-height:1.55">${escapeHtml(caption)}</p></article>`;
    }).join("");
    return `<section style="margin:24px 0"><h2 style="font-size:20px;border-bottom:1px solid #dbe3ee;padding-bottom:8px">Day ${dayIndex + 1} · ${escapeHtml(dayLabel)} <span style="font-size:14px;font-weight:400">(${posts.length} post${posts.length === 1 ? "" : "s"})</span></h2>${articles}</section>`;
  }).join("");
  const introduction = reminder
    ? "These day-by-day posts are still waiting for your review. They will remain on hold until you approve them."
    : "Review each day's scheduled posts and captions in one place. Open the secure preview to review the creative and approve or request changes for the batch.";
  return {
    subject,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#102039"><p style="color:#6354d9;font-weight:700">${escapeHtml(brandName)} · PUBLISHING APPROVAL</p><h1 style="font-size:24px">${reminder ? "Your posts are awaiting review" : "Review your upcoming posts"}</h1><p>${introduction}</p>${items}<p style="margin:28px 0"><a href="${reviewUrl}" style="background:#4f46e5;color:white;padding:13px 20px;border-radius:9px;text-decoration:none;font-weight:700">Preview and review batch</a></p><p>Nothing in this batch will publish unless you approve it. Unanswered posts stay on hold; reminders are sent automatically.</p></div>`,
  };
}

async function sendApprovalBatch(
  approvals: Parameters<typeof formatEmail>[0],
  workspaceId: string,
  reminder: boolean,
) {
  const [workspace, owner] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: workspaceId }, select: { approvalEmailRecipient: true } }),
    prisma.membership.findFirst({
      where: { workspaceId, role: "OWNER" },
      orderBy: { createdAt: "asc" },
      select: { user: { select: { email: true } } },
    }),
  ]);
  const recipient = workspace?.approvalEmailRecipient ?? owner?.user.email;
  if (!recipient) return false;

  const token = approvalBatchToken(workspaceId, approvals.map(({ id }) => id));
  const reviewUrl = new URL("/approval-review", env.WEB_ORIGIN);
  reviewUrl.searchParams.set("batchToken", token);
  const email = formatEmail(approvals, reviewUrl.toString(), reminder);
  if (smtpApprovalEmailConfigured) {
    try {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE === "true",
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 15_000,
      });
      await transporter.sendMail({
        from: env.SMTP_FROM ?? env.SMTP_USER,
        to: recipient,
        subject: email.subject,
        html: email.html,
      });
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
      console.error("Approval batch email could not be delivered.", { transport: "SMTP", code });
      return false;
    }
    const now = new Date();
    await prisma.approval.updateMany({
      where: { id: { in: approvals.map(({ id }) => id) }, workspaceId, status: "PENDING" },
      data: { emailSentAt: now },
    });
    return true;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [recipient], subject: email.subject, html: email.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    console.error("Approval batch email could not be delivered.", { status: response.status, details: details.slice(0, 400) });
    return false;
  }
  const now = new Date();
  await prisma.approval.updateMany({
    where: {
      id: { in: approvals.map(({ id }) => id) },
      workspaceId,
      status: "PENDING",
    },
    data: { emailSentAt: now },
  });
  return true;
}

type ApprovalEmailRow = {
  id: string;
  workspaceId: string;
  post: {
    title: string | null;
    caption: string;
    scheduledAt: Date | null;
    timezone: string;
    brand: { name: string };
    targets: Array<{ platform: string }>;
  };
};

function groupByWorkspaceAndTimezone(approvals: ApprovalEmailRow[]) {
  const groups = new Map<string, ApprovalEmailRow[]>();
  for (const approval of approvals) {
    if (!approval.post.scheduledAt) continue;
    const key = `${approval.workspaceId}:${approval.post.timezone}`;
    const group = groups.get(key) ?? [];
    group.push(approval);
    group.sort((left, right) => left.post.scheduledAt!.getTime() - right.post.scheduledAt!.getTime());
    groups.set(key, group);
  }
  return groups;
}

export async function sendDueApprovalEmails() {
  if (!approvalEmailProvider) return { sent: 0, configured: false };
  const now = new Date();
  const [newApprovals, reminderApprovals] = await Promise.all([
    prisma.approval.findMany({
      where: {
        status: "PENDING",
        emailSentAt: null,
        post: { scheduledAt: { gt: now, lte: new Date(now.getTime() + approvalLookaheadMs) } },
      },
      orderBy: { post: { scheduledAt: "asc" } },
      take: 500,
      include: {
        post: {
          select: {
            title: true,
            caption: true,
            scheduledAt: true,
            timezone: true,
            brand: { select: { name: true } },
            targets: { select: { platform: true } },
          },
        },
      },
    }),
    prisma.approval.findMany({
      where: {
        status: "PENDING",
        emailSentAt: { lte: new Date(now.getTime() - reminderIntervalMs) },
        post: { scheduledAt: { gt: now } },
      },
      orderBy: { post: { scheduledAt: "asc" } },
      take: 500,
      include: {
        post: {
          select: {
            title: true,
            caption: true,
            scheduledAt: true,
            timezone: true,
            brand: { select: { name: true } },
            targets: { select: { platform: true } },
          },
        },
      },
    }),
  ]);
  const byId = new Map<string, { approval: ApprovalEmailRow; reminder: boolean }>();
  for (const approval of newApprovals) byId.set(approval.id, { approval, reminder: false });
  for (const approval of reminderApprovals) byId.set(approval.id, { approval, reminder: true });

  let sent = 0;
  const groups = groupByWorkspaceAndTimezone([...byId.values()].map(({ approval }) => approval));
  for (const group of groups.values()) {
    const batches = new Map<boolean, ApprovalEmailRow[]>();
    for (const approval of group) {
      const reminder = byId.get(approval.id)?.reminder ?? false;
      const batch = batches.get(reminder) ?? [];
      batch.push(approval);
      batches.set(reminder, batch);
    }
    for (const [reminder, batch] of batches) {
      for (let start = 0; start < batch.length; start += maxApprovalsPerEmail) {
        const chunk = batch.slice(start, start + maxApprovalsPerEmail);
        const first = chunk[0]!;
        if (await sendApprovalBatch(chunk, first.workspaceId, reminder)) sent += 1;
      }
    }
  }
  return { sent, configured: true };
}
