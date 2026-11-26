import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import styles from "./CollapsibleCard.module.css";

type CollapsibleCardProps = {
  title: string;
  defaultOpen?: boolean;
  expandOnDesktop?: boolean;
  children: ReactNode;
};

const smartphoneQuery = "(max-width: 767px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(smartphoneQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function CollapsibleCard({ title, defaultOpen = true, expandOnDesktop = false, children }: CollapsibleCardProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelHadFocus = useRef(false);
  const smartphone = useSyncExternalStore((onChange) => subscribe(() => {
    panelHadFocus.current = Boolean(panel.current?.contains(document.activeElement));
    onChange();
  }), () => window.matchMedia(smartphoneQuery).matches, () => false);
  const expanded = (expandOnDesktop && !smartphone) || isOpen;
  useEffect(() => {
    if (!expanded && panelHadFocus.current) trigger.current?.focus();
    panelHadFocus.current = false;
  }, [expanded, smartphone]);

  return (
    <section className={styles.card}>
      <h3 className={styles.heading}>
        {expandOnDesktop && !smartphone ? <span>{title}</span> : <button
          ref={trigger}
          className={styles.toggle}
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span>{title}</span>
          <span className={styles.icon} aria-hidden="true">
            {expanded ? "⌃" : "⌄"}
          </span>
        </button>}
      </h3>
      <div ref={panel} className={styles.panel} id={panelId} hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
