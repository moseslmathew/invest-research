import React from "react";

export default function PrismWaitIcon({
  size = 64,
  duration = "2s",
  glow = true,
}: {
  size?: number;
  duration?: string;
  glow?: boolean;
}) {
  const durStyle = {
    "--dur": duration,
    "--pg": glow ? undefined : "none",
  } as React.CSSProperties;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ overflow: "visible", ...durStyle }}
    >
      <line
        x1="2"
        y1="40"
        x2="23.5"
        y2="30"
        stroke="#ffffff"
        strokeOpacity="0.13"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="14"
        stroke="#ff3b5c"
        strokeOpacity="0.18"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="20.4"
        stroke="#ff9f1c"
        strokeOpacity="0.18"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="26.8"
        stroke="#ffe14d"
        strokeOpacity="0.18"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="33.2"
        stroke="#4ade80"
        strokeOpacity="0.18"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="39.6"
        stroke="#38bdf8"
        strokeOpacity="0.18"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="46"
        stroke="#a78bfa"
        strokeOpacity="0.18"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <polygon
        points="32,13 15,47 49,47"
        fill="rgba(255,255,255,0.05)"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <polygon
        points="32,13 15,47 49,47"
        fill="#ffffff"
        style={{
          opacity: 0,
          animation: "pw-flash var(--dur, 2s) linear infinite",
        }}
      />
      <line
        x1="23.5"
        y1="30"
        x2="40.5"
        y2="30"
        pathLength={1}
        stroke="#ffffff"
        strokeOpacity="0.85"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-mid var(--dur, 2s) linear infinite",
        }}
      />
      <line
        x1="2"
        y1="40"
        x2="23.5"
        y2="30"
        pathLength={1}
        stroke="#ffffff"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-beam var(--dur, 2s) linear infinite",
          filter: "var(--pg, drop-shadow(0 0 2px rgba(255,255,255,0.55)))",
        }}
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="14"
        pathLength={1}
        stroke="#ff3b5c"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-ray var(--dur, 2s) linear infinite",
          filter: "var(--pg, drop-shadow(0 0 2px #ff3b5c))",
        }}
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="20.4"
        pathLength={1}
        stroke="#ff9f1c"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-ray var(--dur, 2s) linear infinite",
          animationDelay: "calc(var(--dur, 2s) * 0.015)",
          filter: "var(--pg, drop-shadow(0 0 2px #ff9f1c))",
        }}
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="26.8"
        pathLength={1}
        stroke="#ffe14d"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-ray var(--dur, 2s) linear infinite",
          animationDelay: "calc(var(--dur, 2s) * 0.03)",
          filter: "var(--pg, drop-shadow(0 0 2px #ffe14d))",
        }}
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="33.2"
        pathLength={1}
        stroke="#4ade80"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-ray var(--dur, 2s) linear infinite",
          animationDelay: "calc(var(--dur, 2s) * 0.045)",
          filter: "var(--pg, drop-shadow(0 0 2px #4ade80))",
        }}
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="39.6"
        pathLength={1}
        stroke="#38bdf8"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-ray var(--dur, 2s) linear infinite",
          animationDelay: "calc(var(--dur, 2s) * 0.06)",
          filter: "var(--pg, drop-shadow(0 0 2px #38bdf8))",
        }}
      />
      <line
        x1="40.5"
        y1="30"
        x2="62"
        y2="46"
        pathLength={1}
        stroke="#a78bfa"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="0.35 1"
        style={{
          strokeDashoffset: 0.35,
          animation: "pw-ray var(--dur, 2s) linear infinite",
          animationDelay: "calc(var(--dur, 2s) * 0.075)",
          filter: "var(--pg, drop-shadow(0 0 2px #a78bfa))",
        }}
      />
    </svg>
  );
}
