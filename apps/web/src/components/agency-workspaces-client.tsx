"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "@/lib/api";

type ClientWorkspace = {
  id: string;
  name: string;
  brandId: string | null;
  memberCount: number;
  createdAt: string;
};

type AgencyResponse = {
  agency: { name: string; workspaceId: string };
  clients: ClientWorkspace[];
};

export function AgencyWorkspacesClient() {
  const [clients, setClients] = useState<ClientWorkspace[]>([]);
  const [agencyName, setAgencyName] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadClients() {
    try {
      const response = await apiRequest<AgencyResponse>("/api/agency/clients");
      setClients(response.clients);
      setAgencyName(response.agency.name);
      setError("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load client workspaces.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadClients(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function openWorkspace(client: ClientWorkspace, destination: "/onboarding" | "/dashboard" | "/dashboard/team") {
    window.localStorage.setItem("united-technologies.workspaceId", client.id);
    if (client.brandId) window.localStorage.setItem("united-technologies.brandId", client.brandId);
    else window.localStorage.removeItem("united-technologies.brandId");
    window.location.assign(destination);
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiRequest<{ client: ClientWorkspace }>("/api/agency/clients", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setClients((current) => [...current, response.client]);
      setName("");
      setNotice(`${response.client.name} workspace created. Set up its brand before use.`);
      openWorkspace(response.client, "/onboarding");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create client workspace.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dashboard-content agency-workspaces-page">
      <p className="eyebrow">AGENCY · CLIENTS</p>
      <h1>Client workspaces</h1>
      <p className="dashboard-lead">
        Manage each client in its own workspace. Brands, social connections, content, and team access stay isolated, while you switch between clients with your agency login.
      </p>
      <div className="agency-rollout-note" role="note"><strong>Agency subscription</strong><span>Client workspace management is available. Subscription tiers, client seat limits, and reseller billing are still being finalized.</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}

      <form className="agency-client-create" onSubmit={(event) => void createWorkspace(event)}>
        <label htmlFor="agency-client-name">New client name</label>
        <div>
          <input
            id="agency-client-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={120}
            required
            placeholder="Client or brand name"
          />
          <button className="button button-gold" type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create client workspace"}
          </button>
        </div>
        <small>Each workspace starts with its own brand setup. Invite your client or team from that workspace’s Team page.</small>
      </form>

      <div className="agency-client-list" aria-live="polite">
        <div className="agency-client-list-heading">
          <h2>{agencyName ? `${agencyName} clients` : "Your clients"}</h2>
          {!loading && <span>{clients.length} {clients.length === 1 ? "workspace" : "workspaces"}</span>}
        </div>
        {loading ? (
          <p className="loading-label">Loading client workspaces…</p>
        ) : clients.length ? (
          clients.map((client) => (
            <article className="agency-client-row" key={client.id}>
              <div>
                <h3>{client.name}</h3>
                <p>{client.brandId ? "Brand setup started" : "Brand setup needed"} · {client.memberCount} {client.memberCount === 1 ? "member" : "members"}</p>
              </div>
              <div className="agency-client-actions">
                <button className="social-provider-action" type="button" onClick={() => openWorkspace(client, client.brandId ? "/dashboard" : "/onboarding")}>{client.brandId ? "View client workspace" : "Set up client workspace"}</button>
                {client.brandId && <button className="social-provider-action" type="button" onClick={() => openWorkspace(client, "/dashboard/team")}>Manage client team</button>}
              </div>
            </article>
          ))
        ) : (
          <p className="agency-client-empty">No client workspaces yet. Create one to begin.</p>
        )}
      </div>
    </section>
  );
}
