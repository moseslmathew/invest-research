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
  const rootRef = useRef<HTMLDivElement>(null);

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
      <section className="lp-hero">
        <div className="lp-hero-bg" aria-hidden>
          <span className="lp-aurora lp-aurora-1" />
          <span className="lp-aurora lp-aurora-2" />
          <span className="lp-aurora lp-aurora-3" />
          <span className="lp-grid" />
        </div>

        <nav className="lp-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", maxWidth: "1180px", margin: "0 auto", padding: "16px 28px" }}>
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
              Filter the noise.
              <br />
              <span className="lp-title-spectrum">Focus the signal.</span>
            </h1>
            <p className="lp-sub lp-fade-up" style={{ animationDelay: "0.3s" }}>
              Lumina turns live quotes, news and technicals for US and India
              markets into AI research briefs — built around the watchlist
              you already keep.
            </p>
            <div className="lp-cta-row lp-fade-up" style={{ animationDelay: "0.45s" }}>
              <Link href="/sign-in" className="lp-btn lp-btn-primary">
                Start researching
                <Icon name="chevronRight" width={16} height={16} />
              </Link>
              <span className="lp-cta-note">Free to explore · No card required</span>
            </div>
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
          <Link href="/sign-in" className="lp-btn lp-btn-primary">
            Open Lumina
            <Icon name="chevronRight" width={16} height={16} />
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <span>Lumina — investment research, distilled.</span>
        <span className="lp-footer-dim">Built with Next.js &amp; Neon</span>
      </footer>
    </div>
  );
}
