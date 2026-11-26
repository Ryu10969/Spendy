import { useEffect, useId, useRef, useState } from "react";
import { useQuickAddProjectPageQuery } from "../../features/projects/quickAddProjectQueries";
import styles from "./ResponsiveNavigation.module.css";

export function QuickAddProjectChoices({ onSelect }: { onSelect: (token: string) => void }) {
  const id = useId();
  const [filter, setFilter] = useState({ search: "", page: 0 });
  const query = useQuickAddProjectPageQuery(filter.search.trim(), filter.page);
  const lastPage = Math.max(0, (query.data?.totalPages ?? 0) - 1);
  const correctingPage = query.isSuccess && !query.isFetching && filter.page > lastPage;
  const loading = query.isPending || query.isFetching || correctingPage;
  const resultsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (correctingPage) setFilter(current => current === filter ? { ...current, page: lastPage } : current);
  }, [correctingPage, lastPage, filter]);
  useEffect(() => { if (resultsRef.current) resultsRef.current.scrollTop = 0; }, [filter]);
  const projects = query.data?.items.filter(project => project.status === "ACTIVE").slice(0, 5) ?? [];
  const ready = !loading && !query.isError;

  return <div className={styles.picker}>
    <div className={styles.pickerHeader}>
      <h2 className={styles.pickerTitle}>プロジェクトを選択</h2>
      <label htmlFor={id}>プロジェクト名で検索</label>
      <input id={id} type="search" value={filter.search} autoComplete="off"
        onChange={event => setFilter({ search: event.target.value, page: 0 })} />
    </div>
    <div ref={resultsRef} className={styles.pickerResults} aria-busy={loading}>
      {loading ? <p role="status">プロジェクトを読み込んでいます。</p>
        : query.isError ? <div role="alert"><p>プロジェクトを読み込めませんでした。</p><button className={styles.cancel} type="button" onClick={() => void query.refetch()}>再試行</button></div>
          : projects.length === 0 ? <p role="status">選択できるプロジェクトがありません。</p>
            : <div className={styles.actions}>{projects.map(project => <button type="button" key={project.publicToken} onClick={() => onSelect(project.publicToken)}>
              <span className={styles.projectName}><strong>{project.name}</strong><small>{project.type === "CONTINUOUS" ? "継続" : "イベント"}</small></span><span aria-hidden="true">›</span>
            </button>)}</div>}
    </div>
    <nav className={styles.pickerPagination} aria-label="プロジェクトのページ切替">
      <button type="button" disabled={!ready || filter.page === 0} onClick={() => setFilter(current => ({ ...current, page: current.page - 1 }))}>前へ</button>
      <span role="status" aria-label="ページ番号">{filter.page + 1} / {ready ? Math.max(1, query.data?.totalPages ?? 0) : "—"}</span>
      <button type="button" disabled={!ready || filter.page >= lastPage} onClick={() => setFilter(current => ({ ...current, page: current.page + 1 }))}>次へ</button>
    </nav>
  </div>;
}
