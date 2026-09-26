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
        setMessage("인증정보를 표시했습니다. 안전하게 보관하세요.");
      }
    } catch {
      setError("인증정보를 불러올 수 없습니다. 다시 시도하세요.");
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
      setMessage("비밀번호를 클립보드에 복사했습니다.");
    } catch {
      setMessage("복사할 수 없습니다. 비밀번호를 직접 선택하세요.");
    }
  }

  function hide() {
    setValue(null);
    setMessage("");
    window.setTimeout(() => revealButtonRef.current?.focus(), 0);
  }

  if (value) return <section className="credential-box" aria-labelledby="credential-heading"><h3 id="credential-heading" ref={headingRef} tabIndex={-1}>애플리케이션 인증정보</h3><p><strong>사용자 이름:</strong> <code>{value.username}</code></p><p><strong>비밀번호:</strong> <code>{value.password}</code></p><div className="credential-actions"><button type="button" className="button secondary" onClick={() => void copyPassword()}>비밀번호 복사</button><button type="button" className="button text" onClick={hide}>인증정보 숨기기</button></div>{message && <p className="muted" role="status" aria-live="polite">{message}</p>}</section>;
  return <div><button ref={revealButtonRef} type="button" className="button secondary" onClick={() => void reveal()} disabled={pending} aria-busy={pending}>{pending ? "인증정보를 불러오는 중…" : "인증정보 보기"}</button>{error && <p className="field-error" role="alert">{error}</p>}</div>;
}
