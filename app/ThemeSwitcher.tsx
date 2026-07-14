"use client";

import React, { useEffect, useState } from "react";

type Theme = "default" | "white" | "midnight";

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("default");

  useEffect(() => {
    // Read from localStorage on mount
    const saved = localStorage.getItem("lumina-theme") as Theme;
    if (saved === "white" || saved === "midnight" || saved === "default") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem("lumina-theme", newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  return (
    <div className="theme-pill">
      <button
        onClick={() => changeTheme("default")}
        className={`theme-pill-btn ${theme === "default" ? "active" : ""}`}
        title="Default Theme"
      >
        <span>Default</span>
      </button>
      <button
        onClick={() => changeTheme("white")}
        className={`theme-pill-btn ${theme === "white" ? "active" : ""}`}
        title="Pure White Theme"
      >
        <span>White</span>
      </button>
      <button
        onClick={() => changeTheme("midnight")}
        className={`theme-pill-btn ${theme === "midnight" ? "active" : ""}`}
        title="Midnight Black Theme"
      >
        <span>Midnight</span>
      </button>
    </div>
  );
}
