import { useEffect, useRef } from "react";
import type { RefObject } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Shared behavior for the app's custom dialog/modal implementations
 * (role="dialog", aria-modal="true"): initial focus, Escape-to-close,
 * background scroll lock, Tab/Shift+Tab focus containment, and focus
 * return to the trigger element on close.
 *
 * `onClose` is read through a ref so the effect only runs once per
 * mount/unmount. Depending on the latest `onClose` directly would
 * re-run this effect (and re-steal focus / reset the listener) on
 * every parent re-render, since callers typically pass a new inline
 * function each render.
 */
export function useAccessibleDialog<T extends HTMLElement>(
  dialogRef: RefObject<T | null>,
  onClose: () => void,
  focusFallbackId?: string,
  returnFocusRef?: RefObject<HTMLElement | null>,
): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const focusFallbackIdRef = useRef(focusFallbackId);
  focusFallbackIdRef.current = focusFallbackId;

  useEffect(() => {
    const dialogElement = dialogRef.current;
    const previouslyFocused = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    dialogElement?.focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__ && dialogElement?.closest("#demo-protected-root[inert]")) return;
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialogElement) {
        return;
      }

      const focusable = getFocusableElements(dialogElement);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogElement.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === dialogElement) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (previouslyFocused?.isConnected && previouslyFocused !== document.body) {
        previouslyFocused.focus();
      } else if (focusFallbackIdRef.current) {
        document.getElementById(focusFallbackIdRef.current)?.focus();
      }
    };
    // Mount/unmount only: see the onCloseRef note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogRef]);
}
