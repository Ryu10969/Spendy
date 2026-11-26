import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { percentage } from "./dedicatedAnalyticsPresentation";
import "./analyticsChartInteraction.css";

// Chart receives integer display values. Keep derived rates exact with the
// existing HALF_UP formatter; never animate the money values themselves.
export function chartPointComparison(current: number, previous: number | null, exact?: { difference: number | null; percentageChange: string | null }) {
  if (previous === null) return { direction: "unavailable", text: "比較不可", rate: "—", arrow: "—" };
  const difference = exact?.difference == null ? BigInt(current) - BigInt(previous) : BigInt(exact.difference);
  const direction = difference > 0n ? "increase" : difference < 0n ? "decrease" : "unchanged";
  const rounded = exact ? exact.percentageChange : previous > 0 ? percentage(difference, BigInt(previous)) : null;
  const rate = rounded === null ? "—" : `${rounded.startsWith("-") ? "−" : rounded !== "0.00" ? "+" : ""}${rounded.replace(/^-/, "")}%`;
  return { direction, text: previous === 0 ? current === 0 ? "変化なし・両月の支出なし" : "増加・前月の支出なし（比較不可）" : difference > 0n ? "増加" : difference < 0n ? "減少" : "変化なし", rate, arrow: difference > 0n ? "↑" : difference < 0n ? "↓" : "→" };
}

export function chartPreviousValue(values: number[], labels: string[], index: number): number | null {
  if (index === 0) return null;
  const serial = (value: string) => Number(value.slice(0,4)) * 12 + Number(value.slice(5));
  return serial(labels[index]) - serial(labels[index-1]) === 1 ? values[index-1] : null;
}

export function chartBadgePosition(clientX: number, clientY: number, bounds: { left: number; top: number; right: number; bottom: number }, size: { width: number; height: number }, viewportWidth: number) {
  const left = Math.max(bounds.left, 0) + 8, right = Math.min(bounds.right, viewportWidth) - 8;
  const x = Math.max(left, Math.min(clientX + 14, right - size.width));
  const y = Math.max(bounds.top + 8, Math.min(clientY - size.height - 14, bounds.bottom - size.height - 8));
  return { x: x - bounds.left, y: y - bounds.top, minX: left - bounds.left, maxX: Math.max(left, right - size.width) - bounds.left, minY: 8, maxY: Math.max(8, bounds.bottom - bounds.top - size.height - 8) };
}

type Selection = { key: string; id: string; open: boolean; mode: "pointer" | "focus" | "touch" };
export function useChartInteraction(dataKey: string) {
  const container = useRef<HTMLDivElement>(null), badge = useRef<HTMLDivElement>(null);
  const tooltipId = useId(), pointer = useRef({ x: 0, y: 0 });
  const [selection, setSelection] = useState<Selection | null>(null);
  const [reduced, setReduced] = useState(() => typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== false);
  const x = useMotionValue(0), y = useMotionValue(0);
  const current = selection?.key === dataKey ? selection : null;
  const open = current?.open === true;
  const clear = () => setSelection(value => value?.open ? { ...value, open: false } : value);
  const place = (immediate = false) => {
    const bounds = container.current?.getBoundingClientRect(), size = badge.current?.getBoundingClientRect();
    if (!bounds || !size) return;
    const target = chartBadgePosition(pointer.current.x, pointer.current.y, bounds, size, window.innerWidth || bounds.right);
    for (const [value, destination, min, max] of [[x, target.x, target.minX, target.maxX], [y, target.y, target.minY, target.maxY]] as const) {
      value.stop();
      // Content can grow at an edge: clamp the displayed origin before retargeting.
      const safe = Math.min(max, Math.max(min, value.get()));
      if (safe !== value.get()) value.jump(safe);
      if (immediate || reduced) value.jump(destination);
      else animate(value, destination, { type: "tween", duration: 0.14, ease: "easeOut" });
    }
  };
  const locate = (element: SVGRectElement, client?: { clientX: number; clientY: number }) => {
    const bounds = element.getBoundingClientRect();
    pointer.current = { x: client?.clientX ?? (bounds.left + bounds.right) / 2, y: client?.clientY ?? bounds.top };
    place(!current);
  };
  const select = (id: string, element: SVGRectElement, mode: Selection["mode"], client?: { clientX: number; clientY: number }) => {
    locate(element, client);
    setSelection(value => value?.key === dataKey && value.id === id && value.open && value.mode === mode ? value : { key: dataKey, id, open: true, mode });
  };
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(preference?.matches !== false);
    const outside = (event: Event) => { if (!container.current?.contains(event.target as Node)) clear(); };
    preference?.addEventListener("change", sync); sync();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") clear(); };
    document.addEventListener("pointerdown", outside, { capture: true }); document.addEventListener("keydown", escape);
    window.addEventListener("resize", clear); window.addEventListener("scroll", clear, { capture: true });
    return () => {
      preference?.removeEventListener("change", sync); document.removeEventListener("pointerdown", outside, { capture: true }); document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", clear); window.removeEventListener("scroll", clear, { capture: true });
      x.stop(); y.stop();
    };
  }, [x, y]);
  useLayoutEffect(() => {
    // Purge as well as gate: returning to older data must not reopen its badge.
    setSelection(value => value?.key === dataKey ? value : null);
  }, [dataKey]);
  useLayoutEffect(() => {
    if (!current) { x.stop(); y.stop(); }
    else if (open) place(reduced);
  }, [dataKey, current?.id, open, reduced]);
  return { container, badge, tooltipId, x, y, reduced, current, clear, select,
    move: (element: SVGRectElement, client: { clientX: number; clientY: number }) => { if (open && current?.mode === "pointer") locate(element, client); } };
}
export type ChartInteraction = ReturnType<typeof useChartInteraction>;

export function ChartBadge({ interaction, children }: { interaction: ChartInteraction; children: ReactNode }) {
  const { current, reduced, x, y, badge, tooltipId } = interaction;
  const opacity = useMotionValue(0), offset = useMotionValue(4);
  const contentOpacity = useMotionValue(1), contentOffset = useMotionValue(0);
  const contentY = useTransform(() => offset.get() + contentOffset.get());
  const visibility = useTransform(() => opacity.get() > 0 ? "visible" : "hidden");
  useLayoutEffect(() => {
    const open = current?.open === true;
    for (const [value, target] of [[opacity, open ? 1 : 0], [offset, open ? 0 : 4]] as const) {
      value.stop();
      if (reduced || !current) value.jump(target);
      else animate(value, target, { type: "tween", duration: 0.12, ease: "easeOut" });
    }
    return () => { opacity.stop(); offset.stop(); };
  }, [current?.open, current === null, reduced, opacity, offset]);
  useLayoutEffect(() => {
    contentOpacity.stop(); contentOffset.stop();
    if (reduced || !current) { contentOpacity.jump(1); contentOffset.jump(0); }
    else {
      contentOpacity.jump(0); contentOffset.jump(3);
      animate(contentOpacity, 1, { type: "tween", duration: 0.12, ease: "easeOut" });
      animate(contentOffset, 0, { type: "tween", duration: 0.12, ease: "easeOut" });
    }
    return () => { contentOpacity.stop(); contentOffset.stop(); };
  }, [current?.id, current === null, reduced, contentOpacity, contentOffset]);
  return <motion.div ref={badge} id={tooltipId} role="tooltip" aria-hidden={!current?.open} className="chart-point-badge" style={{ x, y, opacity, visibility }}>
    <motion.div style={{ opacity: contentOpacity, y: contentY }}>{children}</motion.div>
  </motion.div>;
}
