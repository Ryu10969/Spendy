import { useLayoutEffect, useRef, useState } from "react";

export function useAnalyticsChartViewport() {
  const viewport = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(max-width: 1199.98px)").matches === true);
  const [size, setSize] = useState({ width: 0, fontSize: 14 });
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const media = window.matchMedia?.("(max-width: 1199.98px)");
    const measure = () => {
      setCompact(media?.matches === true);
      const width = element.clientWidth || element.getBoundingClientRect().width;
      const text = element.querySelector("svg text");
      const fontSize = text ? parseFloat(window.getComputedStyle(text).fontSize) || 14 : 14;
      // A collapsed card reports zero; retain its last geometry until reopened.
      if (width > 0) setSize(previous => previous.width === width && previous.fontSize === fontSize ? previous : { width, fontSize });
    };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    media?.addEventListener("change", measure);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); media?.removeEventListener("change", measure); window.removeEventListener("resize", measure); };
  }, []);
  return { viewport, compact, ...size };
}

// All data points retain their own x coordinate. Only axis text is reflowed.
export function overviewChartLayout(width: number, labels: string[], maximum: number, fontSize = 14) {
  const right = 20;
  const left = Math.min(width * 0.42, Math.max(48, maximum.toLocaleString("ja-JP").length * fontSize * 0.7 + 18));
  const x = (index: number) => labels.length === 1 ? left + (width-left-right)/2 : left + index * (width-left-right)/(labels.length-1);
  const labelWidth = 7 * fontSize * 0.7;
  const labelX = (index: number) => Math.max(labelWidth/2+4, Math.min(width-labelWidth/2-4, x(index)));
  const indices = [0];
  for (let i = 1; i < labels.length-1; i++) {
    if (labelX(i)-labelX(indices[indices.length-1]) >= labelWidth+12 && labelX(labels.length-1)-labelX(i) >= labelWidth+12) indices.push(i);
  }
  if (labels.length > 1) indices.push(labels.length-1);
  const twoRows = labels.length > 1 && labelX(labels.length-1)-labelX(0) < labelWidth+12;
  const axisCharacters = Math.max(1, Math.floor((left-16)/(fontSize*0.7)));
  const axisLines = (text: string) => Array.from({ length: Math.ceil(text.length/axisCharacters) }, (_, i) => text.slice(i*axisCharacters, (i+1)*axisCharacters));
  const axisHeight = axisLines(maximum.toLocaleString("ja-JP")).length * fontSize;
  const top = Math.max(36, axisHeight+8), bottom = top + Math.max(196, (axisHeight+12)*3);
  const labelY = (i: number) => bottom+35 + (twoRows && i === labels.length-1 ? fontSize+8 : 0);
  return { left, right, x, labelX, indices, axisLines, fontSize, top, bottom, height: bottom+35+Math.max(13,fontSize)+(twoRows ? fontSize+8 : 0), labelY };
}
