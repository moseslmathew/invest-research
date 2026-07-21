import { useId } from "react";
import type { SVGProps } from "react";

export type IconName =
  | "bookmark"
  | "sparkles"
  | "funnel"
  | "trending"
  | "newspaper"
  | "bell"
  | "settings"
  | "crown"
  | "star"
  | "kebab"
  | "trash"
  | "arrowUp"
  | "arrowDown"
  | "bulb"
  | "chartArt"
  | "brandLogo"
  | "chevronRight"
  | "refresh"
  | "search"
  | "logout"
  | "grid"
  | "swot"
  | "calendar"
  | "microscope";

// Stroke-based line icons (Lucide-style), drawn with currentColor.
const PATHS: Record<string, string> = {
  bookmark: "M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  funnel: "M22 3H2l8 9.46V19l4 2v-8.54z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
  crown: "M2 18h20M3 7l4 4 5-7 5 7 4-4-2 11H5z",
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  trending: "M22 7l-8.5 8.5-5-5L2 17M16 7h6v6",
  newspaper:
    "M4 22h14a2 2 0 0 0 2-2V4a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v16a2 2 0 0 1-2-2V8M8 7h8M8 11h8M8 15h5",
  microscope:
    "M6 18h8M9 4v8M7 4h4M15 4l2 2-2 2M19 14a7 7 0 1 1-14 0",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  chevronRight: "M9 18l6-6-6-6",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

export function Icon({
  name,
  filled = false,
  className,
  ...rest
}: { name: IconName; filled?: boolean } & SVGProps<SVGSVGElement>) {
  const idSuffix = useId().replace(/:/g, "");
  const base = {
    viewBox: "0 0 24 24",
    width: 18,
    height: 18,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
    ...rest,
  };

  if (name === "sparkles") {
    return (
      <svg {...base}>
        <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
        <path d="M19 13.5L19.9 16.1L22.5 17L19.9 17.9L19 20.5L18.1 17.9L15.5 17L18.1 16.1L19 13.5Z" strokeWidth="1.5" />
      </svg>
    );
  }

  if (name === "star") {
    return (
      <svg {...base} fill={filled ? "currentColor" : "none"}>
        <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.3l6.5-.9z" />
      </svg>
    );
  }

  if (name === "kebab") {
    return (
      <svg {...base} fill="currentColor" stroke="none">
        <circle cx="12" cy="5" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="12" cy="19" r="1.7" />
      </svg>
    );
  }

  if (name === "swot") {
    return (
      <svg {...base}>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" strokeWidth="1.8" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" strokeWidth="1.8" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" strokeWidth="1.8" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" strokeWidth="1.8" />
        <circle cx="6.75" cy="6.75" r="1" fill="currentColor" stroke="none" />
        <circle cx="17.25" cy="6.75" r="1" fill="currentColor" stroke="none" />
        <circle cx="6.75" cy="17.25" r="1" fill="currentColor" stroke="none" />
        <circle cx="17.25" cy="17.25" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "calendar" || name === "crown") {
    return (
      <svg {...base}>
        <rect x="3" y="4" width="18" height="17" rx="3" strokeWidth="1.8" />
        <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
        <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
        <line x1="3" y1="9" x2="21" y2="9" strokeWidth="1.8" />
        <circle cx="8" cy="13" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
        <circle cx="8" cy="17" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  if (name === "grid") {
    // Quadrant matrix — the classic SWOT 2×2 (a square split by a cross).
    return (
      <svg {...base}>
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <line x1="12" y1="3.5" x2="12" y2="20.5" />
        <line x1="3.5" y1="12" x2="20.5" y2="12" />
      </svg>
    );
  }

  if (name === "brandLogo") {
    // Lumina brand mark: "the prism" — a beam of raw information (white light)
    // enters a glass prism and splits into a spectrum of insights. Dark tile so
    // the light actually glows; everything clipped to the rounded tile.
    const fan = [
      { d: "M23.1 15.9 L41 6.5 L41 11 L23.55 16.83 Z", c: "#f87171" },
      { d: "M23.55 16.83 L41 11 L41 15.5 L24 17.77 Z", c: "#fb923c" },
      { d: "M24 17.77 L41 15.5 L41 20 L24.45 18.7 Z", c: "#facc15" },
      { d: "M24.45 18.7 L41 20 L41 24.5 L24.9 19.63 Z", c: "#4ade80" },
      { d: "M24.9 19.63 L41 24.5 L41 29 L25.35 20.57 Z", c: "#38bdf8" },
      { d: "M25.35 20.57 L41 29 L41 33.5 L25.8 21.5 Z", c: "#a78bfa" },
    ];
    const glint =
      "M20 6.7 C20 8.6 20.7 9.3 22.6 9.3 C20.7 9.3 20 10 20 11.9 " +
      "C20 10 19.3 9.3 17.4 9.3 C19.3 9.3 20 8.6 20 6.7 Z";
    
    const tileId = `prTile-${idSuffix}`;
    const glassId = `prGlass-${idSuffix}`;
    const clipId = `prClip-${idSuffix}`;
    const blurId = `prBlur-${idSuffix}`;

    return (
      <svg
        viewBox="0 0 40 40"
        width={40}
        height={40}
        fill="none"
        aria-hidden
        className={className}
        {...rest}
      >
        <defs>
          <linearGradient id={tileId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#0b0d1a" />
            <stop offset="1" stopColor="#1a1e33" />
          </linearGradient>
          <linearGradient id={glassId} x1="14" y1="12" x2="27" y2="27" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.3" />
            <stop offset="0.5" stopColor="#c7d2fe" stopOpacity="0.1" />
            <stop offset="1" stopColor="#818cf8" stopOpacity="0.18" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect width="40" height="40" rx="11" />
          </clipPath>
          <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
        </defs>
        <rect width="40" height="40" rx="11" fill={`url(#${tileId})`} />
        <g clipPath={`url(#${clipId})`}>
          {/* soft glow under the spectrum */}
          <g filter={`url(#${blurId})`} opacity="0.6">
            {fan.map((w) => (
              <path key={`${w.c}-glow`} d={w.d} fill={w.c} />
            ))}
          </g>
          {/* crisp spectrum, gently breathing */}
          <g>
            {fan.map((w) => (
              <path key={w.c} d={w.d} fill={w.c} />
            ))}
            <animate
              attributeName="opacity"
              values="0.82;1;0.82"
              dur="3.6s"
              repeatCount="indefinite"
            />
          </g>
          {/* incoming beam of white light */}
          <path
            d="M1.5 22 L15.7 18.8"
            stroke="#ffffff"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.45"
            filter={`url(#${blurId})`}
          />
          <path d="M1.5 22 L15.7 18.8" stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" />
          {/* refraction spreading inside the glass */}
          <path d="M15.6 18.7 L23.1 15.9 L25.8 21.5 Z" fill="#ffffff" opacity="0.16" />
          {/* the prism glow */}
          <path
            d="M20 9.5 L28.5 27 L11.5 27 Z"
            stroke="#6366f1"
            strokeOpacity="0.55"
            strokeWidth="3.2"
            strokeLinejoin="round"
            filter={`url(#${blurId})`}
          />
          {/* the prism */}
          <path
            d="M20 9.5 L28.5 27 L11.5 27 Z"
            fill={`url(#${glassId})`}
            stroke="#dbe3ff"
            strokeOpacity="0.75"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          {/* apex glint */}
          <path d={glint} fill="#ffffff" opacity="0.6" filter={`url(#${blurId})`} />
          <path d={glint} fill="#ffffff" />
        </g>
        <rect width="39" height="39" x="0.5" y="0.5" rx="10.5" stroke="#ffffff" strokeOpacity="0.08" />
      </svg>
    );
  }

  if (name === "chartArt") {
    // Small decorative "growth chart" illustration for the page header.
    return (
      <svg
        {...base}
        viewBox="0 0 120 90"
        width={120}
        height={90}
        strokeWidth={0}
      >
        <rect x="14" y="52" width="16" height="30" rx="4" fill="#c7d2fe" />
        <rect x="38" y="40" width="16" height="42" rx="4" fill="#a5b4fc" />
        <rect x="62" y="28" width="16" height="54" rx="4" fill="#818cf8" />
        <rect x="86" y="16" width="16" height="66" rx="4" fill="#6366f1" />
        <path
          d="M18 46l24-10 24-10 26-14"
          fill="none"
          stroke="#f59e0b"
          strokeWidth={3}
          strokeLinecap="round"
        />
        <circle cx="92" cy="12" r="5" fill="#f59e0b" />
      </svg>
    );
  }

  return (
    <svg {...base}>
      <path d={PATHS[name]} />
    </svg>
  );
}
