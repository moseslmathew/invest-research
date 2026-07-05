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
  | "logout"
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
  | "search";

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
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  chevronRight: "M9 18l6-6-6-6",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
};

export function Icon({
  name,
  filled = false,
  className,
  ...rest
}: { name: IconName; filled?: boolean } & SVGProps<SVGSVGElement>) {
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
        <path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z" />
        <path d="M18 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" />
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

  if (name === "brandLogo") {
    // Lumina brand mark: "The 3D Prism of Insight" (Light Theme) — a faceted 
    // glass crystal pyramid refracting a dark indigo beam into a vibrant spectrum 
    // of insights (Cyan, Purple, and Pink) over a premium white/slate base tile.
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
          <linearGradient id="prismBg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#f1f5f9" />
          </linearGradient>
          <linearGradient id="facetLeft" x1="9.5" y1="29" x2="20" y2="8" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id="facetRight" x1="20" y1="8" x2="30.5" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="facetBottom" x1="9.5" y1="29" x2="30.5" y2="29" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="rayCyan" x1="20" y1="18" x2="38" y2="7" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0891b2" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rayPurple" x1="20" y1="21" x2="38" y2="20" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="rayPink" x1="20" y1="24" x2="38" y2="31" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#db2777" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#db2777" stopOpacity="0" />
          </linearGradient>
          <filter id="prismGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.6" />
          </filter>
        </defs>
        <rect width="40" height="40" rx="12" fill="url(#prismBg)" />
        <rect width="39" height="39" x="0.5" y="0.5" rx="11.5" stroke="#0f172a" strokeOpacity="0.06" />
        <path
          d="M20 18 L38 7 M20 21 L38 20 M20 24 L38 31"
          stroke="#818cf8"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.12"
          filter="url(#prismGlow)"
        />
        <path
          d="M22 18 C22 18 29 11 38 7"
          stroke="url(#rayCyan)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M23 21 C23 21 30 20.5 38 20"
          stroke="url(#rayPurple)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M22 24 C22 24 29 27.5 38 31"
          stroke="url(#rayPink)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M2 21 L15 21"
          stroke="#1e1b4b"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M15 21 L20 18 M15 21 L20 21 M15 21 L20 24"
          stroke="#1e1b4b"
          strokeWidth="1"
          opacity="0.25"
        />
        <path
          d="M9.5 29 L20 21 L30.5 29 Z"
          fill="url(#facetBottom)"
          stroke="#0f172a"
          strokeWidth="0.8"
          strokeOpacity="0.08"
        />
        <path
          d="M20 8 L20 21 L9.5 29 Z"
          fill="url(#facetLeft)"
          stroke="#0f172a"
          strokeWidth="0.8"
          strokeOpacity="0.12"
        />
        <path
          d="M20 8 L20 21 L30.5 29 Z"
          fill="url(#facetRight)"
          stroke="#0f172a"
          strokeWidth="0.8"
          strokeOpacity="0.12"
        />
        <path
          d="M20 8 L30.5 29 C31 30 30 30 29.5 30 L10.5 30 C10 30 9 30 9.5 29 Z"
          stroke="#0f172a"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeOpacity="0.18"
        />
        <path
          d="M20 8.5 L12 25"
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeOpacity="0.8"
        />
        <g transform="translate(15, 21)">
          <circle r="2.2" fill="#06b6d4" filter="url(#prismGlow)" opacity="0.8" />
          <circle r="1" fill="#ffffff" />
        </g>
        <circle cx="34" cy="14" r="0.7" fill="#0891b2" opacity="0.7" />
        <circle cx="36" cy="25" r="0.8" fill="#db2777" opacity="0.65" />
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
