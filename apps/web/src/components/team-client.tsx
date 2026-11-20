"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { CompactSelect } from "@/components/compact-select";

type Role = "OWNER" | "ADMIN" | "EDITOR" | "CONTRIBUTOR" | "VIEWER";
type Member = {
  id: string;
  role: Role;
  createdAt: string;
  user: { id: string; name: string; email: string };
};
type Invite = { id: string; email: string; role: Exclude<Role, "OWNER">; expiresAt: string; createdAt: string };
type TeamData = { members: Member[]; invites: Invite[]; currentRole: Role };
const roles: Array<Exclude<Role, "OWNER">> = ["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"];
const descriptions: Record<Role, string> = {
  OWNER: "Full access, including workspace and administrator management.",
  ADMIN: "Manage workspace settings, team access, content, and approvals.",
  EDITOR: "Create and edit content, manage publishing, and review approvals.",
  CONTRIBUTOR: "Create and edit drafts; cannot manage members or approve posts.",
  VIEWER: "Read-only access to workspace content.",
};

export function TeamClient() {
  const router = useRouter();
  const [data, setData] = useState<TeamData | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<Role, "OWNER">>("CONTRIBUTOR");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteToken, setInviteToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const team = await apiRequest<TeamData>("/api/team");
      setData(team);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load workspace members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInviteToken(new URLSearchParams(window.location.search).get("token") ??
        window.sessionStorage.getItem("united-technologies.pendingInvite") ?? "");
      void loadTeam();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadTeam]);

  const canManageTeam = data?.currentRole === "OWNER" || data?.currentRole === "ADMIN";

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("invite");
    setError("");
    setNotice("");
    setInviteUrl("");
    try {
      const result = await apiRequest<{
        invite: Invite;
        inviteUrl: string;
        emailStatus: "sent" | "not_configured" | "failed";
        emailMessage?: string;
      }>("/api/team/invites", {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setInviteUrl(result.inviteUrl);
      setEmail("");
      await loadTeam();
      if (result.emailStatus === "sent") {
        setNotice(`Invitation email sent to ${result.invite.email}. The link expires in 7 days.`);
      } else {
        setError(`The invitation was created, but the email could not be sent to ${result.invite.email}. ${result.emailMessage ?? ""} You can share the backup link below in the meantime.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the invitation.");
    } finally {
      setBusy("");
    }
  }

  async function acceptInvite() {
    setBusy("accept");
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{ workspace: { id: string; name: string }; role: Role }>("/api/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token: inviteToken }),
      });
      window.localStorage.setItem("united-technologies.workspaceId", result.workspace.id);
      window.sessionStorage.removeItem("united-technologies.pendingInvite");
      setInviteToken("");
      setNotice(`You joined ${result.workspace.name} as ${result.role.toLowerCase()}.`);
      window.history.replaceState({}, "", "/dashboard/team");
      await loadTeam();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not accept this invitation.");
    } finally {
      setBusy("");
    }
  }

  async function updateRole(member: Member, nextRole: Exclude<Role, "OWNER">) {
    setBusy(member.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/team/members/${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ role: nextRole }),
      });
      setNotice(`${member.user.name}'s role was updated.`);
      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not update this member.");
    } finally {
      setBusy("");
    }
  }

  async function transferOwnership(member: Member) {
    if (!window.confirm(`Transfer ownership of this workspace to ${member.user.name}? You will become an administrator.`)) return;
    setBusy(member.id);
    setError("");
    setNotice("");
    try {
      await apiRequest(`/api/team/members/${encodeURIComponent(member.id)}/owner`, { method: "PATCH" });
      setNotice(`${member.user.name} is now the workspace owner. You are now an administrator.`);
      await loadTeam();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not transfer workspace ownership.");
    } finally {
      setBusy("");
    }
  }

  async function removeMember(member: Member) {
    if (!window.confirm(`Remove ${member.user.name} from this workspace?`)) return;
    setBusy(member.id);
    setError("");
    setNotice("");
    try {
      await apiRequest<void>(`/api/team/members/${encodeURIComponent(member.id)}`, { method: "DELETE" });
      setNotice(`${member.user.name} was removed from the workspace.`);
      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not remove this member.");
    } finally {
      setBusy("");
    }
  }

  async function cancelInvite(invite: Invite) {
    setBusy(invite.id);
    setError("");
    setNotice("");
    try {
      await apiRequest<void>(`/api/team/invites/${encodeURIComponent(invite.id)}`, { method: "DELETE" });
      setNotice(`Invitation for ${invite.email} was cancelled.`);
      await loadTeam();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not cancel this invitation.");
    } finally {
      setBusy("");
    }
  }

  async function resendInvite(invite: Invite) {
    setBusy(`resend:${invite.id}`);
    setError("");
    setNotice("");
    try {
      const result = await apiRequest<{
        inviteUrl: string;
        emailStatus: "sent" | "not_configured" | "failed";
        emailMessage?: string;
      }>(`/api/team/invites/${encodeURIComponent(invite.id)}/resend`, { method: "POST" });
      setInviteUrl(result.inviteUrl);
      await loadTeam();
      if (result.emailStatus === "sent") {
        setNotice(`Invitation email resent to ${invite.email}. The updated link expires in 7 days.`);
      } else {
        setError(`The invitation link was renewed, but the email could not be sent to ${invite.email}. ${result.emailMessage ?? ""} You can share the updated backup link above.`);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not resend this invitation.");
    } finally {
      setBusy("");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice("Invitation link copied.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not copy the invitation link.");
    }
  }

  return (
    <section className="dashboard-content team-page">
      <p className="eyebrow">YOUR WORKSPACE · SETTINGS</p>
      <h1>Team collaboration</h1>
      <p className="dashboard-lead">Invite people to work in the same workspace, give each person the access they need, and keep reviews tied to clear roles.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
      {inviteToken && (
        <article className="section-empty-state team-invite-accept">
          <h2>You have a workspace invitation</h2>
          <p>Accept it while signed in to the email address that received the invite.</p>
          <button type="button" className="button button-primary" disabled={busy === "accept"} onClick={() => void acceptInvite()}>
            {busy === "accept" ? "Joining…" : "Accept invitation"}
          </button>
        </article>
      )}
      {loading ? <p className="loading-label" role="status">Loading workspace team…</p> : data && (
        <>
          <div className="team-summary">
            <article><span>Members</span><strong>{data.members.length}</strong></article>
            <article><span>Pending invites</span><strong>{data.invites.length}</strong></article>
          </div>
          {canManageTeam && (
            <article className="section-card team-invite-card">
              <h2>Invite a teammate</h2>
              <p>An invitation email is sent automatically to the selected email address. You can also copy the private invitation link as a backup. It expires in seven days.</p>
              <form className="team-invite-form" onSubmit={(event) => void createInvite(event)}>
                <label>Email address<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@example.com" /></label>
                <label>Workspace role<CompactSelect aria-label="Workspace role" value={role} onChange={(event) => setRole(event.target.value as Exclude<Role, "OWNER">)}>
                  {roles.filter((item) => data.currentRole === "OWNER" || item !== "ADMIN").map((item) => <option key={item} value={item}>{item.toLowerCase()}</option>)}
                </CompactSelect></label>
                <button type="submit" className="button button-primary" disabled={busy === "invite"}>{busy === "invite" ? "Sending…" : "Send invitation"}</button>
              </form>
              {inviteUrl && <div className="team-invite-link"><label>Backup invitation link<input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} /></label><button className="button button-outline" type="button" onClick={() => void copyInvite()}>Copy link</button><p className="team-invite-activation-note">They must sign in or create an account using the exact invited email, then accept the invitation. For testing, use an email you can access that is not already a member of this workspace.</p></div>}
            </article>
          )}
          <article className="section-card team-members-card">
            <div className="team-section-heading"><div><h2>Workspace members</h2><p>Transfer ownership to another member before deleting the current owner’s account.</p></div><span>{data.members.length} people</span></div>
            <div className="team-member-list">
              {data.members.map((member) => {
                const canManageMember = canManageTeam && member.role !== "OWNER" &&
                  (data.currentRole === "OWNER" || member.role !== "ADMIN");
                return <article className="team-member-row" key={member.id}>
                  <div className="team-member-avatar" aria-hidden="true">{member.user.name.trim().slice(0, 1).toUpperCase()}</div>
                  <div className="team-member-identity"><strong>{member.user.name}</strong><span>{member.user.email}</span><small>{descriptions[member.role]}</small></div>
                  {canManageMember ? <label className="team-role-control">Role<CompactSelect aria-label={`Role for ${member.user.name}`} value={member.role} disabled={busy === member.id} onChange={(event) => void updateRole(member, event.target.value as Exclude<Role, "OWNER">)}>
                    {roles.filter((item) => data.currentRole === "OWNER" || item !== "ADMIN").map((item) => <option key={item} value={item}>{item.toLowerCase()}</option>)}
                  </CompactSelect></label> : <span className="team-role-badge">{member.role.toLowerCase()}</span>}
                  {data.currentRole === "OWNER" && member.role !== "OWNER" && <button className="button button-outline" type="button" disabled={busy === member.id} onClick={() => void transferOwnership(member)}>Transfer ownership</button>}
                  {canManageMember && <button className="button button-outline" type="button" disabled={busy === member.id} onClick={() => void removeMember(member)}>Remove</button>}
                </article>;
              })}
            </div>
          </article>
          {canManageTeam && <article className="section-card team-invites-card">
            <h2>Pending invitations</h2>
            {data.invites.length === 0 ? <p>No pending invitations.</p> : <div className="team-member-list">
              {data.invites.map((invite) => <article className="team-member-row" key={invite.id}>
                <div className="team-member-identity"><strong>{invite.email}</strong><span>{invite.role.toLowerCase()} · expires {new Date(invite.expiresAt).toLocaleDateString()}</span></div>
                <div className="team-invite-actions">
                  <button className="button button-outline" type="button" disabled={busy === invite.id || busy === `resend:${invite.id}`} onClick={() => void resendInvite(invite)}>{busy === `resend:${invite.id}` ? "Sending…" : "Resend email"}</button>
                  <button className="button button-outline" type="button" disabled={busy === invite.id || busy === `resend:${invite.id}`} onClick={() => void cancelInvite(invite)}>Cancel invite</button>
                </div>
              </article>)}
            </div>}
          </article>}
          <article className="section-card team-permissions-card">
            <h2>Role permissions</h2>
            <div className="team-permission-list">{roles.map((item) => <p key={item}><strong>{item.toLowerCase()}</strong><span>{descriptions[item]}</span></p>)}</div>
            <p className="team-permission-note">Only editors, admins, and owners can approve or request changes on submitted posts. Approving never publishes automatically.</p>
          </article>
        </>
      )}
    </section>
  );
}
