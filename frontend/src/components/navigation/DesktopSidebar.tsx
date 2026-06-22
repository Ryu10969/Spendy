import { NavLink } from "react-router-dom";
import { primaryNavigationItems } from "./navigationItems";
import styles from "./DesktopSidebar.module.css";

const routeSkeletonItems = [
  { label: "Project detail", to: "/p/demo-project" },
  { label: "Global expense", to: "/expenses/new" },
];

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

      <nav className={styles.secondaryBlock} aria-label="Route skeleton navigation">
        <p className={styles.secondaryTitle}>Route skeleton</p>
        {routeSkeletonItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              isActive
                ? `${styles.secondaryLink} ${styles.activeLink}`
                : styles.secondaryLink
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
