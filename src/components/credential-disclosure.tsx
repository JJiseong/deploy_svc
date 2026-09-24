"use client";

import { useEffect, useRef, useState } from "react";
import { revealBasicAuth } from "../app/actions/deployments";

export function CredentialDisclosure({ deploymentId }: { deploymentId: string }) {
  const [value, setValue] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealButtonRef = useRef<HTMLButtonElement>(null);

  async function reveal() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const result = await revealBasicAuth(deploymentId);
      if (!result.ok) setError(result.error.message);
      else {
        setValue(result.data);
        setMessage("Credentials revealed. Keep them private.");
      }
    } catch {
      setError("Credentials could not be loaded. Try again.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (value) headingRef.current?.focus();
  }, [value]);

  async function copyPassword() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value.password);
      setMessage("Password copied to clipboard.");
    } catch {
      setMessage("Copy was unavailable. Select the password manually.");
    }
  }

  function hide() {
    setValue(null);
    setMessage("");
    window.setTimeout(() => revealButtonRef.current?.focus(), 0);
  }

  if (value) return <section className="credential-box" aria-labelledby="credential-heading"><h3 id="credential-heading" ref={headingRef} tabIndex={-1}>Application credentials</h3><p><strong>Username:</strong> <code>{value.username}</code></p><p><strong>Password:</strong> <code>{value.password}</code></p><div className="credential-actions"><button type="button" className="button secondary" onClick={() => void copyPassword()}>Copy password</button><button type="button" className="button text" onClick={hide}>Hide credentials</button></div>{message && <p className="muted" role="status" aria-live="polite">{message}</p>}</section>;
  return <div><button ref={revealButtonRef} type="button" className="button secondary" onClick={() => void reveal()} disabled={pending} aria-busy={pending}>{pending ? "Loading credentials…" : "Reveal credentials"}</button>{error && <p className="field-error" role="alert">{error}</p>}</div>;
}
