import { Outlet } from "react-router-dom";
import { DesktopSidebar } from "../navigation/DesktopSidebar";
import { MobileBottomNavigation } from "../navigation/MobileBottomNavigation";
import styles from "./AppShell.module.css";

export function AppShell() {
  return (
    <div className={styles.shell}>
      <DesktopSidebar />
      <div className={styles.contentFrame}>
        <main className={styles.content} id="main-content">
          <Outlet />
        </main>
      </div>
      <MobileBottomNavigation />
    </div>
  );
}
