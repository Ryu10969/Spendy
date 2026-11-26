import type { Theme } from "../../app/ThemeProvider";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle({ theme, onToggleTheme, className = "" }: { theme: Theme; onToggleTheme: () => void; className?: string }) {
  return <button className={`${styles.themeControl} ${className}`.trim()} type="button"
    aria-label={theme === "light" ? "ダークモードに切り替える" : "ライトモードに切り替える"} onClick={onToggleTheme}>
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {theme === "light" ? <path d="M21 12.8A9 9 0 0 1 11.2 3 9 9 0 1 0 21 12.8Z" /> : <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
      </>}
    </svg>
  </button>;
}
