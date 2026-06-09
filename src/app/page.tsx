"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";

export default function HomePage() {
  const [isScrolled, setIsScrolled] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 40);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // WebSocket for live site count
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "wss://your-domain.com/api/websocket";
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.type === "stats") setLiveCount(data.siteCount);
      };
      ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", channel: "stats" }));
    } catch {}
    return () => wsRef.current?.close();
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans">
      {/* NAV */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${isScrolled ? "bg-[#0a0a0f]/95 backdrop-blur-md border-b border-white/10 shadow-lg" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3b82f6] to-[#8b5cf6] flex items-center justify-center text-sm font-bold">W</div>
            <span className="font-bold text-lg tracking-tight">WPSpot</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <a href="#features" className="hover:text-white transition-colors">기능</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">작동 방식</a>
            <a href="#pricing" className="hover:text-white transition-colors">요금</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-white/70 hover:text-white transition-colors">로그인</Link>
            <Link href="/dashboard/new" className="px-4 py-2 bg-[#3b82f6] hover:bg-[#2563eb] rounded-lg text-sm font-medium transition-colors">
              무료 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="pt-32 pb-20 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#3b82f6]/5 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#3b82f6]/8 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-[#93c5fd] text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-pulse" />
            100% 무료 · 엔터프라이즈 성능
          </div>
          
          <h1 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tighter mb-6">
            <span className="text-white">WordPress를 </span>
            <span className="bg-gradient-to-r from-[#3b82f6] to-[#a78bfa] bg-clip-text text-transparent">Blogspot에서</span>
            <br />
            <span className="text-white">완벽하게 실행</span>
          </h1>
          
          <p className="text-lg text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            GitHub + Blogspot + WordPress의 완벽한 결합.<br />
            SQLite DB, 자동 배포, Cloudflare 최적화, WebSocket 실시간 통신.<br />
            플러그인·테마 100% 호환, 비용 0원.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/dashboard/new" className="px-8 py-4 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl font-semibold text-base transition-all hover:shadow-[0_0_30px_rgba(59,130,246,0.4)] hover:-translate-y-0.5">
              지금 무료로 시작하기 →
            </Link>
            <Link href="#how-it-works" className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-medium text-sm transition-colors">
              작동 방식 보기
            </Link>
          </div>

          {liveCount > 0 && (
            <p className="mt-6 text-white/30 text-sm">
              현재 <span className="text-[#3b82f6] font-semibold">{liveCount.toLocaleString()}</span>개의 사이트가 운영 중
            </p>
          )}
        </div>
      </section>

      {/* STATS */}
      <section className="py-12 border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { v: "100%", l: "무료" },
            { v: "<50ms", l: "TTFB (Cloudflare)" },
            { v: "99.9%", l: "업타임" },
            { v: "∞", l: "플러그인·테마 호환" },
          ].map((s) => (
            <div key={s.l}>
              <div className="text-3xl font-extrabold text-white">{s.v}</div>
              <div className="text-sm text-white/40 mt-1">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold mb-4">엔터프라이즈급 인프라, 0원</h2>
            <p className="text-white/40 text-lg">모든 기술 스택이 당신의 WordPress를 위해 최적화됩니다</p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: "⚡",
                title: "Cloudflare 완벽 호환",
                desc: "캐싱 충돌 없는 헤더 설계. Cache-Control, ETag, Vary 완벽 구현. Cloudflare Workers와 WebSocket 실시간 통신.",
                tags: ["Cache-Control", "ETag", "Workers"],
              },
              {
                icon: "🔒",
                title: "엔터프라이즈 보안·SEO",
                desc: "HSTS, CSP, X-Frame-Options 자동 적용. XML Sitemap, Open Graph, JSON-LD 구조화 데이터 완전 지원.",
                tags: ["HSTS", "CSP", "Sitemap"],
              },
              {
                icon: "🔄",
                title: "WebSocket 실시간",
                desc: "배포 상태, 댓글, 알림 모두 WebSocket으로 실시간 전달. Cloudflare 프록시 환경에서도 완벽 작동.",
                tags: ["WS Protocol", "실시간 알림"],
              },
              {
                icon: "🗄️",
                title: "SQLite + GitHub Actions",
                desc: "호스팅 생성 시 GitHub Actions가 자동으로 SQLite DB 초기화. wp-config.php 자동 생성, WordPress 원본 파일 자동 fetch.",
                tags: ["SQLite", "GitHub Actions"],
              },
              {
                icon: "📦",
                title: "WordPress 100% 호환",
                desc: "wp-admin, wp-content, wp-includes 원본 파일 그대로 사용. 플러그인·테마 파일 일절 수정 없음. WordPress 생태계 완전 활용.",
                tags: ["wp-admin", "플러그인", "테마"],
              },
              {
                icon: "🌐",
                title: "커스텀 도메인",
                desc: "도메인 추가 시 Blogspot DNS 값 자동 안내. CNAME/A 레코드 설정 가이드. SSL 자동 발급.",
                tags: ["커스텀 도메인", "SSL", "DNS"],
              },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-2xl bg-white/[0.03] border border-white/8 hover:border-[#3b82f6]/30 transition-all hover:bg-white/[0.05] group">
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-bold text-lg mb-2">{f.title}</h3>
                <p className="text-white/40 text-sm leading-relaxed mb-4">{f.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {f.tags.map((t) => (
                    <span key={t} className="px-2 py-0.5 rounded-md bg-[#3b82f6]/10 text-[#93c5fd] text-xs">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 px-6 bg-white/[0.02]">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold mb-4">3단계로 시작</h2>
          </div>
          <div className="space-y-8">
            {[
              {
                n: "01",
                t: "Blogspot API 연결",
                d: "구글 계정의 Blogger API 키와 블로그 ID를 입력하세요. WPSpot이 자동으로 블로그스팟과 연결합니다.",
              },
              {
                n: "02",
                t: "자동 GitHub 레포 생성",
                d: "관리자 GitHub 토큰으로 전용 레포가 자동 생성됩니다. GitHub Actions가 WordPress 최신 원본 파일을 fetch하고 SQLite DB를 초기화합니다.",
              },
              {
                n: "03",
                t: "도메인 연결 & 운영",
                d: "커스텀 도메인을 입력하면 Blogspot DNS 설정값을 안내합니다. 설정 완료 후 WordPress 관리자 패널로 운영하세요.",
              },
            ].map((s) => (
              <div key={s.n} className="flex gap-6 items-start">
                <div className="w-14 h-14 shrink-0 rounded-2xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 flex items-center justify-center text-[#3b82f6] font-mono font-bold text-sm">
                  {s.n}
                </div>
                <div className="pt-1">
                  <h3 className="font-bold text-lg mb-1">{s.t}</h3>
                  <p className="text-white/40 leading-relaxed">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ARCHITECTURE */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-extrabold text-center mb-16">아키텍처</h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 font-mono text-sm">
            <pre className="text-white/60 leading-relaxed overflow-x-auto">{`
  사용자 브라우저
       │  HTTP/WebSocket
       ▼
  Cloudflare (CDN + WAF + DDoS 차단)
       │  프록시 + 캐싱
       ▼
  WPSpot 플랫폼 (Next.js + WebSocket Server)
       │                    │
       ▼                    ▼
  Blogger API          GitHub API
  (Blogspot 프론트)    (레포 생성/관리)
       │                    │
       ▼                    ▼
  블로그스팟 호스팅    GitHub Actions
  (실제 접속 위치)    ─────────────────────
                      1. WordPress 원본 fetch
                      2. SQLite DB 초기화
                      3. wp-config.php 생성
                      4. Cloudflare 캐시 퍼지
            `.trim()}</pre>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-4xl font-extrabold mb-4">지금 바로 시작하세요</h2>
          <p className="text-white/40 mb-8">신용카드 불필요. 영구 무료.</p>
          <Link href="/dashboard/new" className="inline-block px-10 py-4 bg-[#3b82f6] hover:bg-[#2563eb] rounded-xl font-semibold text-base transition-all hover:shadow-[0_0_40px_rgba(59,130,246,0.5)]">
            무료로 WordPress 사이트 만들기 →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/5 py-8 px-6 text-center text-white/20 text-sm">
        <p>WPSpot — WordPress × Blogspot 무료 호스팅 플랫폼</p>
      </footer>
    </div>
  );
}
