"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Icon } from "./Icon";

const FEATURES: {
  icon: "bookmark" | "sparkles" | "trending" | "newspaper";
  color: string;
  title: string;
  body: string;
}[] = [
  {
    icon: "bookmark",
    color: "#6366f1",
    title: "Smart watchlists",
    body: "Live quotes for US and India markets, saved to your own list.",
  },
  {
    icon: "sparkles",
    color: "#a78bfa",
    title: "AI research briefs",
    body: "Fundamentals, moats, risks, and valuation — distilled fast.",
  },
  {
    icon: "trending",
    color: "#38bdf8",
    title: "Technical analysis",
    body: "Trend, momentum, and key levels, read for you.",
  },
  {
    icon: "newspaper",
    color: "#4ade80",
    title: "News & insider signals",
    body: "Headlines and insider activity, surfaced automatically.",
  },
];

export default function Landing() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Gentle pointer parallax on the prism scene.
  function handleMove(e: React.MouseEvent<HTMLElement>) {
    const el = sceneRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }

  // Reveal-on-scroll for below-the-fold sections.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll(".lp-reveal");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("lp-reveal--in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp" ref={rootRef}>
      {/* ======================= HERO ======================= */}
      <section className="lp-hero" onMouseMove={handleMove}>
        <div className="lp-hero-bg" aria-hidden>
          <span className="lp-aurora lp-aurora-1" />
          <span className="lp-aurora lp-aurora-2" />
          <span className="lp-aurora lp-aurora-3" />
          <span className="lp-grid" />
        </div>

        <nav className="lp-nav">
          <img
            src="/assets/lumina-lockup-horizontal-light.svg"
            alt="Lumina"
            className="lp-nav-logo"
          />
        </nav>

        <div className="lp-hero-inner">
          <div className="lp-hero-copy">
            <p className="lp-badge lp-fade-up" style={{ animationDelay: "0.05s" }}>
              <span className="lp-badge-dot" />
              AI research for US &amp; India equities
            </p>
            <h1 className="lp-title lp-fade-up" style={{ animationDelay: "0.15s" }}>
              Refract the noise.
              <br />
              <span className="lp-title-spectrum">See the signal.</span>
            </h1>
            <p className="lp-sub lp-fade-up" style={{ animationDelay: "0.3s" }}>
              Lumina turns live quotes, news and technicals for US and India
              markets into AI research briefs — built around the watchlist
              you already keep.
            </p>
            <div className="lp-cta-row lp-fade-up" style={{ animationDelay: "0.45s" }}>
              <Link href="/dashboard" className="lp-btn lp-btn-primary">
                Start researching
                <Icon name="chevronRight" width={16} height={16} />
              </Link>
              <span className="lp-cta-note">Free to explore · No card required</span>
            </div>
          </div>

          <div className="lp-scene lp-fade-in" ref={sceneRef} aria-hidden>
            <PrismScene />
          </div>
        </div>
      </section>

      <div className="lp-spectrum-bar" aria-hidden />

      {/* ===================== FEATURES ===================== */}
      <section className="lp-features" id="features">
        <div className="lp-features-head lp-reveal">
          <p className="lp-eyebrow lp-eyebrow-dark">What you get</p>
          <h2 className="lp-h2">
            Everything you need to research a stock,
            <br />
            nothing you have to hunt for.
          </h2>
        </div>
        <div className="lp-feature-grid">
          {FEATURES.map((f, i) => (
            <article
              className="lp-card lp-reveal"
              key={f.title}
              style={{ transitionDelay: `${i * 90}ms`, ["--card-accent" as string]: f.color }}
            >
              <span className="lp-card-icon">
                <Icon name={f.icon} width={20} height={20} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>

        <div className="lp-final lp-reveal">
          <h2 className="lp-h2">Ready to look closer?</h2>
          <p>Your watchlist is the prism. Point it at the market.</p>
          <Link href="/dashboard" className="lp-btn lp-btn-primary">
            Open Lumina
            <Icon name="chevronRight" width={16} height={16} />
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <span>Lumina — investment research, refracted.</span>
        <span className="lp-footer-dim">Built with Next.js &amp; Neon</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero illustration: a bold glass prism on a light background. A      */
/* beam marches in, flowing spectrum rays stream out with traveling    */
/* light particles, and sparkles twinkle around the apex.              */
/* ------------------------------------------------------------------ */

// Prism geometry.
const APEX = { x: 300, y: 88 };
const BASE_L = { x: 208, y: 332 };
const BASE_R = { x: 392, y: 332 };
const ENTRY = { x: 253, y: 213 }; // beam hits the left face
const EXIT = { x: 344, y: 206 }; // spectrum leaves the right face
const RAY_END_X = 650; // right edge the spectrum rays reach

// Spectrum rays: color + the y position each ray reaches at the right edge.
const SPECTRUM = [
  { c: "#f04b55", y: 82 },
  { c: "#fb923c", y: 141.5 },
  { c: "#facc15", y: 200.5 },
  { c: "#34c26b", y: 259.5 },
  { c: "#2fb7e8", y: 318.5 },
  { c: "#a78bfa", y: 377 },
];

const SPARKLES = [
  { x: 352, y: 44, r: 15, c: "#fbbf24", delay: "0s" },
  { x: 205, y: 122, r: 8, c: "#a78bfa", delay: "1.1s" },
  { x: 418, y: 84, r: 6, c: "#f472b6", delay: "2.2s" },
];

// Four-point sparkle path centered on (x, y).
function sparklePath(x: number, y: number, r: number) {
  const k = r * 0.22;
  return (
    `M ${x} ${y - r} C ${x} ${y - k} ${x + k} ${y} ${x + r} ${y} ` +
    `C ${x + k} ${y} ${x} ${y + k} ${x} ${y + r} ` +
    `C ${x} ${y + k} ${x - k} ${y} ${x - r} ${y} ` +
    `C ${x - k} ${y} ${x} ${y - k} ${x} ${y - r} Z`
  );
}

function PrismScene() {
  const triangle = `${APEX.x},${APEX.y} ${BASE_L.x},${BASE_L.y} ${BASE_R.x},${BASE_R.y}`;

  return (
    <svg
      className="lp-prism-svg"
      viewBox="0 0 660 460"
      fill="none"
      style={{ overflow: "visible" }}
    >
      <defs>
        <radialGradient id="lpGlass" cx="0.5" cy="0.62" r="0.75">
          <stop offset="0" stopColor="#e9e4fb" />
          <stop offset="0.55" stopColor="#ddd6f3" />
          <stop offset="1" stopColor="#cfc7ec" />
        </radialGradient>
        <radialGradient id="lpHalo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#eef0ff" stopOpacity="0.9" />
          <stop offset="0.6" stopColor="#e4e6fb" stopOpacity="0.55" />
          <stop offset="1" stopColor="#e4e6fb" stopOpacity="0" />
        </radialGradient>
        <filter id="lpSoft" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* soft glow behind the whole scene */}
      <ellipse className="lp-halo" cx="330" cy="225" rx="290" ry="200" fill="url(#lpHalo)" />

      {/* ambient (static, blurred) light paths */}
      <g filter="url(#lpSoft)">
        {SPECTRUM.map((s) => (
          <path
            key={`amb-${s.c}`}
            d={`M ${EXIT.x} ${EXIT.y} L ${RAY_END_X} ${s.y}`}
            stroke={s.c}
            strokeOpacity="0.22"
            strokeWidth="8"
            strokeLinecap="round"
          />
        ))}
      </g>

      {/* flowing spectrum rays */}
      {SPECTRUM.map((s, i) => (
        <path
          key={`ray-${s.c}`}
          className="lp-flow"
          d={`M ${EXIT.x} ${EXIT.y} L ${RAY_END_X} ${s.y}`}
          pathLength={1}
          stroke={s.c}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeDasharray="0.22 0.28"
          style={{ animationDelay: `${-i * 0.35}s` }}
        />
      ))}

      {/* photons riding the rays */}
      {SPECTRUM.map((s, i) => (
        <circle key={`dot-${s.c}`} r="5" fill={s.c} filter="url(#lpSoft)">
          <animateMotion
            dur={`${2.6 + i * 0.25}s`}
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
            path={`M ${EXIT.x} ${EXIT.y} L ${RAY_END_X} ${s.y}`}
          />
          <animate
            attributeName="opacity"
            values="0;1;1;0"
            keyTimes="0;0.1;0.8;1"
            dur={`${2.6 + i * 0.25}s`}
            begin={`${i * 0.4}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}

      {/* dashed beam marching into the prism */}
      <line
        className="lp-dash"
        x1="52"
        y1="308"
        x2={ENTRY.x}
        y2={ENTRY.y}
        stroke="#181c26"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="18 16"
      />

      {/* refraction inside the glass */}
      <path
        d={`M ${ENTRY.x} ${ENTRY.y} L ${EXIT.x} ${EXIT.y} L ${EXIT.x - 14} ${EXIT.y + 26} Z`}
        fill="#ffffff"
        opacity="0.5"
        filter="url(#lpSoft)"
      />

      {/* the prism */}
      <polygon
        points={triangle}
        fill="url(#lpGlass)"
        stroke="#181c26"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      {/* inner sheen */}
      <circle cx="298" cy="238" r="34" fill="#ffffff" opacity="0.55" filter="url(#lpSoft)" />

      {/* sparkles */}
      {SPARKLES.map((s) => (
        <path
          key={`${s.x}-${s.y}`}
          className="lp-spark"
          d={sparklePath(s.x, s.y, s.r)}
          fill={s.c}
          style={{ animationDelay: s.delay }}
        />
      ))}
    </svg>
  );
}
