import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { EmptyState } from "../../components/common/EmptyState";
import { ProjectCard } from "../../features/projects/components/ProjectCard";
import { ProjectDeleteDialog } from "../../features/projects/components/ProjectDeleteDialog";
import { useDeleteProjectMutation, useProjectPageQuery } from "../../features/projects/projectQueries";
import type { ProjectListItem } from "../../types/project";
import homeStyles from "../HomePage/HomePage.module.css";
import styles from "./ArchivesPage.module.css";

export function ArchivesPage() {
  const [page, setPage] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ProjectListItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const projectsQuery = useProjectPageQuery("ARCHIVED", "", page, 5);
  const deleteMutation = useDeleteProjectMutation();
  const { data, isPending, isError } = projectsQuery;
  const lastPage = Math.max(0, (data?.totalPages ?? 0) - 1);
  const correctingPage = Boolean(data && page > lastPage);

  useEffect(() => {
    if (data && !isPending && !isError && page > lastPage) setPage(lastPage);
  }, [data, isPending, isError, page, lastPage]);

  return <div className={homeStyles.page}>
    <header className={styles.header}>
      <h1 className={styles.title} id="archives-title" tabIndex={-1}>アーカイブ</h1>
      {!isPending && !isError && data ? <p className={homeStyles.notice}>アーカイブ済みプロジェクト 全{data.totalElements}件</p> : null}
    </header>
    {notice ? <p className={homeStyles.notice} role="status">{notice}</p> : null}
    {isError ? <EmptyState title="アーカイブを読み込めませんでした" description="通信状況を確認して、もう一度お試しください。"
      action={<button type="button" className={homeStyles.primaryAction} onClick={() => void projectsQuery.refetch()}>再試行</button>} />
      : isPending || correctingPage ? <EmptyState title="アーカイブを読み込んでいます" description="アーカイブ済みプロジェクトを取得しています。" />
      : !data?.totalElements ? <EmptyState title="アーカイブ済みプロジェクトはありません" description="アーカイブしたプロジェクトがここに表示されます。" />
      : <>
        <div className={homeStyles.projectGrid}>
          {data.items.map(project => <ProjectCard key={project.id} project={project} onDelete={project => { setNotice(null); setDeleteTarget(project); }} />)}
        </div>
        {data.totalPages > 1 ? <nav className={homeStyles.pagination} aria-label="アーカイブのページ">
          <button type="button" className={homeStyles.pageButton} disabled={page === 0} onClick={() => setPage(page - 1)}>前へ</button>
          <span aria-live="polite">{page + 1} / {data.totalPages} ページ</span>
          <button type="button" className={homeStyles.pageButton} disabled={page >= data.totalPages - 1} onClick={() => setPage(page + 1)}>次へ</button>
        </nav> : null}
      </>}
    {deleteTarget ? <ProjectDeleteDialog project={deleteTarget} focusFallbackId="archives-title" onClose={() => setDeleteTarget(null)}
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
      }} /> : null}
  </div>;
}
