import { Link, useLocation, useMatch } from "react-router-dom";
import styles from "./AppContextNavigation.module.css";

const pageLabels: Record<string, string> = {
  "/": "プロジェクト",
  "/projects/new": "新規プロジェクト",
  "/expenses/new": "支出の追加",
  "/analytics": "アナリティクス",
};

export function AppContextNavigation() {
  const { pathname } = useLocation();
  const projectMatch = useMatch("/p/:publicToken/*");
  const projectPath = projectMatch
    ? `/p/${encodeURIComponent(projectMatch.params.publicToken!)}`
    : null;
  const projectChild = projectMatch?.params["*"];
  const currentLabel = projectMatch
    ? projectChild === "edit"
      ? "プロジェクトの編集"
      : projectChild === "expenses/new"
        ? "支出の追加"
        : "プロジェクト詳細"
    : pageLabels[pathname.replace(/\/$/, "") || "/"];

  return (
    <div className={styles.context}>
      <div className={styles.inner}>

        {projectPath && !projectChild ? null : <nav className={styles.breadcrumb} aria-label="共通ナビゲーション パンくず">
          <ol>
            <li>
              {pathname === "/" ? (
                <span aria-current="page">プロジェクト</span>
              ) : (
                <Link to="/">プロジェクト</Link>
              )}
            </li>
            {projectPath && projectChild ? (
              <li>
                <span className={styles.separator} aria-hidden="true">/</span>
                <Link to={projectPath}>プロジェクト詳細</Link>
              </li>
            ) : null}
            {pathname !== "/" ? (
              <li>
                <span className={styles.separator} aria-hidden="true">/</span>
                <span aria-current="page">{currentLabel}</span>
              </li>
            ) : null}
          </ol>
        </nav>}

        {projectPath ? (
          <Link className={styles.backLink} to={projectChild ? projectPath : "/"}>
            <span aria-hidden="true">←</span>
            <span>{projectChild ? "プロジェクト詳細へ戻る" : "プロジェクト一覧へ戻る"}</span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
