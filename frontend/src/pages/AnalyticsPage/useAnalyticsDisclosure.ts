import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

// Keep chart/filter descendants mounted; only their visibility changes.
export function useAnalyticsDisclosure() {
  const [open, setOpen] = useState(true);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 1199.98px)").matches === true);
  const container = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<Element | null>(null);
  const contentId = useId();
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 1199.98px)");
    const sync = () => {
      const nextCompact = media?.matches === true;
      const active = container.current?.ownerDocument.activeElement;
      restoreFocus.current = nextCompact && !open && active && container.current?.contains(active) ? active : null;
      setCompact(nextCompact);
    };
    sync(); media?.addEventListener("change", sync);
    return () => media?.removeEventListener("change", sync);
  }, [open]);
  useLayoutEffect(() => {
    const active = container.current?.ownerDocument.activeElement;
    if (compact && !open && restoreFocus.current && (active === restoreFocus.current || active === container.current?.ownerDocument.body)) {
      trigger.current?.focus({ preventScroll: true });
    }
    restoreFocus.current = null;
  }, [compact, open]);
  const expanded = !compact || open;
  function toggle() {
    const active = container.current?.ownerDocument.activeElement;
    if (expanded && active && container.current?.contains(active)) trigger.current?.focus({ preventScroll: true });
    setOpen(!open);
  }
  return { compact, expanded, container, trigger, contentId, toggle, expand: () => setOpen(true) };
}
