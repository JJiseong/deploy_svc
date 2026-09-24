"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { addAccessGrant, changeAccessGrantRole, changeAccessGrantStatus } from "../app/actions/admin";

type Grant = { id: string; githubLogin: string; role: "ADMIN" | "USER"; status: "ACTIVE" | "INACTIVE"; lastLoginAt: string | null; createdAt: string };

export function GrantForm() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [login, setLogin] = useState("");
  const [role, setRole] = useState<"USER" | "ADMIN">("USER");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(""); setMessage("");
    try {
      const result = await addAccessGrant({ githubLogin: login, role });
      if (!result.ok) {
        setError(result.error.message);
        queueMicrotask(() => errorRef.current?.focus());
      }
      else { setMessage("User added."); setLogin(""); router.refresh(); }
    } catch {
      setError("Could not update access grants. Try again.");
      queueMicrotask(() => errorRef.current?.focus());
    }
    finally { setPending(false); }
  }
  return <form className="card inline-form" onSubmit={submit} aria-busy={pending} aria-labelledby="add-grant-heading">
    <div><h2 id="add-grant-heading">Add allowed user</h2><p className="muted">The login binds to the GitHub identity at first sign-in.</p></div>
    {error && <div ref={errorRef} className="alert error error-summary" role="alert" tabIndex={-1} aria-labelledby="add-grant-error-heading"><h3 id="add-grant-error-heading">Unable to add user</h3><p>{error}</p></div>}
    <label htmlFor="github-login">GitHub login<input id="github-login" value={login} onChange={(e) => { setLogin(e.target.value); if (error) setError(""); }} placeholder="octocat" required aria-invalid={Boolean(error)} aria-describedby={error ? "github-login-error" : undefined} />{error && <small id="github-login-error" className="field-error">{error}</small>}</label>
    <label htmlFor="grant-role">Role<select id="grant-role" value={role} onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")} disabled={pending}><option value="USER">User</option><option value="ADMIN">Admin</option></select></label>
    <button type="submit" className="button primary" disabled={pending}>{pending ? "Adding user…" : "Add user"}</button>
    {message && <p role="status" className="muted">{message}</p>}
  </form>;
}

export function GrantRow({ grant }: { grant: Grant }) {
  const router = useRouter();
  const [role, setRole] = useState(grant.role);
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const rowHeadingRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => setRole(grant.role), [grant.role]);

  async function saveRole() {
    setPending(true); setMessage("");
    try {
      const result = await changeAccessGrantRole(grant.id, role);
      if (!result.ok) setMessage(result.error.message);
      else { setMessage("Role saved."); router.refresh(); }
    } catch { setMessage("Could not change the role. Try again."); }
    finally { setPending(false); }
  }

  async function applyStatus(next: "ACTIVE" | "INACTIVE") {
    setPending(true); setMessage("");
    try {
      const result = await changeAccessGrantStatus(grant.id, next);
      if (!result.ok) setMessage(result.error.message);
      else {
        setMessage(`${grant.githubLogin} ${next === "ACTIVE" ? "reactivated" : "deactivated"}.`);
        wasOpen.current = false;
        setDialogOpen(false);
        router.refresh();
        window.setTimeout(() => rowHeadingRef.current?.focus(), 0);
      }
    } catch { setMessage("Could not change the user status. Try again."); }
    finally { setPending(false); }
  }

  useEffect(() => {
    if (!dialogOpen) {
      if (wasOpen.current) triggerRef.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    cancelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) { event.preventDefault(); setDialogOpen(false); return; }
      if (event.key !== "Tab") return;
      const focusable = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
      if (focusable.length < 2) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable[focusable.length - 1].focus(); }
      else if (!event.shiftKey && index === focusable.length - 1) { event.preventDefault(); focusable[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialogOpen, pending]);

  function toggle() { if (grant.status === "ACTIVE") setDialogOpen(true); else void applyStatus("ACTIVE"); }

  return <>
    <article className="grant-row" aria-busy={pending}>
      <div><strong ref={rowHeadingRef} tabIndex={-1}>@{grant.githubLogin}</strong><small>{grant.lastLoginAt ? `Last sign-in ${new Date(grant.lastLoginAt).toLocaleString()}` : "Never signed in"}</small><small>Added {new Date(grant.createdAt).toLocaleDateString()}</small></div>
      <label className="sr-only" htmlFor={`role-${grant.id}`}>Role for {grant.githubLogin}</label><select id={`role-${grant.id}`} value={role} onChange={(e) => setRole(e.target.value as "USER" | "ADMIN")} disabled={pending}><option value="USER">User</option><option value="ADMIN">Admin</option></select>
      <span className={`status-badge status-${grant.status.toLowerCase()}`}><span aria-hidden="true">{grant.status === "ACTIVE" ? "✓" : "—"}</span><span>{grant.status === "ACTIVE" ? "Active" : "Inactive"}</span></span>
      <button type="button" className="button secondary" onClick={() => void saveRole()} disabled={pending}>{pending ? "Saving…" : "Save role"}</button>
      <button ref={triggerRef} type="button" className="button text" onClick={toggle} disabled={pending}>{grant.status === "ACTIVE" ? "Deactivate user" : "Reactivate user"}</button>
      {message && <small className="row-message" role="status">{message}</small>}
    </article>
    {dialogOpen && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby={`deactivate-${grant.id}`} aria-describedby={`deactivate-copy-${grant.id}`}>
      <h2 id={`deactivate-${grant.id}`}>Deactivate @{grant.githubLogin}?</h2><p id={`deactivate-copy-${grant.id}`}>This ends the user&apos;s active sessions immediately. You can reactivate the user later.</p>
      {message && <p className="field-error" role="alert">{message}</p>}
      <div className="dialog-actions"><button ref={cancelRef} type="button" className="button secondary" onClick={() => setDialogOpen(false)} disabled={pending}>Cancel</button><button ref={confirmRef} type="button" className="button primary danger" onClick={() => void applyStatus("INACTIVE")} disabled={pending}>{pending ? "Deactivating…" : "Deactivate user"}</button></div>
    </section></div>}
  </>;
}
