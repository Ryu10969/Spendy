import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/common/EmptyState";
import { SearchInput } from "../../components/common/SearchInput";
import { ProjectCard } from "../../features/projects/components/ProjectCard";
import { homeProjects } from "../../mocks/fixtures/projects";
import styles from "./HomePage.module.css";

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(true);
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

  const filteredProjects = useMemo(() => {
    if (!normalizedQuery) {
      return homeProjects;
    }

    return homeProjects.filter((project) =>
      project.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const activeProjects = filteredProjects.filter((project) => project.status === "ACTIVE");
  const archivedEventProjects = filteredProjects.filter(
    (project) => project.status === "ARCHIVED" && project.type === "EVENT",
  );
  const hasSearchResults = activeProjects.length > 0 || archivedEventProjects.length > 0;
  const hasProjects = homeProjects.length > 0;
  const activeProjectCount = homeProjects.filter((project) => project.status === "ACTIVE").length;
  const isSearchActive = normalizedQuery.length > 0;
  const archivedPanelId = "archived-projects-panel";

  useEffect(() => {
    if (isSearchActive && archivedEventProjects.length > 0) {
      setIsArchivedSectionExpanded(true);
    }
  }, [archivedEventProjects.length, isSearchActive]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>プロジェクト</p>
          <h1 className={styles.title}>プロジェクト</h1>
          <p className={styles.subtitle}>{activeProjectCount}件のアクティブなプロジェクト</p>
        </div>
        <Link className={styles.primaryAction} to="/projects/new" aria-label="新規プロジェクトを作成">
          <span aria-hidden="true">＋</span>
          <span className={styles.primaryActionText}>新規プロジェクト</span>
        </Link>
      </header>

      <SearchInput
        id="project-search"
        label="プロジェクト検索"
        value={searchQuery}
        placeholder="プロジェクトを検索..."
        onChange={setSearchQuery}
      />

      {!hasProjects ? (
        <EmptyState
          title="まだプロジェクトがありません"
          description="共有費用を管理する最初のプロジェクトを作成すると、ここに一覧が表示されます。"
          action={
            <Link className={styles.emptyStateAction} to="/projects/new">
              新規プロジェクトを作成
            </Link>
          }
        />
      ) : !hasSearchResults && normalizedQuery ? (
        <EmptyState
          title="該当するプロジェクトがありません"
          description="プロジェクト名の一部で検索できます。条件を変えるか、検索をクリアしてください。"
        />
      ) : (
        <>
          {activeProjects.length > 0 ? (
            <section className={styles.section} aria-labelledby="active-projects-title">
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle} id="active-projects-title">
                    アクティブなプロジェクト
                  </h2>
                  <p className={styles.sectionDescription}>
                    継続プロジェクトとイベントプロジェクトをまとめて確認できます。
                  </p>
                </div>
              </div>
              <div className={styles.projectGrid}>
                {activeProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
                {!normalizedQuery ? (
                  <Link className={styles.createProjectCard} to="/projects/new">
                    <span className={styles.createIcon} aria-hidden="true">
                      ＋
                    </span>
                    <span>新規プロジェクトを作成</span>
                  </Link>
                ) : null}
              </div>
            </section>
          ) : null}

          {archivedEventProjects.length > 0 ? (
            <section className={styles.section} aria-labelledby="archived-projects-title">
              <div className={styles.archivedSectionHeader}>
                <h2 className={styles.archivedHeading} id="archived-projects-title">
                  <button
                    className={styles.archivedToggle}
                    type="button"
                    aria-expanded={isArchivedSectionExpanded}
                    aria-controls={archivedPanelId}
                    onClick={() =>
                      setIsArchivedSectionExpanded((current) => (isSearchActive ? true : !current))
                    }
                  >
                    <span className={styles.archivedTitleGroup}>
                      <span className={styles.sectionTitle}>
                        アーカイブ済みイベント
                      </span>
                      <span className={styles.archivedCount}>{archivedEventProjects.length}件</span>
                    </span>
                    <span className={styles.archivedToggleState}>
                      <span>{isArchivedSectionExpanded ? "展開中" : "折りたたみ中"}</span>
                      <span className={styles.archivedToggleIcon} aria-hidden="true">
                        {isArchivedSectionExpanded ? "⌃" : "⌄"}
                      </span>
                    </span>
                  </button>
                </h2>
                <p className={styles.sectionDescription}>
                  完了したイベントプロジェクトは閲覧のみとして表示します。
                  {isSearchActive ? " 検索中は一致したアーカイブ済みプロジェクトを表示します。" : ""}
                </p>
              </div>
              <div
                className={styles.archivedGrid}
                id={archivedPanelId}
                hidden={!isArchivedSectionExpanded}
              >
                {archivedEventProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
              {!isArchivedSectionExpanded ? (
                <p className={styles.collapsedArchivedSummary}>
                  アーカイブ済みイベント {archivedEventProjects.length}件を折りたたんでいます。
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
