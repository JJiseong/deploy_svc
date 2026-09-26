"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Portal request failed", error.digest ?? "unknown"); }, [error.digest]);
  return <main className="center-page"><section className="card narrow" role="alert"><p className="eyebrow">서비스 오류</p><h1>문제가 발생했습니다</h1><p className="muted">포털에서 이 페이지를 불러오지 못했습니다. 저장된 데이터는 변경되지 않았습니다.</p><button type="button" className="button primary" onClick={() => reset()}>다시 시도</button></section></main>;
}
