import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { revealHomeTheme } from "../pages/HomePage/homeThemeTransition";

export type Theme = "light" | "dark";
export const themeStorageKey = "spendingmate-theme";

export function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  // Explicit DEV preview URLs seed the shared preference once, on app startup.
  if (import.meta.env.DEV && window.location.pathname.replace(/\/$/, "") === "/analytics") {
    const query = new URLSearchParams(window.location.search);
    const previewTheme = query.get("theme");
    if (query.get("analyticsPreview") === "1" && (previewTheme === "light" || previewTheme === "dark")) return previewTheme;
  }
  try {
    return window.localStorage.getItem(themeStorageKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const switching = useRef(false);
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { window.localStorage.setItem(themeStorageKey, theme); } catch { /* Storage may be unavailable. */ }
    if (import.meta.env.DEV && window.location.pathname.replace(/\/$/, "") === "/analytics") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("analyticsPreview") === "1") {
        url.searchParams.set("theme", theme);
        window.history.replaceState(window.history.state, "", url);
      }
    }
  }, [theme]);

  async function toggleTheme() {
    if (switching.current) return;
    switching.current = true;
    try {
      await revealHomeTheme(() => flushSync(() => setTheme(current => current === "light" ? "dark" : "light")), document.documentElement);
    } finally {
      switching.current = false;
    }
  }
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
