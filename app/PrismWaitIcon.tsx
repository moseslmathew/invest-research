import React from "react";

export default function PrismWaitIcon({
  size = 64,
  duration = "2s",
}: {
  size?: number;
  duration?: string;
}) {
  const durStyle = {
    "--dur": duration,
  } as React.CSSProperties;

  return (
    <>
      {/* LIGHT THEME (for light backgrounds) */}
      <svg
        className="prism-wait prism-wait--light"
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
          stroke="#232c3d"
          strokeOpacity="0.18"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="40.5"
          y1="30"
          x2="62"
          y2="14"
          stroke="#e8274b"
          strokeOpacity="0.2"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="40.5"
          y1="30"
          x2="62"
          y2="20.4"
          stroke="#f28c0d"
          strokeOpacity="0.2"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="40.5"
          y1="30"
          x2="62"
          y2="26.8"
          stroke="#eec513"
          strokeOpacity="0.2"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="40.5"
          y1="30"
          x2="62"
          y2="33.2"
          stroke="#22b566"
          strokeOpacity="0.2"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="40.5"
          y1="30"
          x2="62"
          y2="39.6"
          stroke="#1e9be0"
          strokeOpacity="0.2"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <line
          x1="40.5"
          y1="30"
          x2="62"
          y2="46"
          stroke="#8b63ef"
          strokeOpacity="0.2"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <polygon
          points="32,13 15,47 49,47"
          fill="rgba(24,32,48,0.05)"
          stroke="rgba(35,44,61,0.75)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polygon className="pw-flash" points="32,13 15,47 49,47" fill="#232c3d" />
        <line
          className="pw-mid"
          x1="23.5"
          y1="30"
          x2="40.5"
          y2="30"
          pathLength="1"
          stroke="#232c3d"
          strokeOpacity="0.85"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
        />
        <line
          className="pw-beam"
          x1="2"
          y1="40"
          x2="23.5"
          y2="30"
          pathLength="1"
          stroke="#232c3d"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="14"
          pathLength="1"
          stroke="#e8274b"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="20.4"
          pathLength="1"
          stroke="#f28c0d"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ animationDelay: "calc(var(--dur, 2s) * 0.015)" }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="26.8"
          pathLength="1"
          stroke="#eec513"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ animationDelay: "calc(var(--dur, 2s) * 0.03)" }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="33.2"
          pathLength="1"
          stroke="#22b566"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ animationDelay: "calc(var(--dur, 2s) * 0.045)" }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="39.6"
          pathLength="1"
          stroke="#1e9be0"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ animationDelay: "calc(var(--dur, 2s) * 0.06)" }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="46"
          pathLength="1"
          stroke="#8b63ef"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ animationDelay: "calc(var(--dur, 2s) * 0.075)" }}
        />
      </svg>

      {/* DARK THEME (for dark backgrounds) */}
      <svg
        className="prism-wait prism-wait--dark"
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
        <polygon className="pw-flash" points="32,13 15,47 49,47" fill="#ffffff" />
        <line
          className="pw-mid"
          x1="23.5"
          y1="30"
          x2="40.5"
          y2="30"
          pathLength="1"
          stroke="#ffffff"
          strokeOpacity="0.85"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
        />
        <line
          className="pw-beam"
          x1="2"
          y1="40"
          x2="23.5"
          y2="30"
          pathLength="1"
          stroke="#ffffff"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ filter: "drop-shadow(0 0 2px rgba(255,255,255,0.55))" }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="14"
          pathLength="1"
          stroke="#ff3b5c"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{ filter: "drop-shadow(0 0 2px #ff3b5c)" }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="20.4"
          pathLength="1"
          stroke="#ff9f1c"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{
            animationDelay: "calc(var(--dur, 2s) * 0.015)",
            filter: "drop-shadow(0 0 2px #ff9f1c)",
          }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="26.8"
          pathLength="1"
          stroke="#ffe14d"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{
            animationDelay: "calc(var(--dur, 2s) * 0.03)",
            filter: "drop-shadow(0 0 2px #ffe14d)",
          }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="33.2"
          pathLength="1"
          stroke="#4ade80"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{
            animationDelay: "calc(var(--dur, 2s) * 0.045)",
            filter: "drop-shadow(0 0 2px #4ade80)",
          }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="39.6"
          pathLength="1"
          stroke="#38bdf8"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{
            animationDelay: "calc(var(--dur, 2s) * 0.06)",
            filter: "drop-shadow(0 0 2px #38bdf8)",
          }}
        />
        <line
          className="pw-ray"
          x1="40.5"
          y1="30"
          x2="62"
          y2="46"
          pathLength="1"
          stroke="#a78bfa"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeDasharray="0.35 1"
          style={{
            animationDelay: "calc(var(--dur, 2s) * 0.075)",
            filter: "drop-shadow(0 0 2px #a78bfa)",
          }}
        />
      </svg>
    </>
  );
}
