import { Link } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";
import styles from "./AppSidebar.module.css";

const icons = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  analytics: "M4 20V13h4v7Zm6 0V8h4v12Zm6 0V3h4v17Z",
  projects: "M2 6V4h7l3 3h10v14H2Z",
  receipt: "M3 7h5l2-3h4l2 3h5v14H3Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M2 22v-3c0-6 20-6 20 0v3Z",
};

function Icon({ name }: { name: keyof typeof icons | "share" }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "share" ? <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.59 13.51 6.83 3.98m-.01-10.98-6.82 3.98" />
    </> : <path d={icons[name]} />}
  </svg>;
}

export function AppSidebar({ theme, onToggleTheme, active }: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  active: "home" | "analytics" | "create" | null;
}) {
  return <aside className={styles.sidebar} aria-label="共通サイドバー">
    <div className={styles.sidebarTop}>
      <ThemeToggle theme={theme} onToggleTheme={onToggleTheme} />
      <nav className={styles.navigation} aria-label="メインナビゲーション">
        <Link className={`${styles.item}${active === "home" ? ` ${styles.selected}` : ""}`} to="/" aria-current={active === "home" ? "page" : undefined}><Icon name="home" />ホーム</Link>
        <Link className={`${styles.item}${active === "analytics" ? ` ${styles.selected}` : ""}`} to="/analytics" aria-current={active === "analytics" ? "page" : undefined}><Icon name="analytics" />支出分析</Link>
        <Link className={`${styles.item}${active === "create" ? ` ${styles.selected}` : ""}`} to="/projects/new" aria-current={active === "create" ? "page" : undefined}><Icon name="projects" />プロジェクト作成</Link>
        <button className={styles.item} type="button" disabled><Icon name="receipt" />レシート読み取り<span className={styles.badge}>準備中</span></button>
        <button className={styles.item} type="button" disabled><Icon name="share" />共有リンクの作成<span className={styles.badge}>準備中</span></button>
        <button className={styles.item} type="button" disabled><Icon name="account" />アカウント<span className={styles.badge}>準備中</span></button>
      </nav>
    </div>
  </aside>;
}
