import Link from "next/link";

export default function NotFound() {
  return <main className="center-page"><section className="card narrow"><p className="eyebrow">찾을 수 없음</p><h1>배포를 찾을 수 없습니다</h1><p className="muted">배포가 없거나 이 배포를 볼 권한이 없습니다.</p><Link className="button primary" href="/dashboard">대시보드로 돌아가기</Link></section></main>;
}
