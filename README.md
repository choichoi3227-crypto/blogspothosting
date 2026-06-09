# WPSpot 🚀

> **WordPress × Blogspot × GitHub — 100% 무료 엔터프라이즈 호스팅 플랫폼**

## 개요

WPSpot은 WordPress를 Blogspot(Google Blogger) 위에서 완전히 무료로 운영할 수 있는 호스팅 플랫폼입니다.

```
사용자 브라우저
      │
      ▼
Cloudflare (CDN + WAF + DDoS)
      │
      ▼
WPSpot 플랫폼 (Next.js + WebSocket)
      │                    │
      ▼                    ▼
Blogger API          GitHub API
(Blogspot 프론트)    (레포 생성/관리)
      │                    │
      ▼                    ▼
블로그스팟 호스팅    GitHub Actions
(실제 접속 위치)    ─────────────────────────
                    1. WordPress 공식 원본 fetch
                    2. SQLite DB 자동 초기화
                    3. wp-config.php 자동 생성
                    4. Cloudflare 캐시 퍼지
```

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| **프론트엔드** | Next.js 15, React 18, Tailwind CSS |
| **백엔드** | Next.js API Routes, Custom HTTP Server |
| **실시간** | WebSocket (ws) - Cloudflare 완벽 호환 |
| **플랫폼 DB** | SQLite (better-sqlite3) - WAL 모드 |
| **사이트 DB** | SQLite (WordPress SQLite Integration 플러그인) |
| **CI/CD** | GitHub Actions |
| **CDN/보안** | Cloudflare |
| **WordPress** | 공식 원본 파일 (무수정) |
| **프론트 호스팅** | Google Blogger (Blogspot) |

## 주요 기능

### ✅ Cloudflare 완벽 호환
- Cache-Control, ETag, Vary 헤더 완벽 구현
- `HTTP_CF_VISITOR`로 HTTPS 감지
- WebSocket over Cloudflare 프록시 지원
- `_headers` 파일로 충돌 없는 캐싱 전략

### ✅ SEO 최적화
- Open Graph, Twitter Card 메타태그
- JSON-LD 구조화 데이터
- XML Sitemap 자동 생성
- Permalink 구조 최적화 (`/%postname%/`)

### ✅ WebSocket 실시간
- `/api/websocket` 엔드포인트
- 배포 상태 실시간 스트리밍
- 30초 ping으로 Cloudflare 연결 유지
- 자동 재연결 로직

### ✅ GitHub Actions 자동화
- WordPress 공식 최신 버전 자동 fetch
- SQLite Database Integration 플러그인 자동 설치
- wp-config.php 자동 생성 (민감정보 커밋 없음)
- 주간 자동 업데이트 (core, plugin, theme)

### ✅ WordPress 100% 호환
- 원본 파일 무수정
- 플러그인, 테마 그대로 사용
- wp-admin 완전 지원
- WP-CLI 지원

## 설치 및 실행

### 1. 클론 및 의존성 설치

```bash
git clone https://github.com/your-org/wpspot.git
cd wpspot
npm install
```

### 2. 환경 변수 설정

```bash
cp .env.example .env.local
# .env.local 편집
```

필수 설정:
- `GITHUB_ADMIN_TOKEN`: GitHub PAT (repo, workflow 권한)
- `NEXT_PUBLIC_BASE_URL`: 플랫폼 URL (예: https://wpspot.io)

### 3. 개발 서버 실행

```bash
npm run dev
```

### 4. 프로덕션 빌드

```bash
npm run build
npm run start
```

## 관리자 설정

1. `/admin` 접속
2. "시스템 설정" 탭에서:
   - GitHub Admin Token 입력 (레포 자동 생성에 사용)
   - GitHub Organization 입력 (선택)
   - Platform URL 입력 (GitHub Actions 콜백)
   - Cloudflare 설정 (선택 - 캐시 퍼지용)

## 사용자 플로우

1. `/dashboard/new` 접속
2. Blogspot URL, Blog ID, Blogger API Key 입력
3. WordPress 관리자 계정 설정
4. 사이트 생성 버튼 클릭
5. GitHub Actions가 자동으로:
   - WordPress 공식 파일 다운로드
   - SQLite DB 초기화
   - wp-config.php 생성
   - Blogspot 브릿지 배포
6. 커스텀 도메인 추가 시 DNS 설정 안내 제공

## GitHub Actions 워크플로우

| 파일 | 트리거 | 역할 |
|------|--------|------|
| `wp-setup.yml` | push/manual | WordPress 초기 설치 |
| `wp-update.yml` | 매주 월요일 | WordPress 자동 업데이트 |
| `cf-purge.yml` | manual | Cloudflare 캐시 퍼지 |
| `blogspot-sync.yml` | 15분마다 | WordPress→Blogspot 동기화 |

## 보안

- `wp-config.php`: 자동 생성, 절대 커밋 안 됨
- SQLite DB: `.htaccess`로 보호, `.gitignore` 처리
- 모든 민감 정보: GitHub Secrets에만 저장
- Cloudflare: WAF + DDoS 자동 보호
- HSTS, CSP, X-Frame-Options 적용

## 디렉토리 구조

```
wpspot/
├── src/
│   ├── app/
│   │   ├── page.tsx              # 랜딩 페이지
│   │   ├── layout.tsx            # SEO 메타데이터
│   │   ├── dashboard/
│   │   │   ├── new/page.tsx      # 새 사이트 생성
│   │   │   └── sites/[id]/       # 사이트 상세
│   │   ├── admin/page.tsx        # 관리자 패널
│   │   └── api/
│   │       ├── hosting/          # 호스팅 CRUD
│   │       ├── domain/           # 도메인 관리
│   │       └── admin/            # 관리자 API
│   └── lib/
│       ├── db.ts                 # SQLite 플랫폼 DB
│       ├── github.ts             # GitHub API
│       ├── deploy.ts             # 배포 오케스트레이터
│       └── websocket.ts          # WebSocket 서버
├── custom-server.ts              # HTTP+WS 커스텀 서버
├── next.config.ts                # CF 최적화 설정
└── .env.example
```

## Cloudflare 설정 가이드

1. **DNS**: A/CNAME 레코드를 Proxied(🟠)로 설정
2. **SSL/TLS**: Full (strict) 모드 권장
3. **Page Rules**:
   - `*/wp-admin/*` → Cache Level: Bypass
   - `*/wp-login.php` → Cache Level: Bypass
   - `*` → Cache Level: Standard
4. **WebSocket**: Network > WebSockets 활성화 필수

---

Made with ❤️ by WPSpot
