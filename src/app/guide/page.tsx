import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/current-user";
import { AppShell } from "../../components/app-shell";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <AppShell user={user}>
    <header className="page-header"><div><p className="eyebrow">도움말</p><h1>사용법</h1><p className="muted">저장소를 배포하고 결과를 확인하는 방법을 안내합니다.</p></div></header>
    <div className="guide-grid">
      <section className="card" aria-labelledby="guide-start-heading">
        <h2 id="guide-start-heading">빠른 시작</h2>
        <ol className="guide-steps">
          <li><strong>GitHub로 로그인</strong><span>관리자가 허용한 GitHub 계정으로 로그인합니다.</span></li>
          <li><strong>저장소 선택</strong><span>저장소를 검색해 선택하면 기본 브랜치와 애플리케이션 이름이 자동으로 채워집니다.</span></li>
          <li><strong>배포 시작</strong><span>빌드 방식을 선택하고 <em>저장소 배포</em>를 누릅니다.</span></li>
          <li><strong>상태 확인</strong><span>배포 상세 화면에서 상태가 정상으로 바뀌는지 확인합니다.</span></li>
          <li><strong>애플리케이션 열기</strong><span>정상 배포가 끝나면 <em>애플리케이션 열기</em>를 눌러 서비스로 이동합니다.</span></li>
        </ol>
      </section>
      <section className="card" aria-labelledby="guide-fields-heading">
        <h2 id="guide-fields-heading">입력 항목</h2>
        <dl className="guide-list">
          <div><dt>저장소 검색</dt><dd>GitHub 저장소 이름이나 설명으로 검색한 뒤 목록에서 선택합니다. 허용된 소유자의 저장소만 표시됩니다.</dd></div>
          <div><dt>브랜치</dt><dd>저장소를 선택하면 브랜치 목록이 자동으로 표시됩니다. 기본 브랜치가 먼저 선택됩니다.</dd></div>
          <div><dt>애플리케이션 이름</dt><dd>저장소 이름을 바탕으로 자동 생성되며, 영문 소문자·숫자·하이픈으로 수정할 수 있습니다.</dd></div>
          <div><dt>포트</dt><dd>애플리케이션이 수신하는 포트입니다. 기본값은 <code>3000</code>입니다.</dd></div>
          <div><dt>수기 입력</dt><dd>GitHub API를 사용할 수 없을 때만 <em>저장소를 직접 입력</em>으로 전환할 수 있습니다.</dd></div>
          <div><dt>빌드 방식</dt><dd><em>자동</em>을 권장합니다. 저장소에 맞는 방식을 직접 선택할 수도 있습니다.</dd></div>
        </dl>
      </section>
      <section className="card" aria-labelledby="guide-status-heading">
        <h2 id="guide-status-heading">배포 상태</h2>
        <ul className="guide-bullets">
          <li><strong>요청됨·준비 중·대기 중·진행 중</strong> — 배포가 진행되고 있습니다.</li>
          <li><strong>정상</strong> — 애플리케이션을 열 수 있습니다.</li>
          <li><strong>실패</strong> — 저장소의 빌드 설정과 로그를 확인한 뒤 다시 배포합니다.</li>
          <li><strong>확인 불가</strong> — 잠시 후 <em>상태 새로고침</em>을 누릅니다.</li>
        </ul>
      </section>
      <section className="card" aria-labelledby="guide-credential-heading">
        <h2 id="guide-credential-heading">기본 인증정보</h2>
        <p>배포 상세 화면의 <em>인증정보 보기</em>를 누르면 애플리케이션 로그인 정보가 표시됩니다.</p>
        <p className="alert warning" role="note">비밀번호는 화면에 표시된 뒤 다른 사람에게 공유하지 말고, 필요할 때만 확인하세요.</p>
      </section>
      {user.role === "ADMIN" && <section className="card" aria-labelledby="guide-admin-heading">
        <h2 id="guide-admin-heading">관리자 기능</h2>
        <ul className="guide-bullets"><li><Link href="/admin/users">사용자 관리</Link>에서 GitHub 로그인 아이디를 추가하고 역할과 활성 상태를 관리합니다.</li><li><Link href="/admin/audit-logs">감사 로그</Link>에서 로그인, 배포, 권한 변경 기록을 필터링해 확인합니다.</li></ul>
      </section>}
    </div>
  </AppShell>;
}
