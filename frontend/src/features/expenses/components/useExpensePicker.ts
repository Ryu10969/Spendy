import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";

const compactQuery = "(max-width: 767px), (max-height: 560px)";

function isCompact(): boolean {
  if (typeof window === "undefined") return false;
  const viewport = window.visualViewport;
  return Boolean(window.matchMedia?.(compactQuery).matches
    || (viewport && (viewport.width <= 767 || viewport.height <= 560)));
}

function isNarrow(): boolean {
  return typeof window !== "undefined" && (window.visualViewport?.width ?? window.innerWidth) <= 767;
}

function subscribeCompact(notify: () => void): () => void {
  const media = window.matchMedia?.(compactQuery);
  media?.addEventListener("change", notify);
  window.addEventListener("resize", notify);
  window.visualViewport?.addEventListener("resize", notify);
  return () => {
    media?.removeEventListener("change", notify);
    window.removeEventListener("resize", notify);
    window.visualViewport?.removeEventListener("resize", notify);
  };
}

/** Shared only by Expense date and single-select fields; panels stay in the dialog DOM. */
export function useExpensePicker(desktopWidth?: number) {
  const [open, setOpen] = useState(false);
  const [overlay, setOverlay] = useState(false);
  // Calendars need all weeks visible: short Desktop viewports use an overlay,
  // while single-select lists can still expand in the scrolling form.
  const inline = useSyncExternalStore(subscribeCompact, desktopWidth ? isNarrow : isCompact, () => false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    const content = desktopWidth ? element.querySelector<HTMLElement>("[data-expense-calendar-content]") : null;
    const position = () => {
      if (inline) {
        for (const name of ["width", "height", "max-height", "left", "top", "visibility", "--expense-calendar-max-height"]) element.style.removeProperty(name);
        element.removeAttribute("data-overlay");
        setOverlay(false);
        return;
      }
      const anchor = (!desktopWidth ? trigger.current?.getBoundingClientRect?.() : undefined) ?? root.current?.getBoundingClientRect();
      if (!anchor) return;
      const boundary = root.current?.closest("[data-expense-picker-boundary]")?.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      if (content && desktopWidth) {
        const width = viewport?.width ?? window.innerWidth;
        const height = viewport?.height ?? window.innerHeight;
        const availableHeight = Math.max(0, height - 16);
        element.style.width = `${element.getAttribute("data-overlay") === "true" ? width : Math.min(desktopWidth, Math.max(0, width - 16))}px`;
        // scrollHeight measures every week even after a very short viewport
        // has constrained the content. Include the content's border as well.
        const naturalHeight = content.scrollHeight + content.offsetHeight - content.clientHeight;
        const below = viewportTop + height - 8 - anchor.bottom - 8;
        const above = anchor.top - 8 - (viewportTop + 8);
        const fitsBelow = below >= naturalHeight && anchor.bottom + 8 >= viewportTop + 8;
        const fitsAbove = above >= naturalHeight && anchor.top - 8 <= viewportTop + height - 8;
        const independent = !fitsBelow && !fitsAbove;
        element.setAttribute("data-overlay", String(independent));
        setOverlay(independent);
        element.style.setProperty("--expense-calendar-max-height", `${availableHeight}px`);
        element.style.maxHeight = "none";
        element.style.width = `${independent ? width : Math.min(desktopWidth, Math.max(0, width - 16))}px`;
        element.style.height = independent ? `${height}px` : "auto";
        element.style.left = `${independent ? viewportLeft : Math.max(viewportLeft + 8, Math.min(anchor.left, viewportLeft + width - 8 - element.offsetWidth))}px`;
        element.style.top = `${independent ? viewportTop : fitsBelow ? anchor.bottom + 8 : anchor.top - naturalHeight - 8}px`;
        element.style.visibility = "visible";
        return;
      }
      const left = Math.max(viewportLeft, boundary?.left ?? viewportLeft) + 8;
      const right = Math.min(viewportLeft + (viewport?.width ?? window.innerWidth), boundary?.right ?? Infinity) - 8;
      const top = Math.max(viewportTop, boundary?.top ?? viewportTop) + 8;
      const bottom = Math.min(viewportTop + (viewport?.height ?? window.innerHeight), boundary?.bottom ?? Infinity) - 8;
      element.style.width = `${Math.max(0, Math.min(desktopWidth ?? anchor.width, right - left))}px`;
      const below = Math.max(0, bottom - anchor.bottom - 8);
      const above = Math.max(0, anchor.top - top - 8);
      const desiredHeight = Math.min(element.scrollHeight, 448);
      const opensBelow = below >= desiredHeight || below >= above;
      element.style.maxHeight = `${Math.min(448, opensBelow ? below : above)}px`;
      const height = element.getBoundingClientRect().height;
      element.style.left = `${Math.max(left, Math.min(anchor.left, right - element.offsetWidth))}px`;
      element.style.top = `${Math.max(top, Math.min(opensBelow ? anchor.bottom + 8 : anchor.top - height - 8, bottom - height))}px`;
      element.style.visibility = "visible";
    };
    if (!inline && element.showPopover && !element.matches(":popover-open")) element.showPopover();
    position();
    if (inline) {
      const boundary = root.current?.closest<HTMLElement>("[data-expense-picker-boundary]");
      if (boundary) {
        const bounds = boundary.getBoundingClientRect(), menu = element.getBoundingClientRect();
        if (menu.top >= bounds.bottom) boundary.scrollTop += menu.top - bounds.top;
      }
    }
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(position);
    observer?.observe(content ?? element);
    if (root.current) observer?.observe(root.current);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer?.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [open, inline, desktopWidth]);

  return { open, setOpen, inline, overlay: open && !inline && overlay, root, trigger, panel, close };
}
