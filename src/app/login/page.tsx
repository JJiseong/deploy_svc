import { Suspense } from "react";
import { LoginButton } from "../../components/login-button";
import { LoginMessage } from "../../components/login-message";
export const dynamic = "force-dynamic";
export default function LoginPage() { return <main className="center-page"><section className="card narrow" aria-busy="false"><p className="eyebrow">비공개 접근</p><h1>승인된 GitHub 프로젝트 배포</h1><p className="muted">허용된 GitHub 계정으로 로그인하면 배포를 관리할 수 있습니다.</p><Suspense fallback={null}><LoginMessage /></Suspense><LoginButton /></section></main>; }
