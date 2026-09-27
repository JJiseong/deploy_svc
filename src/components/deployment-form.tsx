"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createDeployment } from "../app/actions/deployments";

type RepositoryOption = { id: string; name: string; fullName: string; ownerLogin: string; private: boolean; defaultBranch: string; description: string | null; htmlUrl: string };
type BranchOption = { name: string; sha: string; protected: boolean };

function suggestedApplicationName(repository: string): string {
  return repository.split("/").at(-1)?.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 63) || "application";
}

export function DeploymentForm() {
  const router = useRouter();
  const [form, setForm] = useState({ repository: "", branch: "main", applicationName: "", port: "3000", buildPack: "AUTO" });
  const [repositories, setRepositories] = useState<RepositoryOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [repositorySearch, setRepositorySearch] = useState("");
  const [repositoryMode, setRepositoryMode] = useState<"select" | "manual">("select");
  const [repositoriesLoading, setRepositoriesLoading] = useState(true);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [repositoryLoadError, setRepositoryLoadError] = useState("");
  const [branchLoadError, setBranchLoadError] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [pending, setPending] = useState(false);
  const applicationNameTouched = useRef(false);
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

  useEffect(() => {
    let cancelled = false;
    async function loadRepositories() {
      setRepositoriesLoading(true);
      try {
        const response = await fetch("/api/github/repositories", { cache: "no-store" });
        const body = await response.json() as { repositories?: RepositoryOption[]; message?: string };
        if (!response.ok) throw new Error(body.message ?? "GitHub 저장소를 불러오지 못했습니다.");
        if (!cancelled) { setRepositories(body.repositories ?? []); setRepositoryLoadError(""); }
      } catch (loadError) {
        if (!cancelled) setRepositoryLoadError(loadError instanceof Error ? loadError.message : "GitHub 저장소를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setRepositoriesLoading(false);
      }
    }
    void loadRepositories();
    return () => { cancelled = true; };
  }, []);

  function update(key: string, value: string) {
    if (key === "applicationName") applicationNameTouched.current = true;
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function selectRepository(fullName: string) {
    const selected = repositories.find((repository) => repository.fullName === fullName);
    setBranches([]); setBranchLoadError("");
    if (!selected) { setForm((current) => ({ ...current, repository: "", branch: "main" })); return; }
    setForm((current) => ({ ...current, repository: selected.fullName, branch: selected.defaultBranch, applicationName: applicationNameTouched.current ? current.applicationName : suggestedApplicationName(selected.fullName) }));
    setBranchesLoading(true);
    try {
      const response = await fetch(`/api/github/repositories/${encodeURIComponent(selected.ownerLogin)}/${encodeURIComponent(selected.name)}/branches`, { cache: "no-store" });
      const body = await response.json() as { branches?: BranchOption[]; message?: string };
      if (!response.ok) throw new Error(body.message ?? "브랜치 목록을 불러오지 못했습니다.");
      setBranches(body.branches ?? []);
    } catch (loadError) {
      setBranchLoadError(loadError instanceof Error ? loadError.message : "브랜치 목록을 불러오지 못했습니다.");
    } finally { setBranchesLoading(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setFieldErrors({});
    let result;
    try { result = await createDeployment({ ...form, port: Number(form.port), idempotencyKey: crypto.randomUUID() }); }
    catch { setPending(false); setError("배포 서비스를 사용할 수 없습니다. 입력값을 지우지 말고 다시 시도하세요."); summaryRef.current?.focus(); return; }
    setPending(false);
    if (!result.ok) { setError(translateError(result.error.message)); setFieldErrors(Object.fromEntries(Object.entries(result.error.fieldErrors ?? {}).map(([field, messages]) => [field, messages.map(translateFieldError)]))); queueMicrotask(() => summaryRef.current?.focus()); return; }
    router.push(`/deployments/${result.data.id}`);
  }

  const visibleRepositories = repositories.filter((repository) => `${repository.fullName} ${repository.description ?? ""}`.toLowerCase().includes(repositorySearch.trim().toLowerCase()));

  return <form className="card form-card" onSubmit={submit} aria-busy={pending} aria-labelledby="deployment-form-heading">
    <div><h2 id="deployment-form-heading">저장소 배포</h2><p className="muted">GitHub 저장소를 검색해 선택하면 브랜치와 애플리케이션 이름을 자동으로 채웁니다.</p></div>
    {error && <div ref={summaryRef} className="alert error error-summary" role="alert" tabIndex={-1} aria-labelledby="deployment-error-heading"><h3 id="deployment-error-heading">배포를 만들 수 없습니다</h3><p>{error}</p>{Object.keys(fieldErrors).length > 0 && <ul>{Object.entries(fieldErrors).flatMap(([field, messages]) => messages.map((message) => <li key={`${field}-${message}`}><a href={`#${field}`}>{message}</a></li>))}</ul>}</div>}
    {repositoryMode === "select" ? <>
      <label htmlFor="repository-search">저장소 검색<input id="repository-search" value={repositorySearch} onChange={(event) => setRepositorySearch(event.target.value)} placeholder="저장소 이름이나 설명으로 검색" disabled={repositoriesLoading || repositories.length === 0} /></label>
      <label htmlFor="repository">저장소<select id="repository" required value={form.repository} onChange={(event) => { void selectRepository(event.target.value); }} disabled={repositoriesLoading || repositories.length === 0} aria-invalid={Boolean(fieldErrors.repository)} aria-describedby={fieldErrors.repository ? "repository-error" : undefined}><option value="">{repositoriesLoading ? "저장소를 불러오는 중…" : "저장소를 선택하세요"}</option>{visibleRepositories.map((repository) => <option value={repository.fullName} key={repository.id}>{repository.fullName}{repository.private ? " · 비공개" : ""}</option>)}</select>{fieldErrors.repository?.map((message) => <small id="repository-error" className="field-error" key={message}>{message}</small>)}</label>
      {repositoryLoadError && <div className="alert warning" role="status"><p>{repositoryLoadError}</p><button type="button" className="button secondary" onClick={() => setRepositoryMode("manual")}>저장소를 직접 입력</button></div>}
      {!repositoriesLoading && !repositoryLoadError && repositories.length === 0 && <div className="alert warning" role="status"><p>배포 가능한 GitHub 저장소가 없습니다.</p><button type="button" className="button secondary" onClick={() => setRepositoryMode("manual")}>저장소를 직접 입력</button></div>}
    </> : <label htmlFor="repository-manual">저장소 직접 입력<input id="repository-manual" required value={form.repository} onChange={(event) => { const value = event.target.value; update("repository", value); if (!applicationNameTouched.current) setForm((current) => ({ ...current, applicationName: suggestedApplicationName(value) })); }} placeholder="JJiseong/sample-agent" aria-invalid={Boolean(fieldErrors.repository)} aria-describedby={fieldErrors.repository ? "repository-manual-error" : undefined} />{fieldErrors.repository?.map((message) => <small id="repository-manual-error" className="field-error" key={message}>{message}</small>)}<button type="button" className="button text" onClick={() => setRepositoryMode("select")}>목록에서 선택</button></label>}
    <div className="field-grid">
      <label htmlFor="branch">브랜치{branches.length > 0 ? <select id="branch" required value={form.branch} onChange={(event) => update("branch", event.target.value)} disabled={branchesLoading} aria-invalid={Boolean(fieldErrors.branch)} aria-describedby={fieldErrors.branch ? "branch-error" : undefined}><option value="">브랜치를 선택하세요</option>{branches.map((branch) => <option value={branch.name} key={branch.name}>{branch.name}{branch.protected ? " · 보호됨" : ""}</option>)}</select> : <input id="branch" required value={form.branch} onChange={(event) => update("branch", event.target.value)} placeholder="main" aria-invalid={Boolean(fieldErrors.branch)} aria-describedby={fieldErrors.branch ? "branch-error" : undefined} />}{branchesLoading && <small className="muted">브랜치를 불러오는 중…</small>}{branchLoadError && <small className="field-error">{branchLoadError} 브랜치를 직접 입력할 수 있습니다.</small>}{fieldErrors.branch?.map((message) => <small id="branch-error" className="field-error" key={message}>{message}</small>)}</label>
      <label htmlFor="applicationName">애플리케이션 이름<input id="applicationName" required value={form.applicationName} onChange={(event) => update("applicationName", event.target.value)} placeholder="sample-agent" aria-invalid={Boolean(fieldErrors.applicationName)} aria-describedby={fieldErrors.applicationName ? "application-name-error" : undefined} />{fieldErrors.applicationName?.map((message) => <small id="application-name-error" className="field-error" key={message}>{message}</small>)}</label>
      <label htmlFor="port">포트<input id="port" required type="number" min="1" max="65535" value={form.port} onChange={(event) => update("port", event.target.value)} aria-invalid={Boolean(fieldErrors.port)} aria-describedby={fieldErrors.port ? "port-error" : undefined} />{fieldErrors.port?.map((message) => <small id="port-error" className="field-error" key={message}>{message}</small>)}</label>
    </div>
    <fieldset><legend>빌드 방식</legend><div className="radio-row">{[["AUTO", "자동"], ["NIXPACKS", "Nixpacks"], ["DOCKERFILE", "Dockerfile"]].map(([value, label]) => <label key={value}><input type="radio" name="buildPack" value={value} checked={form.buildPack === value} onChange={(event) => update("buildPack", event.target.value)} /> {label}</label>)}</div></fieldset>
    <button className="button primary" disabled={pending}>{pending ? "배포를 만드는 중…" : "저장소 배포"}</button>
  </form>;
}
