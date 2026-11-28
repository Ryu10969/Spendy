import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import postcss from "postcss";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file, imports = {}) {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("exports", "require", output)(module.exports, name => {
    if (name === "react/jsx-runtime") return jsx;
    if (name.endsWith(".module.css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) };
    assert.ok(name in imports, `Unexpected import: ${name}`); return imports[name];
  }); return module.exports;
}
const money = load("utils/formatMoney.ts");
const { ProjectCard } = load("features/projects/components/ProjectCard.tsx", {
  "react-router-dom": { Link: ({ to, children, ...props }) => jsx.jsx("a", { ...props, href: to, children }) },
  "../../../utils/formatMoney": money, "./ProjectTypeBadge": { ProjectTypeBadge: () => null },
  "../../../assets/projects/default-continuous.svg?no-inline": { __esModule: true, default: "continuous.svg" },
  "../../../assets/projects/default-event.svg?no-inline": { __esModule: true, default: "event.svg" },
});
const values = [9999, 10000, 99999, 100000, 999999, 1000000, 9999999, 99999999, 999999999];
for (const type of ["CONTINUOUS", "EVENT"]) for (const status of ["ACTIVE", "ARCHIVED"]) for (const amount of values) {
  const markup = renderToStaticMarkup(ProjectCard({ project: { publicToken: "token", name: "箱根旅行", type, status, members: [],
    summary: { totalExpenseYen: amount, expenseCount: 1, lastUpdatedLabel: "11月6日" } }, onDelete() {} }));
  assert.ok(markup.includes(`<strong class="amount">${money.formatYen(amount)}</strong>`), "one complete formatted text node, no omission or inserted break");
  assert.ok(markup.includes("箱根旅行")); assert.ok(markup.includes("更新 11月6日")); assert.ok(markup.includes("箱根旅行の操作"));
}

const parsed = postcss.parse(readFileSync(new URL("../src/features/projects/components/ProjectCard.module.css", import.meta.url), "utf8"));
function declarations(element, width, containerWidth, rootFont, home = true) {
  const rules = [];
  parsed.walkRules(rule => {
    for (const selector of rule.selectors) {
      if (!(selector === `.${element}` || selector.endsWith(` .${element}`))) continue;
      if (selector.includes(":global([data-home-page])") && !home) continue;
      for (let parent = rule.parent; parent; parent = parent.parent) {
        if (parent.type !== "atrule") continue;
        if (parent.name === "media") {
          const max = parent.params.match(/max-width:\s*([\d.]+)px/), min = parent.params.match(/min-width:\s*([\d.]+)px/);
          if (max && width > +max[1] || min && width < +min[1]) return;
        }
        if (parent.name === "container") {
          assert.equal(parent.params, "home-project-card (width < 20rem)");
          if (!home || containerWidth >= 20 * rootFont) return;
        }
      }
      // Specific container selectors must beat later, less-specific mobile rules.
      const specificity = (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length;
      const values = {}; rule.walkDecls(d => { values[d.prop] = d.value; }); rules.push({ specificity, values });
    }
  });
  return Object.assign({}, ...rules.sort((a, b) => a.specificity - b.specificity).map(rule => rule.values));
}
const widths = [320, 360, 375, 390, 393, 430, 440, 767, 768, 1200];
const normalFont = [], layouts = new Set(); let cases = 0;
for (const theme of ["light", "dark"]) for (const width of widths) for (const root of [16, 24, 32]) for (const safe of [0, 44]) for (const scrollbar of [0, 15]) {
  // Shell has max(12px, Safe Area) side padding; Home has no mobile padding.
  const cardWidth = width - 2 * Math.max(12, safe) - scrollbar - 2;
  const navigationWidth = cardWidth - root;
  const amount = declarations("amount", width, navigationWidth, root);
  const spending = declarations("spending", width, navigationWidth, root);
  if (width >= 768) {
    assert.equal(amount["white-space"], undefined, "tablet/PC rules are untouched");
    assert.equal(amount["font-size"], "var(--font-size-lg)");
    continue;
  }
  assert.equal(declarations("navigation", width, navigationWidth, root).container, "home-project-card / inline-size");
  assert.equal(declarations("card", width, navigationWidth, root).container, undefined, "the delete menu stays outside the new container's stacking context");
  assert.equal(amount["white-space"], "nowrap"); assert.equal(amount["overflow-wrap"], "normal"); assert.equal(amount["word-break"], "normal");
  assert.equal(amount["font-variant-numeric"], "tabular-nums");
  assert.equal(amount.overflow, undefined); assert.equal(amount["text-overflow"], undefined);
  assert.equal(declarations("navigation", width, cardWidth, root)["flex-wrap"], "wrap");
  assert.equal(spending.flex, "0 0 auto", "whole amount block cannot shrink into partial digits");
  const separateRow = navigationWidth < 20 * root;
  const preferred = Math.max(root, Math.min(1.25 * root, .75 * root + .016 * navigationWidth));
  const font = separateRow ? Math.min(preferred, navigationWidth / 8) : preferred;
  assert.ok(font >= 16, "tested geometry never resorts to a tiny font");
  assert.equal(amount["font-size"], separateRow
    ? "min(clamp(1rem, calc(0.75rem + 1.6cqi), 1.25rem), calc(100cqi / 8))"
    : "clamp(1rem, calc(0.75rem + 1.6cqi), 1.25rem)");
  if (separateRow) { assert.equal(spending["flex-basis"], "100%"); assert.equal(spending.padding, "0"); assert.equal(amount["justify-self"], "end"); }
  else { assert.equal(spending["min-width"], "max-content"); assert.equal(spending["padding-right"], "2.75rem"); }
  for (const value of values) {
    const formatted = money.formatYen(value);
    // Conservative 8em bound for the nine-digit sample; not browser glyph measurement.
    const glyphWidth = (formatted.replace(/\D/g, "").length * .7 + (formatted.match(/,/g) ?? []).length * .35 + 1) * font;
    const blockWidth = Math.max(glyphWidth, 6 * .75 * root) + 3.25 * root + 1;
    if (separateRow) {
      assert.ok(glyphWidth <= navigationWidth + 1e-7, "full amount fits the independent row");
      // The amount is below both the protected label and the existing centered menu.
      const imageHeight = (width < 360 ? 3.5 : 3.75) * root;
      const labelHeight = 1.125 * root, amountHeight = 1.25 * font;
      const cardHeight = 2 + root + imageHeight + .5 * root + labelHeight + .25 * root + amountHeight;
      const amountTop = 1 + .5 * root + imageHeight + .5 * root + labelHeight + .25 * root;
      assert.ok(amountTop >= cardHeight / 2 + 2.75 * root / 2, "numeric row is below the unchanged delete touch target");
    } else {
      assert.ok(blockWidth <= navigationWidth + 1e-7, "whole amount block fits even when flex moves it to another line");
    }
    const sideBySide = !separateRow && 4.5 * root + 7 * root + root + blockWidth <= navigationWidth;
    layouts.add(sideBySide ? "right" : "new-row"); cases++;
  }
  if (theme === "light" && root === 16 && safe === 0 && scrollbar === 0) normalFont.push({ width, cardWidth, font: +font.toFixed(2), layout: separateRow ? "independent-row" : "intrinsic-flex-wrap" });
  const other = declarations("amount", width, navigationWidth, root, false);
  assert.equal(other["font-size"], "var(--font-size-lg)"); assert.equal(other["white-space"], undefined, "Archives-page cards remain unchanged");
}
assert.deepEqual([...layouts].sort(), ["new-row", "right"]);
console.log(`Home Project amount PASS: ${cases} static glyph-envelope/layout cases, all nine amounts, Continuous/Event and ACTIVE/ARCHIVED markup, Light/Dark shared rules, enlarged text, Safe Area and scrollbar allowances. No clipping/ellipsis, whole-block wrapping, delete-target clearance and tablet/PC/Archives scope guards.`);
console.log(JSON.stringify(normalFont));
console.log("Static CSS/glyph-envelope model only. Native browser font fallback, shaping, actual flex geometry and zoom remain unverified.");
