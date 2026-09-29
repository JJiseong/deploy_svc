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
          <li><strong>이메일로 로그인</strong><span>관리자에게 받은 이메일과 임시 비밀번호로 로그인하고, 첫 로그인에서 새 비밀번호를 설정합니다.</span></li>
          <li><strong>GitHub 연결</strong><span>처음 배포할 때 GitHub를 연결합니다. 연결이 만료되거나 다른 계정을 사용하려면 대시보드에서 다시 연결할 수 있습니다.</span></li>
          <li><strong>저장소 선택</strong><span>저장소를 검색해 선택하면 기본 브랜치가 자동으로 선택됩니다.</span></li>
          <li><strong>버전 선택 후 배포</strong><span>필요할 때만 다른 브랜치나 태그를 고르고 <em>배포 시작</em>을 누릅니다.</span></li>
          <li><strong>상태 확인</strong><span>배포 상세 화면에서 상태가 정상으로 바뀌는지 확인합니다.</span></li>
          <li><strong>서비스 열기</strong><span>배포가 끝나면 <em>서비스 열기</em>를 눌러 공개 HTTPS 주소로 이동합니다.</span></li>
        </ol>
      </section>
      <section className="card" aria-labelledby="guide-fields-heading">
        <h2 id="guide-fields-heading">입력 항목</h2>
        <dl className="guide-list">
          <div><dt>저장소 검색</dt><dd>GitHub 저장소 이름이나 설명으로 검색한 뒤 목록에서 선택합니다. 허용된 소유자의 저장소만 표시됩니다.</dd></div>
          <div><dt>브랜치</dt><dd>저장소를 선택하면 브랜치 목록이 자동으로 표시됩니다. 기본 브랜치가 먼저 선택됩니다.</dd></div>
          <div><dt>서비스 이름·포트·빌드 방식</dt><dd>저장소 분석 결과를 바탕으로 서버가 자동으로 결정합니다. 기본 화면에서 직접 입력하지 않습니다.</dd></div>
          <div><dt>수기 입력</dt><dd>저장소 목록을 불러올 수 없는 경우에만 안내에 따라 사용합니다.</dd></div>
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
      <section className="card" aria-labelledby="guide-public-heading">
        <h2 id="guide-public-heading">공개 서비스</h2>
        <p>새로 배포된 서비스는 공개 HTTPS 주소로 열립니다. 링크를 아는 사람은 이용할 수 있지만 검색엔진에는 노출되지 않습니다.</p>
        <p className="muted">기술적인 값과 배포 식별자는 상세 화면의 <em>배포 정보</em>에서 확인할 수 있습니다.</p>
      </section>
      <section className="card" aria-labelledby="guide-github-reconnect-heading">
        <h2 id="guide-github-reconnect-heading">GitHub 연결 문제 해결</h2>
        <p>저장소 목록을 불러올 수 없거나 연결이 만료되었다는 안내가 나오면 <em>GitHub 다시 연결</em>을 누르세요. 다른 GitHub 계정을 사용하려면 먼저 <em>연결 해제</em>를 누른 뒤 새 계정으로 연결합니다.</p>
        <p className="muted">포털 이메일·비밀번호와 GitHub 연결은 서로 별개입니다. GitHub 연결을 해제해도 기존 배포 기록은 유지됩니다.</p>
      </section>
      {user.role === "ADMIN" && <section className="card" aria-labelledby="guide-admin-heading">
        <h2 id="guide-admin-heading">관리자 기능</h2>
        <ul className="guide-bullets"><li><Link href="/admin/users">팀원 관리</Link>에서 이메일 계정을 만들고 임시 비밀번호, 역할, 활성 상태를 관리합니다.</li><li><Link href="/admin/audit-logs">활동 기록</Link>에서 로그인, 배포, 권한 변경 기록을 확인합니다.</li></ul>
      </section>}
    </div>
  </AppShell>;
}
