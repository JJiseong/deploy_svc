"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { disconnectGithub } from "../app/actions/github";

type Notice = "connected" | "failed" | "conflict" | undefined;

const noticeMessages: Record<Exclude<Notice, undefined>, string> = {
  connected: "GitHub 연결이 완료되었습니다. 이제 저장소를 선택할 수 있습니다.",
  failed: "GitHub 연결을 완료하지 못했습니다. 다시 연결해 주세요.",
  conflict: "이 GitHub 계정은 다른 포털 계정에 이미 연결되어 있습니다.",
};

export function GitHubConnection({ login, notice }: { login?: string | null; notice?: Notice }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const connected = Boolean(login);

  async function disconnect() {
    if (!window.confirm("GitHub 연결을 해제할까요? 저장소 목록을 다시 보려면 다시 연결해야 합니다.")) return;
    setPending(true);
    const result = await disconnectGithub();
    setPending(false);
    if (!result.ok) {
      setMessage(result.error.message);
      return;
    }
    setMessage("GitHub 연결을 해제했습니다.");
    router.refresh();
  }

  return <section className="card" aria-labelledby="github-connection-heading">
    <p className="eyebrow">GitHub 연결</p>
    <h2 id="github-connection-heading">{connected ? `연결됨 · @${login}` : "GitHub를 연결하세요"}</h2>
    <p className="muted">{connected ? "저장소 목록을 불러오고 배포할 때만 GitHub를 사용합니다." : "저장소와 버전 목록을 불러오려면 GitHub 연결이 필요합니다."}</p>
    {notice && <p className={notice === "connected" ? "alert success" : "alert error"} role="status">{noticeMessages[notice]}</p>}
    {message && <p className="muted" role="status">{message}</p>}
    <div className="button-row">
      <a className="button primary" href="/api/github/connect">{connected ? "GitHub 다시 연결" : "GitHub 연결"}</a>
      {connected && <button className="button secondary" type="button" onClick={() => void disconnect()} disabled={pending}>{pending ? "연결 해제 중…" : "연결 해제"}</button>}
    </div>
    {connected && <small className="muted">다른 GitHub 계정을 사용하려면 먼저 연결을 해제한 뒤 다시 연결하세요.</small>}
  </section>;
}
