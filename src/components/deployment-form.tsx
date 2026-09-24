"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDeployment } from "../app/actions/deployments";

export function DeploymentForm() {
  const router = useRouter();
  const [form, setForm] = useState({ repository: "", branch: "main", applicationName: "", port: "3000", buildPack: "AUTO" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  function update(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setFieldErrors({});
    let result;
    try {
      result = await createDeployment({ ...form, port: Number(form.port), idempotencyKey: crypto.randomUUID() });
    } catch {
      setPending(false);
      setError("The deployment service is unavailable. Try again without clearing your input.");
      summaryRef.current?.focus();
      return;
    }
    setPending(false);
    if (!result.ok) { setError(result.error.message); setFieldErrors(result.error.fieldErrors ?? {}); queueMicrotask(() => summaryRef.current?.focus()); return; }
    router.push(`/deployments/${result.data.id}`);
  }
  return <form className="card form-card" onSubmit={submit} aria-busy={pending} aria-labelledby="deployment-form-heading">
    <div><h2 id="deployment-form-heading">Deploy a repository</h2><p className="muted">CPU, memory, generated URL, automatic deployments, and Basic Authentication are managed by the portal.</p></div>
    {error && <div ref={summaryRef} className="alert error error-summary" role="alert" tabIndex={-1} aria-labelledby="deployment-error-heading"><h3 id="deployment-error-heading">Unable to create deployment</h3><p>{error}</p>{Object.keys(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).flatMap(([field, messages]) => messages.map((message) => <li key={`${field}-${message}`}><a href={`#${field}`}>{message}</a></li>))}</ul>}</div>}
    <div className="field-grid">
      <label htmlFor="repository">Repository<input id="repository" required value={form.repository} onChange={(e) => update("repository", e.target.value)} placeholder="JJiseong/sample-agent" aria-invalid={Boolean(fieldErrors.repository)} aria-describedby={fieldErrors.repository ? "repository-error" : undefined} />{fieldErrors.repository?.map((e) => <small id="repository-error" className="field-error" key={e}>{e}</small>)}</label>
      <label htmlFor="branch">Branch<input id="branch" required value={form.branch} onChange={(e) => update("branch", e.target.value)} aria-invalid={Boolean(fieldErrors.branch)} aria-describedby={fieldErrors.branch ? "branch-error" : undefined} />{fieldErrors.branch?.map((e) => <small id="branch-error" className="field-error" key={e}>{e}</small>)}</label>
      <label htmlFor="applicationName">Application name<input id="applicationName" required value={form.applicationName} onChange={(e) => update("applicationName", e.target.value)} placeholder="sample-agent" aria-invalid={Boolean(fieldErrors.applicationName)} aria-describedby={fieldErrors.applicationName ? "application-name-error" : undefined} />{fieldErrors.applicationName?.map((e) => <small id="application-name-error" className="field-error" key={e}>{e}</small>)}</label>
      <label htmlFor="port">Port<input id="port" required type="number" min="1" max="65535" value={form.port} onChange={(e) => update("port", e.target.value)} aria-invalid={Boolean(fieldErrors.port)} aria-describedby={fieldErrors.port ? "port-error" : undefined} />{fieldErrors.port?.map((e) => <small id="port-error" className="field-error" key={e}>{e}</small>)}</label>
    </div>
    <fieldset><legend>Build pack</legend><div className="radio-row">{[["AUTO", "Auto"], ["NIXPACKS", "Nixpacks"], ["DOCKERFILE", "Dockerfile"]].map(([value, label]) => <label key={value}><input type="radio" name="buildPack" value={value} checked={form.buildPack === value} onChange={(e) => update("buildPack", e.target.value)} /> {label}</label>)}</div></fieldset>
    <button className="button primary" disabled={pending}>{pending ? "Creating deployment…" : "Deploy repository"}</button>
  </form>;
}
