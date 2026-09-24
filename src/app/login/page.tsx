import { Suspense } from "react";
import { LoginButton } from "../../components/login-button";
import { LoginMessage } from "../../components/login-message";
export const dynamic = "force-dynamic";
export default function LoginPage() { return <main className="center-page"><section className="card narrow" aria-busy="false"><p className="eyebrow">Private access</p><h1>Deploy approved GitHub projects</h1><p className="muted">Sign in with an enabled GitHub account to manage deployments.</p><Suspense fallback={null}><LoginMessage /></Suspense><LoginButton /></section></main>; }
