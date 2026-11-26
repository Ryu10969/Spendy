import { Link } from "react-router-dom";
import { useTheme } from "../../app/ThemeProvider";
import logo from "../../assets/brand/spendy-logo.png";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./AppHeader.module.css";

export function AppHeader() {
  const { theme, toggleTheme } = useTheme();
  return <header className={styles.header}>
    <ThemeToggle className={styles.themeToggle} theme={theme} onToggleTheme={toggleTheme} />
    <Link className={styles.brand} to="/" aria-label="Spendy ホーム">
      <img className={styles.logo} src={logo} width="2172" height="724" alt="Spendy" />
    </Link>
  </header>;
}
