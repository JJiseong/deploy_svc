"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "./status-badge";

type Status = "REQUESTED" | "PROVISIONING" | "QUEUED" | "IN_PROGRESS" | "HEALTHY" | "FAILED" | "CANCELLED" | "UNKNOWN";
const activeStates = new Set<Status>(["REQUESTED", "PROVISIONING", "QUEUED", "IN_PROGRESS"]);
const progressSteps: Array<{ status: Status; label: string }> = [
  { status: "REQUESTED", label: "요청됨" },
  { status: "PROVISIONING", label: "준비 중" },
  { status: "QUEUED", label: "대기 중" },
  { status: "IN_PROGRESS", label: "진행 중" },
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
          if (previous.status !== next.status) setMessage(`상태가 '${next.status.toLowerCase().replaceAll("_", " ")}'(으)로 변경되었습니다.`);
          return next;
        });
        setOffline(false);
        retryRef.current = 0;
        setRetryUntil(0);
        setRetrySeconds(0);
      } else if (response.status === 401) {
        setMessage("세션이 만료되었습니다. 계속하려면 다시 로그인하세요.");
      } else if (response.status === 429 || response.status === 503) {
        const seconds = Math.max(1, Number(response.headers.get("retry-after") ?? "3") || 3);
        const until = Date.now() + seconds * 1000;
        retryRef.current = until;
        setRetryUntil(until);
        setRetrySeconds(seconds);
        setMessage(`업데이트를 잠시 멈췄습니다. ${seconds}초 후 다시 확인합니다.`);
      } else if (response.status === 404) {
        setMessage("배포를 찾을 수 없습니다.");
      } else {
        setMessage("업데이트를 잠시 멈췄습니다. 다시 시도하세요.");
      }
    } catch {
      setOffline(!navigator.onLine);
      setMessage(navigator.onLine ? "업데이트를 잠시 멈췄습니다. 다시 시도하세요." : "오프라인 상태입니다. 마지막으로 확인된 상태를 표시합니다.");
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
    if (state.url || activeStates.has(state.status)) return;
    void refresh();
  }, [refresh, state.status, state.url]);

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
  const statusCopy = state.status === "HEALTHY" ? applicationUrl ? "애플리케이션을 사용할 수 있습니다." : "배포는 완료됐습니다. 공개 주소를 확인하는 중입니다." : state.status === "FAILED" ? state.failureSummary ?? "배포에 실패했습니다. 저장소의 빌드 설정을 확인한 후 다시 시도하세요." : state.status === "CANCELLED" ? "배포가 완료되지 않았습니다." : state.status === "UNKNOWN" ? "포털에서 현재 상태를 확인할 수 없습니다." : "애플리케이션을 빌드하고 있습니다. 상태가 자동으로 갱신됩니다.";

  return <div className="status-panel-content">
    <div className="status-line"><StatusBadge status={state.status} /><button type="button" className="button secondary" onClick={() => void refresh()} disabled={disabled}>{checking ? "확인 중…" : retrySeconds > 0 ? `${retrySeconds}초 후 다시 시도` : "상태 새로고침"}</button></div>
    <p className="status-copy">{statusCopy}</p>
    {activeStates.has(state.status) && <ol className="progress-steps" aria-label="배포 진행 단계">{progressSteps.map((step) => <li key={step.status} className={state.status === step.status ? "current" : ""} aria-current={state.status === step.status ? "step" : undefined}>{step.label}</li>)}</ol>}
    {checkingVisible && <p className="muted checking" aria-hidden="true">업데이트를 확인하는 중…</p>}
    {offline && <p className="alert warning" role="status">오프라인 상태입니다. 마지막으로 확인된 상태를 표시합니다.</p>}
    {message && <p className="muted" role="status" aria-live="polite">{message}</p>}
    <p className="muted"><span>마지막 업데이트: </span><time dateTime={state.lastUpdatedAt}>{new Date(state.lastUpdatedAt).toLocaleString("ko-KR")}</time></p>
    {applicationUrl && <p><span className="sr-only">{state.status === "FAILED" ? "현재 정상인 애플리케이션: " : "애플리케이션: "}</span><a className="button primary" href={applicationUrl} target="_blank" rel="noreferrer">애플리케이션 열기 <span className="sr-only">(새 탭에서 열림)</span> ↗</a></p>}
  </div>;
}
