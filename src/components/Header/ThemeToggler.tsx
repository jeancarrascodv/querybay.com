"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

const ThemeToggler = () => {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      type="button"
      className="qb-icon-button qb-theme-toggle"
      aria-label="Toggle color theme"
      title="Toggle color theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="qb-moon" size={18} />
      <Sun className="qb-sun" size={18} />
    </button>
  );
};

export default ThemeToggler;
