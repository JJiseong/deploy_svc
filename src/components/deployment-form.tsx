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
  const translateError = (message: string) => ({
    "Check the highlighted fields.": "입력한 항목을 확인하세요.",
    "This repository owner is not enabled for deployments.": "이 저장소 소유자는 배포 대상으로 허용되지 않았습니다.",
    "Access denied.": "접근 권한이 없습니다.",
    "Deployment limit reached. Try again later.": "배포 한도에 도달했습니다. 잠시 후 다시 시도하세요.",
    "The deployment service is unavailable. Try again without clearing your input.": "배포 서비스를 사용할 수 없습니다. 입력값을 지우지 말고 다시 시도하세요.",
  }[message] ?? message);
  const translateFieldError = (message: string) => ({
    "Repository must use owner/name format": "저장소는 owner/name 형식으로 입력하세요.",
    "Invalid repository owner": "저장소 소유자 이름이 올바르지 않습니다.",
    "Repository name is too long": "저장소 이름이 너무 깁니다.",
    "Invalid branch": "브랜치 이름이 올바르지 않습니다.",
    "Invalid application name": "애플리케이션 이름이 올바르지 않습니다.",
  }[message] ?? message);
  function update(key: string, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setFieldErrors({});
    let result;
    try {
      result = await createDeployment({ ...form, port: Number(form.port), idempotencyKey: crypto.randomUUID() });
    } catch {
      setPending(false);
      setError("배포 서비스를 사용할 수 없습니다. 입력값을 지우지 말고 다시 시도하세요.");
      summaryRef.current?.focus();
      return;
    }
    setPending(false);
    if (!result.ok) { setError(translateError(result.error.message)); setFieldErrors(Object.fromEntries(Object.entries(result.error.fieldErrors ?? {}).map(([field, messages]) => [field, messages.map(translateFieldError)]))); queueMicrotask(() => summaryRef.current?.focus()); return; }
    router.push(`/deployments/${result.data.id}`);
  }
  return <form className="card form-card" onSubmit={submit} aria-busy={pending} aria-labelledby="deployment-form-heading">
    <div><h2 id="deployment-form-heading">저장소 배포</h2><p className="muted">CPU, 메모리, 생성 URL, 자동 배포, 기본 인증은 포털에서 관리합니다.</p></div>
    {error && <div ref={summaryRef} className="alert error error-summary" role="alert" tabIndex={-1} aria-labelledby="deployment-error-heading"><h3 id="deployment-error-heading">배포를 만들 수 없습니다</h3><p>{error}</p>{Object.keys(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).flatMap(([field, messages]) => messages.map((message) => <li key={`${field}-${message}`}><a href={`#${field}`}>{message}</a></li>))}</ul>}</div>}
    <div className="field-grid">
      <label htmlFor="repository">저장소<input id="repository" required value={form.repository} onChange={(e) => update("repository", e.target.value)} placeholder="JJiseong/sample-agent" aria-invalid={Boolean(fieldErrors.repository)} aria-describedby={fieldErrors.repository ? "repository-error" : undefined} />{fieldErrors.repository?.map((e) => <small id="repository-error" className="field-error" key={e}>{e}</small>)}</label>
      <label htmlFor="branch">브랜치<input id="branch" required value={form.branch} onChange={(e) => update("branch", e.target.value)} aria-invalid={Boolean(fieldErrors.branch)} aria-describedby={fieldErrors.branch ? "branch-error" : undefined} />{fieldErrors.branch?.map((e) => <small id="branch-error" className="field-error" key={e}>{e}</small>)}</label>
      <label htmlFor="applicationName">애플리케이션 이름<input id="applicationName" required value={form.applicationName} onChange={(e) => update("applicationName", e.target.value)} placeholder="sample-agent" aria-invalid={Boolean(fieldErrors.applicationName)} aria-describedby={fieldErrors.applicationName ? "application-name-error" : undefined} />{fieldErrors.applicationName?.map((e) => <small id="application-name-error" className="field-error" key={e}>{e}</small>)}</label>
      <label htmlFor="port">포트<input id="port" required type="number" min="1" max="65535" value={form.port} onChange={(e) => update("port", e.target.value)} aria-invalid={Boolean(fieldErrors.port)} aria-describedby={fieldErrors.port ? "port-error" : undefined} />{fieldErrors.port?.map((e) => <small id="port-error" className="field-error" key={e}>{e}</small>)}</label>
    </div>
    <fieldset><legend>빌드 방식</legend><div className="radio-row">{[["AUTO", "자동"], ["NIXPACKS", "Nixpacks"], ["DOCKERFILE", "Dockerfile"]].map(([value, label]) => <label key={value}><input type="radio" name="buildPack" value={value} checked={form.buildPack === value} onChange={(e) => update("buildPack", e.target.value)} /> {label}</label>)}</div></fieldset>
    <button className="button primary" disabled={pending}>{pending ? "배포를 만드는 중…" : "저장소 배포"}</button>
  </form>;
}
