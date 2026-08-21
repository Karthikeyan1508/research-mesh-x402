"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="relative flex items-center justify-center w-9 h-9 rounded-full border border-white/10 hover:border-white/25 transition-all duration-200 hover:scale-105 active:scale-95"
      aria-label="Toggle theme"
      id="theme-toggle"
    >
      <span className="text-base leading-none select-none">
        {isDark ? "☀️" : "🌙"}
      </span>
    </button>
  );
}
