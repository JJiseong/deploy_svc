"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("Portal request failed", error.digest ?? "unknown"); }, [error.digest]);
  return <main className="center-page"><section className="card narrow" role="alert"><p className="eyebrow">Service error</p><h1>Something went wrong</h1><p className="muted">The portal could not load this page. Your saved data was not changed.</p><button type="button" className="button primary" onClick={() => reset()}>Try again</button></section></main>;
}
