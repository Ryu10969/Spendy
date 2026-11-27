import { Outlet, useLocation } from "react-router-dom";
import { AppHeader } from "../navigation/AppHeader";
import { AppSidebar } from "../navigation/AppSidebar";
import { AppContextNavigation } from "../navigation/AppContextNavigation";
import { ResponsiveNavigation } from "../navigation/ResponsiveNavigation";
import { useTheme } from "../../app/ThemeProvider";
import styles from "./AppShell.module.css";

export function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const path = useLocation().pathname.replace(/\/$/, "") || "/";
  const home = path === "/" || path === "/archives";
  const active = path === "/" ? "home" : path === "/archives" ? "archives" : path === "/analytics" ? "analytics" : null;
  const sidebarActive = path === "/projects/new" ? "create" : active === "archives" ? null : active;
  return (
    <div className={styles.shell} data-app-shell="" data-home-theme={home ? theme : undefined}>
      <a className={styles.skipLink} href="#main-content">
        本文へ移動
      </a>
      <AppHeader />
      <div className={styles.frame}>
        <AppSidebar theme={theme} onToggleTheme={toggleTheme} active={sidebarActive} />
        <main className={styles.content} id="main-content" tabIndex={-1}>
          {!home && path !== "/analytics" ? <AppContextNavigation /> : null}
          <Outlet />
        </main>
      </div>
      <ResponsiveNavigation active={active} theme={theme} />
    </div>
  );
}
