---
sync_version: 1
content_hash: 7423f9086b49d6ab6aa847e87c4cba6430f43c049385c130185cb38983938e9e
---

# 배포 포털

승인된 GitHub 저장소를 선택해 HTTPS 서비스로 배포하는 비개발자용 포털입니다. 포털에는 이메일과 비밀번호로 로그인하고, 실제 배포를 시작할 때만 GitHub를 연결합니다.

운영 포털: [배포 포털 열기](https://l8ltz9sguhn1ydmnk5htribk.13.212.183.181.sslip.io)

## 서비스 소개

이 포털은 다음 작업을 한 화면에서 처리합니다.

- 관리자가 만든 이메일 계정으로 로그인
- 처음 로그인했을 때 임시 비밀번호를 새 비밀번호로 변경
- GitHub 저장소와 브랜치·태그를 자동으로 불러오기
- 저장소 선택 → 버전 선택 → 배포 시작
- 배포 진행 상태와 공개 서비스 주소 확인
- GitHub 연결 만료 시 재연결하거나 다른 GitHub 계정으로 교체
- 관리자의 팀원 관리, 감사 기록 확인, 기존 서비스 공개 전환

포털 로그인과 GitHub 연결은 서로 별개입니다. GitHub 연결을 해제해도 포털 계정과 기존 배포 기록은 유지됩니다.

## 사용자 빠른 시작

### 1. 포털에 로그인

관리자에게 받은 이메일과 임시 비밀번호로 로그인합니다. 첫 로그인에서는 새 비밀번호를 반드시 설정해야 합니다. 비밀번호를 잊었다면 관리자에게 임시 비밀번호 재발급을 요청합니다.

### 2. GitHub 연결

대시보드에서 **GitHub 연결**을 누르고 저장소를 읽을 GitHub 계정으로 승인합니다. GitHub는 포털 로그인 수단이 아니라 저장소 목록을 가져오는 용도로만 사용합니다.

연결이 만료되었거나 다른 계정으로 바꾸려면 대시보드에서 **GitHub 연결 해제** 후 **GitHub 다시 연결**을 누르세요. GitHub 승인 화면에서 계정을 직접 선택할 수 있습니다.

### 3. 저장소를 골라 배포

1. 저장소 이름으로 검색하고 저장소를 선택합니다.
2. 기본 버전이 자동으로 선택된 상태에서 필요할 때만 다른 브랜치나 태그를 고릅니다.
3. **배포 시작**을 누릅니다.

포트, 앱 이름, 빌드 방식을 직접 입력하지 않아도 됩니다. 포털이 저장소 내용을 분석해 배포 설정을 결정합니다.

### 앱 유형별 실행 방식

간단한 정적 사이트는 정적 빌드 방식과 작은 웹서버 프로필로 실행해 불필요한 런타임 리소스를 줄입니다. Node 웹앱과 Dockerfile 앱은 서로 격리된 컨테이너로 실행해 서버 프로세스와 사용자 설정을 안전하게 보존합니다. 앱 유형을 잘못 추측하면 배포하지 않고 필요한 파일을 안내합니다.

### 4. 서비스 열기

배포 상세 화면에서 상태가 완료되면 **서비스 열기**를 누릅니다. 새 서비스는 HTTPS 주소로 제공되며 링크를 아는 사람은 사용할 수 있습니다. 검색 엔진에는 노출되지 않도록 `noindex`가 적용됩니다.

## 지원되는 저장소

포털은 다음 유형을 자동으로 인식합니다.

| 저장소 형태 | 자동 판단 기준 |
|---|---|
| Docker 앱 | `Dockerfile`과 `EXPOSE` 설정 |
| Node 웹앱 | `package.json`, 실행 명령, 소스의 포트 설정 |
| 정적 웹사이트 | `index.html` |

필요한 파일을 찾지 못하면 배포를 만들기 전에 무엇을 추가해야 하는지 쉬운 설명을 표시합니다. 자동 판단이 불가능한 저장소는 임의로 배포하지 않습니다.

## 관리자 기능

관리자 계정으로 로그인하면 대시보드 메뉴에서 다음 기능을 사용할 수 있습니다.

- **팀원 관리**: 이메일 계정 생성, 역할 지정, 활성·비활성 전환
- **임시 비밀번호 재발급**: 사용자가 비밀번호를 잊었을 때 새 임시 비밀번호 발급
- **활동 기록**: 로그인, GitHub 연결, 배포, 권한 변경 결과 확인
- **기존 서비스 공개 전환**: 기존 Coolify 앱의 Basic Auth를 해제하고 HTTPS·검색 비노출을 적용

기존 서비스 공개 전환은 이미 처리된 앱을 건너뛰는 방식으로 동작하므로 다시 실행해도 안전합니다. 전환 결과는 앱별로 기록됩니다.

## 공개 주소와 보안

- 새 배포와 공개 전환 앱은 Basic Auth 없이 HTTPS로 열립니다.
- `noindex`는 검색 노출을 막는 설정이지 접근 권한을 대신하는 인증 기능은 아닙니다. 민감한 서비스에는 별도의 애플리케이션 인증을 추가해야 합니다.
- GitHub 토큰은 서버에서 암호화해 보관하며 브라우저 화면이나 클라이언트 번들에 넣지 않습니다.
- 저장소 조회와 새 배포는 GitHub 연결이 유효할 때만 가능합니다.
- 허용된 저장소 소유자만 사용할 수 있도록 `ALLOWED_GITHUB_OWNERS` 정책을 적용합니다.
- 비밀번호 해시는 사용자 목록이나 임시 비밀번호 응답에 포함하지 않습니다.

## 문제 해결

### `redirect_uri is not associated with this application`

GitHub OAuth 앱의 callback URL이 포털 주소와 정확히 일치해야 합니다.

```text
https://<포털-주소>/api/github/connect/callback
```

끝의 경로, HTTPS, 도메인을 포함해 한 글자라도 다르면 승인할 수 없습니다.

### GitHub 연결이 만료되었어요

대시보드에서 **GitHub 다시 연결**을 누르세요. 다른 계정으로 바꾸려면 먼저 연결을 해제한 뒤 GitHub 승인 화면에서 원하는 계정을 선택합니다.

### 저장소 목록이 비어 있어요

GitHub 연결 상태와 저장소 소유자 정책을 확인하세요. 연결된 계정이 `ALLOWED_GITHUB_OWNERS`에 허용된 소유자의 저장소에 접근할 수 있어야 합니다.

### 배포는 완료됐는데 주소가 보이지 않아요

배포 상세 화면을 새로고침해 주소가 생성되는지 확인하세요. 계속 보이지 않으면 관리자에게 활동 기록과 Coolify 배포 상태를 확인해 달라고 요청하세요. 정상 완료된 배포는 **서비스 열기** 버튼으로 공개 주소를 엽니다.

### 첫 로그인 후 계속 비밀번호 변경 화면으로 돌아가요

현재 로그인한 계정의 새 비밀번호 저장이 완료되지 않은 상태입니다. 모든 필수 입력을 채워 저장한 뒤 다시 로그인하세요. 해결되지 않으면 관리자에게 임시 비밀번호 재발급을 요청합니다.

## 로컬 개발

### 준비물

- Bun 1.x
- SQLite를 사용할 수 있는 개발 환경
- 저장소 조회·배포 연동 시 GitHub OAuth 앱과 Coolify API 자격 증명

### 실행

```bash
git clone https://github.com/JJiseong/deploy_svc.git
cd deploy_svc
bun install
cp .env.sample .env.local
bun run db:migrate
bun run dev
```

로컬에서는 `AUTH_URL=http://localhost:3000`과 개발용 `DATABASE_URL`을 사용하세요. 실제 토큰과 암호화 키는 `.env.local` 또는 배포 플랫폼의 비밀 저장소에만 넣고 Git에 커밋하지 않습니다.

기본 브라우저 주소는 [http://localhost:3000](http://localhost:3000)입니다.

### 주요 환경 변수

| 변수 | 용도 |
|---|---|
| `AUTH_SECRET` | 포털 세션 암호화 키 |
| `AUTH_URL` | 포털의 외부 주소 |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | 로그인 이후 GitHub 연결용 OAuth 앱 |
| `DATABASE_URL` | SQLite 데이터베이스 위치 |
| `APP_ENCRYPTION_KEY` | 서버 보관 토큰 암호화 키 |
| `ALLOWED_GITHUB_OWNERS` | 저장소를 허용할 GitHub 소유자 목록 |
| `COOLIFY_BASE_URL` | Coolify API 주소 |
| `COOLIFY_READ_API_TOKEN` | 상태 조회용 토큰 |
| `COOLIFY_WRITE_API_TOKEN` | 애플리케이션 생성용 토큰 |
| `COOLIFY_DEPLOY_API_TOKEN` | 배포 시작용 토큰 |

전체 예시는 [.env.sample](.env.sample)을 확인하세요.

## 운영 배포

운영 배포는 Coolify의 Docker 배포를 사용합니다.

- `/data`를 영속 볼륨으로 연결해 사용자·배포·감사 기록을 보존합니다.
- 컨테이너 시작 시 데이터베이스 마이그레이션을 확인합니다.
- GitHub OAuth 앱 callback은 `/api/github/connect/callback`으로 설정합니다.
- 배포 전 `bun run staging:preflight`로 환경 변수와 Coolify 연결을 점검합니다.
- 운영 점검 절차와 영구 SSH 접속 설정은 [staging smoke runbook](docs/runbooks/coolify-portal-staging-smoke.md)을 따릅니다.

SSH 접속은 문서에 개인 키를 저장하지 않고 로컬의 `deploy-svc-ec2` 별칭을 사용합니다. 개인 키는 저장소 밖에 두고 권한을 `600`으로 제한하세요.

## 검증 명령

변경 전후에 다음 명령을 실행합니다.

```bash
bun run typecheck
bun run test:unit
bun test
bun run build
bun run audit
```

접근성 검사는 테스트 대상 주소를 지정해 실행합니다.

```bash
A11Y_BASE_URL=https://<포털-주소> bun run test:a11y
```

CI에서는 애플리케이션 검증, 컨테이너 스모크, 문서 감사, 시크릿 검사를 모두 실행합니다.

## 저장소 구조

| 경로 | 역할 |
|---|---|
| `src/app/` | 로그인, 대시보드, 관리자 화면, API 라우트 |
| `src/lib/auth/` | 이메일 로그인, 역할·상태 권한 검사, 비밀번호 처리 |
| `src/lib/github/` | GitHub OAuth 연결, 저장소·브랜치 조회 |
| `src/lib/deployments/` | 저장소 분석, Coolify 생성·배포·공개 전환 |
| `src/components/` | 한국어 사용자 화면과 상태 표시 |
| `prisma/` | SQLite 스키마와 마이그레이션 |
| `tests/` | 단위·통합·시나리오 테스트 |
| `docs/` | 운영 절차, 설계, 보안 문서 |

## 라이선스

라이선스와 보안 취급 기준은 [LICENSE](LICENSE)와 [SECURITY.md](SECURITY.md)를 확인하세요.

*Last Updated: 2026-10-02*
