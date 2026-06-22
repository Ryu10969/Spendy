import { NavLink } from "react-router-dom";
import { mobileNavigationItems } from "./navigationItems";
import styles from "./MobileBottomNavigation.module.css";

export function MobileBottomNavigation() {
  return (
    <nav className={styles.navigation} aria-label="Mobile navigation">
      {mobileNavigationItems.map((item) => (
        <NavLink
          key={`${item.to}-${item.label}`}
          to={item.to}
          className={({ isActive }) => {
            const baseClassName = item.isPrimary ? styles.primaryLink : styles.link;
            return isActive ? `${baseClassName} ${styles.activeLink}` : baseClassName;
          }}
          aria-label={item.label}
        >
          <span className={styles.icon} aria-hidden="true">
            {item.isPrimary ? "+" : item.shortLabel?.slice(0, 1)}
          </span>
          <span className={styles.label}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
