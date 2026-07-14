import React from "react";

export default function PrismWaitIcon({
  size = 64,
  duration = "1.5s",
}: {
  size?: number;
  duration?: string;
}) {
  const rotationStyle = {
    animation: `spin ${duration} linear infinite`,
    transformOrigin: "center",
  };

  return (
    <svg
      className="prism-wait"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "inline-block" }}
    >
      <defs>
        <linearGradient id="spectrumGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2d55" />
          <stop offset="16%" stopColor="#ff7a00" />
          <stop offset="33%" stopColor="#ffc300" />
          <stop offset="50%" stopColor="#7bc043" />
          <stop offset="67%" stopColor="#00b8d9" />
          <stop offset="84%" stopColor="#2f6bff" />
          <stop offset="100%" stopColor="#6f3cff" />
        </linearGradient>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="12"
        stroke="url(#spectrumGradient)"
        strokeWidth="3.2"
        strokeLinecap="round"
        style={rotationStyle}
      />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}
