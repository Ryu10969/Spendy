import { focusHomeProjectSearch } from "../../components/navigation/ResponsiveNavigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { EmptyState } from "../../components/common/EmptyState";
import { SearchInput } from "../../components/common/SearchInput";
import { ProjectCard } from "../../features/projects/components/ProjectCard";
import { ProjectDeleteDialog } from "../../features/projects/components/ProjectDeleteDialog";
import { useDeleteProjectMutation, useProjectPageQuery } from "../../features/projects/projectQueries";
import { ApiError } from "../../api/client";
import type { ProjectListItem } from "../../types/project";
import { HomeMonthlyOverview } from "./monthlyOverview/HomeMonthlyOverview";
import styles from "./HomePage.module.css";

const smartphoneMediaQuery = "(max-width: 767px)";

function SectionIcon({ event = false }: { event?: boolean }) {
  return <span className={styles.sectionIcon} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={event ? "M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4" : "M3 10 12 3l9 7v11h-6v-7H9v7H3Z"} />
    </svg>
  </span>;
}

function subscribeToSmartphone(onChange: () => void) {
  const media = window.matchMedia(smartphoneMediaQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function isSmartphoneViewport() {
  return window.matchMedia(smartphoneMediaQuery).matches;
}

export function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  useEffect(() => { if (window.location.hash === "#home-search-panel") focusHomeProjectSearch(); },[]);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const deleteMutation = useDeleteProjectMutation();
  const isSmartphone = useSyncExternalStore(subscribeToSmartphone, isSmartphoneViewport, () => false);
  const pageSize = isSmartphone ? 5 : 10;
  const [pages, setPages] = useState(() => ({ size: pageSize, active: 0, search: 0 }));
  const activePage = pages.size === pageSize ? pages.active : 0;
  const searchPage = pages.size === pageSize ? pages.search : 0;
  const [isArchivedSectionExpanded, setIsArchivedSectionExpanded] = useState(true);
  const normalizedQuery = searchQuery.trim();
  const isSearchActive = normalizedQuery.length > 0;
  const showArchivePreview = !isSmartphone && !isSearchActive;
  const activeQuery = useProjectPageQuery("ACTIVE", "", activePage, pageSize, !isSearchActive);
  const archivedQuery = useProjectPageQuery("ARCHIVED", "", 0, 5, showArchivePreview);
  const searchResultsQuery = useProjectPageQuery(undefined, normalizedQuery, searchPage, pageSize, isSearchActive);
  const projectsQuery = isSearchActive ? searchResultsQuery : activeQuery;
  const projects = isSearchActive
    ? searchResultsQuery.data?.items ?? []
    : [...(activeQuery.data?.items ?? []), ...(showArchivePreview ? archivedQuery.data?.items ?? [] : [])];
  const activeProjects = projects.filter((project) => project.status === "ACTIVE");
  const activeSections = [
    { type: "CONTINUOUS", title: "継続プロジェクト" },
    { type: "EVENT", title: "イベントプロジェクト" },
  ] as const;
  const archivedEventProjects = projects.filter(
    (project) => project.status === "ARCHIVED" && project.type === "EVENT",
  );
  const hasSearchResults = activeProjects.length > 0 || archivedEventProjects.length > 0;
  const hasProjects = (activeQuery.data?.totalElements ?? 0) + (showArchivePreview ? archivedQuery.data?.totalElements ?? 0 : 0) > 0;
  const isPending = projectsQuery.isPending || (showArchivePreview && archivedQuery.isPending);
  const isError = projectsQuery.isError || (showArchivePreview && archivedQuery.isError);
  const page = isSearchActive ? searchPage : activePage;
  const totalPages = projectsQuery.data?.totalPages ?? 0;
  const archivedPanelId = "archived-projects-panel";

  function openDelete(project: ProjectListItem) {
    setNotice(null);
    setDeleteTarget(project);
  }

  function setActivePage(page: number) {
    setPages((current) => ({ size: pageSize, active: page,
      search: current.size === pageSize ? current.search : 0 }));
  }

  function setSearchPage(page: number) {
    setPages((current) => ({ size: pageSize, search: page,
      active: current.size === pageSize ? current.active : 0 }));
  }

  useEffect(() => {
    setPages((current) => current.size === pageSize
      ? current : { size: pageSize, active: 0, search: 0 });
  }, [pageSize]);

  useEffect(() => {
    if (activeQuery.data && activePage >= activeQuery.data.totalPages && activePage > 0) {
      setActivePage(Math.max(0, activeQuery.data.totalPages - 1));
    }
  }, [activePage, activeQuery.data]);

  useEffect(() => {
    if (searchResultsQuery.data && searchPage >= searchResultsQuery.data.totalPages && searchPage > 0) {
      setSearchPage(Math.max(0, searchResultsQuery.data.totalPages - 1));
    }
  }, [searchPage, searchResultsQuery.data]);

  useEffect(() => {
    if (isSearchActive && archivedEventProjects.length > 0) {
      setIsArchivedSectionExpanded(true);
    }
  }, [archivedEventProjects.length, isSearchActive]);

  const pagination = totalPages > 1 ? (
    <nav className={styles.pagination} aria-label={isSearchActive ? "検索結果のページ" : "利用中プロジェクトのページ"}>
      <button type="button" className={styles.pageButton} disabled={page === 0}
        onClick={() => isSearchActive ? setSearchPage(page - 1) : setActivePage(page - 1)}>
        前へ
      </button>
      <span aria-live="polite">{page + 1} / {totalPages} ページ</span>
      <button type="button" className={styles.pageButton} disabled={page >= totalPages - 1}
        onClick={() => isSearchActive ? setSearchPage(page + 1) : setActivePage(page + 1)}>
        次へ
      </button>
    </nav>
  ) : null;

  return (
    <div className={styles.page} data-home-page="">
      <header className={styles.header}>
        <h1 className={styles.title}>プロジェクト</h1>
      </header>
      <section className={`${styles.monthlyOverview}${(import.meta.env.DEV || globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__) && isSmartphone ? ` ${styles.mobileOverviewContainer}` : ""}`} aria-labelledby="monthly-overview-title">
        <HomeMonthlyOverview smartphone={isSmartphone} />
      </section>
      <div id="home-search-panel" className={styles.searchPanel}>
        <SearchInput
          id="project-search"
          label="プロジェクト検索"
          value={searchQuery}
          placeholder="プロジェクト名で検索"
          onChange={(value) => {
            setSearchQuery(value);
            setSearchPage(0);
          }}
        />
      </div>
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}

      {isPending ? (
        <EmptyState title="プロジェクトを読み込んでいます" description="プロジェクト一覧を取得しています。" />
      ) : isError ? (
        <EmptyState
          title="プロジェクトを読み込めませんでした"
          description="通信状況を確認して、もう一度お試しください。"
          action={<button type="button" className={styles.primaryAction} onClick={() => {
            void projectsQuery.refetch();
            if (showArchivePreview) void archivedQuery.refetch();
          }}>再試行</button>}
        />
      ) : !isSearchActive && !hasProjects ? (
        <EmptyState
          title={isSmartphone ? "利用中のプロジェクトはありません" : "まだプロジェクトがありません"}
          description={isSmartphone ? "新しいプロジェクトは＋から作成できます。アーカイブ済みプロジェクトは「アーカイブ」から確認できます。" : "共有費用を管理する最初のプロジェクトを作成すると、ここに一覧が表示されます。"}
        />
      ) : !hasSearchResults && isSearchActive ? (
        <EmptyState
          title="該当するプロジェクトがありません"
          description="プロジェクト名の一部で検索できます。条件を変えるか、検索をクリアしてください。"
        />
      ) : (
        <>
          {activeSections.map(({ type, title }) => {
            const items = activeProjects.filter((project) => project.type === type);
            return items.length > 0 ? (
              <section key={type} className={styles.section} aria-labelledby={`${type}-projects-title`}>
                <div className={styles.sectionHeader}>
                  <SectionIcon event={type === "EVENT"} />
                  <h2 className={styles.sectionTitle} id={`${type}-projects-title`}>{title}</h2>
                  <span className={styles.sectionCount}>{items.length}件</span>
                </div>
                <div className={styles.projectGrid}>
                  {items.map((project) => (
                    <ProjectCard key={project.id} project={project} onDelete={openDelete} />
                  ))}
                </div>
              </section>
            ) : null;
          })}

          {!isSearchActive ? pagination : null}

          {isSmartphone && isSearchActive && archivedEventProjects.length > 0 ? (
            <div className={styles.projectGrid}>
              {archivedEventProjects.map(project => <ProjectCard key={project.id} project={project} onDelete={openDelete} />)}
            </div>
          ) : !isSmartphone && archivedEventProjects.length > 0 ? (
            <section className={styles.section} aria-labelledby="archived-projects-title">
              <div className={styles.archivedSectionHeader}>
                <h2 className={styles.archivedHeading} id="archived-projects-title">
                  <button
                    className={styles.archivedToggle}
                    type="button"
                    aria-expanded={isArchivedSectionExpanded}
                    aria-controls={archivedPanelId}
                    onClick={() => setIsArchivedSectionExpanded((current) => !current)}
                  >
                    <SectionIcon event />
                    <span className={styles.archivedTitleGroup}>
                      <span className={styles.sectionTitle}>
                        アーカイブ済みイベント
                      </span>
                      <span className={styles.archivedCount}>
                        {isSearchActive
                          ? `${archivedEventProjects.length}件`
                          : `最新${archivedEventProjects.length}件（全${archivedQuery.data?.totalElements ?? 0}件）`}
                      </span>
                    </span>
                    <span className={styles.archivedToggleIcon} aria-hidden="true">
                      {isArchivedSectionExpanded ? "⌄" : "›"}
                    </span>
                  </button>
                </h2>
              </div>
              <div
                className={`${styles.projectGrid} ${styles.archivedGrid}`}
                id={archivedPanelId}
                hidden={!isArchivedSectionExpanded}
              >
                {archivedEventProjects.map((project) => (
                  <ProjectCard key={project.id} project={project} onDelete={openDelete} />
                ))}
              </div>
            </section>
          ) : null}

          {isSearchActive ? pagination : null}
        </>
      )}
      {deleteTarget ? (
        <ProjectDeleteDialog project={deleteTarget} onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await deleteMutation.mutateAsync(deleteTarget);
            } catch (error) {
              if (error instanceof ApiError && error.code === "PROJECT_NOT_FOUND") {
                setNotice("このプロジェクトはすでに削除されています。一覧を更新しました。");
                return;
              }
              throw error;
            }
          }} />
      ) : null}
    </div>
  );
}
