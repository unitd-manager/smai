import nodemailer from "nodemailer";
import { approvalEmailConfigured, env, smtpApprovalEmailConfigured } from "../env.js";

type InviteRole = "ADMIN" | "EDITOR" | "CONTRIBUTOR" | "VIEWER";

export type InviteEmailResult =
  | { status: "sent" }
  | { status: "not_configured"; message: string }
  | { status: "failed"; message: string };

function smtpFailure(error: unknown) {
  const details = error && typeof error === "object" ? error : {};
  const code = "code" in details && typeof details.code === "string" ? details.code : "UNKNOWN";
  const responseCode = "responseCode" in details && typeof details.responseCode === "number"
    ? details.responseCode
    : undefined;
  const authRejected = code === "EAUTH" || [530, 534, 535].includes(responseCode ?? 0);
  const connectionFailed = ["ECONNECTION", "ECONNREFUSED", "EDNS", "ENOTFOUND", "EHOSTUNREACH", "ETIMEDOUT", "ESOCKET", "EPIPE"].includes(code);
  const addressRejected = code === "EENVELOPE" || [550, 553].includes(responseCode ?? 0);
  const temporarilyUnavailable = [421, 450, 451, 452].includes(responseCode ?? 0);
  const message = authRejected
    ? "SMTP authentication was rejected. Check the SMTP username and password with your email provider."
    : connectionFailed
      ? "Could not connect to the SMTP server. Check the SMTP host, port, and TLS settings."
      : addressRejected
        ? "The mail server rejected the sender or recipient. Check the configured sender address and recipient email."
        : temporarilyUnavailable
          ? "The mail server is temporarily unavailable. Try sending the invitation again later."
          : "SMTP could not send the invitation. Check the API logs for the SMTP error code.";
  return { code, responseCode, message };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export async function sendTeamInviteEmail(
  recipient: string,
  role: InviteRole,
  inviteUrl: string,
): Promise<InviteEmailResult> {
  if (!approvalEmailConfigured) {
    return {
      status: "not_configured",
      message: "Email delivery is not configured. Set up SMTP or Resend in apps/api/.env and restart the API.",
    };
  }

  const productName = env.PRODUCT_NAME;
  const roleLabel = role.toLowerCase();
  const subject = `You're invited to join a team on ${productName}`;
  const text = `You've been invited to join a workspace as a ${roleLabel} on ${productName}.\n\nAccept your invitation: ${inviteUrl}\n\nThis invitation expires in seven days.`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#102039"><h1>You're invited to join a team</h1><p>You've been invited to join a workspace as a <strong>${escapeHtml(roleLabel)}</strong> on ${escapeHtml(productName)}.</p><p style="margin:28px 0"><a href="${escapeHtml(inviteUrl)}" style="background:#4f46e5;color:white;padding:13px 20px;border-radius:9px;text-decoration:none;font-weight:700">Accept invitation</a></p><p>This invitation expires in seven days. Sign in or create an account using the invited email address to accept it.</p></div>`;

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
        subject,
        text,
        html,
      });
      return { status: "sent" };
    } catch (error) {
      const failure = smtpFailure(error);
      console.error("Team invitation email could not be delivered.", {
        transport: "SMTP",
        code: failure.code,
        responseCode: failure.responseCode,
      });
      return { status: "failed", message: failure.message };
    }
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [recipient], subject, text, html }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? "Resend rejected the API key. Check RESEND_API_KEY in apps/api/.env and restart the API."
        : response.status === 400
          ? "Resend rejected the sender or recipient. Check EMAIL_FROM and verify the sender domain with Resend."
          : response.status === 429
            ? "Resend is rate-limiting email delivery. Try again later."
            : "Resend could not send the invitation. Check the API logs for the HTTP status.";
      console.error("Team invitation email could not be delivered.", { transport: "Resend", status: response.status });
      return { status: "failed", message };
    }
    return { status: "sent" };
  } catch (error) {
    const code = error && typeof error === "object" && "name" in error ? String(error.name) : "UNKNOWN";
    console.error("Team invitation email could not be delivered.", { transport: "Resend", code });
    return { status: "failed", message: "Could not connect to Resend. Check the API server's network connection and try again." };
  }
}
