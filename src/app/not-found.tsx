import Link from "next/link";

export default function NotFound() {
  return <main className="center-page"><section className="card narrow"><p className="eyebrow">Not found</p><h1>Deployment not found</h1><p className="muted">The deployment may not exist or you may not have access to it.</p><Link className="button primary" href="/dashboard">Return to dashboard</Link></section></main>;
}
