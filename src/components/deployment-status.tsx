"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "./status-badge";

type Status = "REQUESTED" | "PROVISIONING" | "QUEUED" | "IN_PROGRESS" | "HEALTHY" | "FAILED" | "CANCELLED" | "UNKNOWN";
const activeStates = new Set<Status>(["REQUESTED", "PROVISIONING", "QUEUED", "IN_PROGRESS"]);
const progressSteps: Array<{ status: Status; label: string }> = [
  { status: "REQUESTED", label: "Requested" },
  { status: "PROVISIONING", label: "Provisioning" },
  { status: "QUEUED", label: "Queued" },
  { status: "IN_PROGRESS", label: "In progress" },
];

type DeploymentState = { status: Status; url: string | null; failureSummary: string | null; lastUpdatedAt: string };

export function DeploymentStatus({ id, initial }: { id: string; initial: DeploymentState }) {
  const [state, setState] = useState(initial);
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkingVisible, setCheckingVisible] = useState(false);
  const [retryUntil, setRetryUntil] = useState(0);
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [offline, setOffline] = useState(false);
  const retryRef = useRef(0);

  const refresh = useCallback(async () => {
    const now = Date.now();
    if (now < retryRef.current) {
      setRetrySeconds(Math.ceil((retryRef.current - now) / 1000));
      return;
    }
    setChecking(true);
    setCheckingVisible(false);
    const delayedIndicator = window.setTimeout(() => setCheckingVisible(true), 500);
    try {
      const response = await fetch(`/api/deployments/${id}/status`, { cache: "no-store" });
      if (response.ok) {
        const next = await response.json() as DeploymentState;
        setState((previous) => {
          if (previous.status !== next.status) setMessage(`Status changed to ${next.status.toLowerCase().replaceAll("_", " ")}.`);
          return next;
        });
        setOffline(false);
        retryRef.current = 0;
        setRetryUntil(0);
        setRetrySeconds(0);
      } else if (response.status === 401) {
        setMessage("Your session expired. Sign in again to continue.");
      } else if (response.status === 429 || response.status === 503) {
        const seconds = Math.max(1, Number(response.headers.get("retry-after") ?? "3") || 3);
        const until = Date.now() + seconds * 1000;
        retryRef.current = until;
        setRetryUntil(until);
        setRetrySeconds(seconds);
        setMessage(`Updates paused. Next check in ${seconds} seconds.`);
      } else if (response.status === 404) {
        setMessage("Deployment not found.");
      } else {
        setMessage("Updates paused. Try again.");
      }
    } catch {
      setOffline(!navigator.onLine);
      setMessage(navigator.onLine ? "Updates paused. Try again." : "You appear to be offline. The last known status is shown.");
    } finally {
      window.clearTimeout(delayedIndicator);
      setCheckingVisible(false);
      setChecking(false);
    }
  }, [id]);

  useEffect(() => {
    if (!activeStates.has(state.status)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const wait = Math.max(3000, retryRef.current - Date.now());
      timer = setTimeout(async () => {
        if (document.hidden) {
          schedule();
          return;
        }
        await refresh();
        schedule();
      }, wait);
    };
    const wake = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    schedule();
    return () => { if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", wake); window.removeEventListener("online", wake); };
  }, [refresh, state.status, retryUntil]);

  useEffect(() => {
    if (!retryUntil) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryUntil - Date.now()) / 1000));
      setRetrySeconds(remaining);
      if (remaining === 0) setRetryUntil(0);
    }, 250);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const disabled = checking || retrySeconds > 0;
  const applicationUrl = (() => {
    if (!state.url) return null;
    try {
      const parsed = new URL(state.url);
      return parsed.protocol === "https:" ? parsed.toString() : null;
    } catch {
      return null;
    }
  })();
  const statusCopy = state.status === "HEALTHY" ? "The application is ready." : state.status === "FAILED" ? state.failureSummary ?? "The deployment failed. Review the repository and try again." : state.status === "CANCELLED" ? "The deployment did not complete." : state.status === "UNKNOWN" ? "The portal cannot confirm the current state." : "Building the application. Updates will appear automatically.";

  return <div className="status-panel-content">
    <div className="status-line"><StatusBadge status={state.status} /><button type="button" className="button secondary" onClick={() => void refresh()} disabled={disabled}>{checking ? "Checking…" : retrySeconds > 0 ? `Try again in ${retrySeconds}s` : "Refresh status"}</button></div>
    <p className="status-copy">{statusCopy}</p>
    {activeStates.has(state.status) && <ol className="progress-steps" aria-label="Deployment progress">{progressSteps.map((step) => <li key={step.status} className={state.status === step.status ? "current" : ""} aria-current={state.status === step.status ? "step" : undefined}>{step.label}</li>)}</ol>}
    {checkingVisible && <p className="muted checking" aria-hidden="true">Checking for updates…</p>}
    {offline && <p className="alert warning" role="status">You appear to be offline. The last known status is shown.</p>}
    {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
    <p className="muted"><span>Last update: </span><time dateTime={state.lastUpdatedAt}>{new Date(state.lastUpdatedAt).toLocaleString()}</time></p>
    {applicationUrl && <p><span className="sr-only">{state.status === "FAILED" ? "Current healthy application: " : "Application: "}</span><a className="button primary" href={applicationUrl} target="_blank" rel="noreferrer">Open application <span className="sr-only">(opens in a new tab)</span> ↗</a></p>}
  </div>;
}
