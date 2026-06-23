import { NavLink } from "react-router-dom";
import { primaryNavigationItems } from "./navigationItems";
import styles from "./DesktopSidebar.module.css";

export function DesktopSidebar() {
  return (
    <aside className={styles.sidebar} aria-label="Desktop navigation">
      <NavLink to="/" className={styles.brand} aria-label="SplitMate home">
        <span className={styles.brandMark}>S</span>
        <span className={styles.brandName}>SplitMate</span>
      </NavLink>

      <nav className={styles.navigation} aria-label="Primary navigation">
        {primaryNavigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive ? `${styles.link} ${styles.activeLink}` : styles.link
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
