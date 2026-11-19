"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/api";

type StatusCheck = {
  id: string;
  label: string;
  status: "ready" | "warning" | "error";
  message: string;
  action?: string;
};
type SystemStatus = {
  status: "ready" | "degraded" | "attention";
  checkedAt: string;
  checks: StatusCheck[];
};

export function SystemStatusClient() {
  const [result, setResult] = useState<SystemStatus | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await apiRequest<SystemStatus>("/api/system/status"));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "System status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [checkStatus]);

  return (
    <section className="dashboard-content system-status-page">
      <header className="section-page-header">
        <div className="section-page-title">
          <span className="section-page-icon"><Activity size={25} aria-hidden="true" /></span>
          <div><p className="eyebrow">WORKSPACE ADMIN</p><h1>System Status</h1></div>
        </div>
        <p className="dashboard-lead">Review service readiness, local video tools and account connection expiry.</p>
        <button type="button" className="button button-gold" onClick={() => void checkStatus()} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" />{loading ? "Checking…" : "Run checks"}
        </button>
      </header>
      {error && <div className="notice notice-error" role="alert"><p>{error}</p><button type="button" onClick={() => void checkStatus()}>Retry</button></div>}
      {loading && !result && <p role="status">Checking system readiness…</p>}
      {result && <>
        <div className={`system-status-summary is-${result.status}`} role="status">
          <strong>{result.status === "ready" ? "All checked services are ready" : result.status === "degraded" ? "Some optional services need attention" : "One or more services need attention"}</strong>
          <span>Last checked {new Date(result.checkedAt).toLocaleString()}</span>
        </div>
        <div className="system-status-grid">
          {result.checks.map((check) => (
            <article className={`system-status-card is-${check.status}`} key={check.id}>
              <span className="system-status-indicator" aria-hidden="true" />
              <div><h2>{check.label}</h2><p>{check.message}</p>{check.action && <small>{check.action}</small>}</div>
              <strong>{check.status === "ready" ? "Ready" : check.status === "warning" ? "Check" : "Action needed"}</strong>
            </article>
          ))}
        </div>
      </>}
    </section>
  );
}
