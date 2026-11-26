export async function revealHomeTheme(update: () => void, shell: HTMLElement) {
  let applied = false;
  const commit = () => {
    if (applied) return;
    update();
    applied = true;
  };
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!reducedMotion || reducedMotion.matches || !document.startViewTransition || !document.documentElement.animate
    || typeof CSS === "undefined" || !CSS.supports?.("clip-path", "circle(1px at 0px 0px)")) {
    commit();
    return;
  }

  let transition: ViewTransition | undefined;
  try {
    document.documentElement.setAttribute("data-home-reveal", "");
    transition = document.startViewTransition(commit);
    // Observe all promises even when snapshot creation or animation is skipped.
    const finished = transition.finished.catch(() => {});
    void transition.updateCallbackDone.catch(commit);
    await transition.ready;
    if (reducedMotion.matches) {
      transition.skipTransition();
    } else {
      const styles = getComputedStyle(shell);
      document.documentElement.animate(
        { clipPath: ["circle(0px at 0px 0px)", `circle(${Math.hypot(window.innerWidth, window.innerHeight)}px at 0px 0px)`] },
        {
          duration: Number.parseFloat(styles.getPropertyValue("--home-reveal-duration")),
          easing: styles.getPropertyValue("--home-reveal-easing").trim(),
          pseudoElement: "::view-transition-new(root)",
        },
      );
    }
    await finished;
  } catch {
    transition?.skipTransition();
    commit();
  } finally {
    document.documentElement.removeAttribute("data-home-reveal");
  }
}
