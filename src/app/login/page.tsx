import { Suspense } from "react";
import { LoginButton } from "../../components/login-button";
import { LoginMessage } from "../../components/login-message";
export const dynamic = "force-dynamic";
export default function LoginPage() { return <main className="center-page"><section className="card narrow" aria-busy="false"><p className="eyebrow">배포 포털</p><h1>계정으로 로그인</h1><p className="muted">관리자에게 받은 이메일과 임시 비밀번호로 로그인하세요. GitHub는 배포할 때만 연결합니다.</p><Suspense fallback={null}><LoginMessage /></Suspense><LoginButton /></section></main>; }
