import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { QuickAddProjectChoices } from "./QuickAddProjectChoices";
import { useAccessibleDialog } from "../../hooks/useAccessibleDialog";
import styles from "./ResponsiveNavigation.module.css";

// Home's existing desktop grid starts at 1200px (248px sidebar + two-card main).
export const mobileNavigationQuery = "(max-width: 1199.98px)";
const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  archives: "M3 3h18v5H3ZM5 8v13h14V8M9 12h6",
  plus: "M12 4v16M4 12h16",
  analytics: "M4 20V13h4v7Zm6 0V8h4v12Zm6 0V3h4v17Z",
  account: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 21v-2c0-6 18-6 18 0v2",
  expense: "M4 6c0-4 16-4 16 0s-16 4-16 0Zm0 0v12c0 4 16 4 16 0V6M4 12c0 4 16 4 16 0",
  project: "M3 5h7l3 3h8v13H3Z",
  share: "m9 15 6-6M8 16l-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 5 0m2 0 2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-5 0",
  receipt: "M3 7h5l2-3h4l2 3h5v14H3Zm13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};
function Icon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
export function focusHomeProjectSearch() {
  document.getElementById("project-search")?.focus();
}

export function QuickAddSheet({ onClose, onSelectProject, triggerId, theme }: { onClose: () => void; onSelectProject: (token: string) => void; triggerId: string; theme: "light" | "dark" }) {
  const overlay = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDivElement>(null);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => { if (selecting) dialog.current?.focus(); }, [selecting]);
  const portal = (globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__
    ? document.getElementById("demo-protected-root") : null) ?? document.body;
  // Restore inert before the shared focus cleanup.
  useLayoutEffect(() => {
    const siblings = Array.from(portal.children).filter((node): node is HTMLElement => node instanceof HTMLElement && node !== overlay.current);
    const previous = siblings.map(node => [node,node.inert] as const);
    siblings.forEach(node => { node.inert = true; });
    return () => { previous.forEach(([node,inert]) => { node.inert = inert; }); };
  },[portal]);
  // Portals do not inherit the Home/Analytics theme container's CSS variables.
  useLayoutEffect(() => {
    const source = document.getElementById(triggerId)?.closest("[data-responsive-navigation]");
    if (!source || !overlay.current) return;
    const colors = window.getComputedStyle(source);
    for (const name of ["surface","input","text","muted","accent","selected","border"]) {
      const property = `--nav-${name}`;
      overlay.current.style.setProperty(property,colors.getPropertyValue(property));
    }
  },[theme,triggerId]);
  useAccessibleDialog(dialog,onClose,triggerId);
  useEffect(() => () => {
    // The mobile trigger is hidden after a resize to the desktop shell.
    if (!window.matchMedia(mobileNavigationQuery).matches) document.getElementById("main-content")?.focus({preventScroll:true});
  },[]);
  return createPortal(<div ref={overlay} className={styles.overlay} data-quick-add-overlay="" data-nav-theme={theme} onPointerDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialog} className={styles.sheet} data-project-selection={selecting || undefined} role="dialog" aria-modal="true" aria-label={selecting ? "プロジェクトを選択" : "追加メニュー"} tabIndex={-1}>
      <span className={styles.handle} aria-hidden="true" />
      {selecting ? <QuickAddProjectChoices onSelect={onSelectProject} /> : <div className={styles.actions}>
        <button type="button" onClick={() => setSelecting(true)}><span className={styles.actionIcon}><Icon name="expense" /></span><span className={styles.actionText}><strong>支出を追加</strong><small>プロジェクトを選択して記録</small></span><span className={styles.actionChevron} aria-hidden="true">›</span></button>
        <Link to="/projects/new" onClick={onClose}><span className={styles.actionIcon}><Icon name="project" /></span><span className={styles.actionText}><strong>プロジェクトを作成</strong><small>継続・イベントの新規作成</small></span><span className={styles.actionChevron} aria-hidden="true">›</span></Link>
        <button type="button" disabled><span className={styles.actionIcon}><Icon name="share" /></span><span className={styles.actionText}><strong>共有リンクを作成</strong><small>プロジェクトへの招待</small></span><span className={styles.badge}>準備中</span></button>
        <button type="button" disabled><span className={styles.actionIcon}><Icon name="receipt" /></span><span className={styles.actionText}><strong>レシートを読み取り</strong><small>レシートから支出を入力</small></span><span className={styles.badge}>準備中</span></button>
      </div>}
      <button type="button" className={styles.cancel} onClick={onClose}>キャンセル</button>
    </div>
  </div>,portal);
}

export function ResponsiveNavigation({ active, theme }: { active: "home" | "archives" | "analytics" | null; theme: "light" | "dark" }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open,setOpen] = useState(false);
  const [destination, setDestination] = useState<string | null>(null);
  // Navigate only after the sheet's unmount cleanup has restored inert/focus.
  useEffect(() => {
    if (open || destination === null) return;
    setDestination(null);
    navigate(`/p/${encodeURIComponent(destination)}`, { state: { quickAddExpense: true } });
  }, [open, destination, navigate]);
  const triggerId = useId();
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = bar.current;
    const host = element?.closest<HTMLElement>("[data-app-shell]");
    if (!element || !host) return;
    const property = "--responsive-nav-reserve", previous = host.style.getPropertyValue(property);
    const media = window.matchMedia(mobileNavigationQuery);
    const restore = () => { if (previous) host.style.setProperty(property,previous); else host.style.removeProperty(property); };
    const measure = () => { if (media.matches) host.style.setProperty(property,`${Math.ceil(element.getBoundingClientRect().height)+24}px`); else restore(); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element); media.addEventListener("change",measure); measure();
    return () => { observer?.disconnect(); media.removeEventListener("change",measure); restore(); };
  },[]);
  useEffect(() => {
    const media = window.matchMedia(mobileNavigationQuery);
    const sync = () => { if (!media.matches) setOpen(false); };
    media.addEventListener("change",sync); sync();
    return () => media.removeEventListener("change",sync);
  },[]);
  useEffect(() => { setOpen(false); }, [pathname]);
  return <div className={styles.root} data-responsive-navigation="" data-nav-theme={theme}>
    <nav ref={bar} className={styles.bar} aria-label="モバイルナビゲーション">
      <Link to="/" aria-current={active === "home" ? "page" : undefined}><Icon name="home" /><span>ホーム</span></Link>
      <Link to="/archives" aria-current={active === "archives" ? "page" : undefined}><Icon name="archives" /><span>アーカイブ</span></Link>
      <button id={triggerId} className={styles.add} type="button" aria-label="追加メニュー" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><Icon name="plus" /></button>
      <Link to="/analytics" aria-current={active === "analytics" ? "page" : undefined}><Icon name="analytics" /><span>分析</span></Link>
      <button type="button" disabled aria-label="アカウント（準備中）"><Icon name="account" /><span>アカウント</span><small>準備中</small></button>
    </nav>
    {open ? <QuickAddSheet theme={theme} triggerId={triggerId} onClose={() => setOpen(false)} onSelectProject={token => { setDestination(token); setOpen(false); }} /> : null}
  </div>;
}
