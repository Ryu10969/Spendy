// Serve the built client with a controllable loopback API for auth and response races.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, extname, join } from "node:path";
import { createRequire } from "node:module";

const dist = resolve(process.argv[2]);
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const tokenA = "A".repeat(43), tokenB = "B".repeat(43);
const project = (publicToken, name) => ({ publicToken, name, type: "CONTINUOUS", status: "ACTIVE",
  members: [{ id: "member-test", name: "架空メンバー", displayOrder: 1, active: true }], roundingUnit: 1, currency: "JPY", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z" });
const a = project(tokenA, "検証用Project A"), b = project(tokenB, "検証用Project B");
const selectionKey = "spendingmate.demo.analytics.selection";
const delay = () => {
  let resolve;
  const ready = new Promise(done => { resolve = done; });
  return { ready, resolve };
};
let health = "ok", catalog = [a,b], onCatalog, onOverview, onExpense, onHealth;
let probes = 0;
let publicAccess = false;
let cutExpense, expenseChunks;
const json = (res, code, body) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(body));
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png" };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/actuator/health") {
      probes++;
      if (onHealth) await onHealth();
      if (publicAccess) {
        assert.equal(req.headers.authorization, undefined);
        return res.writeHead(503, { "X-Spendingmate-Demo-Access": "public", "Content-Type": "application/json" })
          .end('{"status":"DOWN"}');
      }
      if (req.headers.authorization !== "Basic " + Buffer.from("reviewer:fixture").toString("base64") || health === "revoked") return json(res, 401, {});
      if (health === "forbidden") return json(res, 403, {});
      if (health === "down") return json(res, 503, { status: "DOWN" });
      if (health === "html") return res.writeHead(200, { "Content-Type": "text/html" }).end("<p>unexpected</p>");
      if (health === "redirect") return res.writeHead(302, { Location: "/blank" }).end();
      return json(res, 200, { status: "UP" });
    }
    if (url.pathname === "/blank") return res.writeHead(200, { "Content-Type": "text/html" }).end("<p>Other tab</p>");
    if (url.pathname === "/api/projects") {
      if (onCatalog) await onCatalog();
      return json(res, 200, catalog);
    }
    if (url.pathname === "/api/projects/page") {
      return json(res, 200, { items: catalog, page: 0, size: 20, totalElements: catalog.length, totalPages: 1 });
    }
    if (url.pathname === "/api/projects/" + tokenA) {
      if (req.method === "DELETE") {
        catalog = catalog.filter(project => project !== a);
        return res.writeHead(204).end();
      }
      return json(res, 200, a);
    }
    if (url.pathname.endsWith("/expenses")) {
      const items = onExpense ? await onExpense() : [];
      if (items === "truncated") {
        res.writeHead(200, { "Content-Type": expenseChunks.mediaType, "Content-Length": 100 });
        res.write(expenseChunks.first);
        if (expenseChunks.next) {
          await expenseChunks.release.ready;
          res.write(expenseChunks.next);
        }
        await cutExpense.ready;
        if (expenseChunks.tail) res.write(expenseChunks.tail, () => res.destroy());
        else res.destroy();
        return;
      }
      if (typeof items === "string") {
        return res.writeHead(200, { "Content-Type": items }).end("  <!DOCTYPE html><p>Sign in</p>");
      }
      return items === null ? json(res, 401, {}) : json(res, 200, { items });
    }
    if (url.pathname === "/api/demo/analytics") {
      if (onOverview && await onOverview()) return json(res, 404, { code: "PROJECT_NOT_FOUND" });
      const month = url.searchParams.get("endMonth"), token = url.searchParams.get("projectToken");
      const totals = { totalExpense: token === tokenA ? 10234 : 20678, expenseCount: 1 };
      return json(res, 200, {
        ...totals, currency: "JPY", projectType: "CONTINUOUS", eventInclusion: "EXCLUDED",
        period: { startMonth: month, endMonth: month }, includedProjectTokens: [token], excludedProjects: [],
        endMonthComparison: { month, totalExpense: totals.totalExpense, previousMonth: "2026-10", previousTotalExpense: 0,
          difference: totals.totalExpense, comparisonState: "NO_PREVIOUS_DATA", percentageChange: null },
        categoryBreakdown: [{ ...totals, category: "FOOD" }],
        monthlyTrend: [{ ...totals, month }], projectComparison: [{ ...totals, publicToken: token, name: token === tokenA ? a.name : b.name }],
      });
    }
    if (url.pathname.startsWith("/api/")) return json(res, 500, {});
    const file = url.pathname.startsWith("/assets/") ? resolve(dist, "." + url.pathname) : resolve(dist, "index.html");
    res.writeHead(200, { "Content-Type": mime[extname(file)] }).end(await readFile(file));
  } catch {
    res.destroy();
  }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const base = "http://127.0.0.1:" + server.address().port;
// Attach without Playwright's focus emulation so Chrome emits real tab visibility changes.
const profile = await mkdtemp(join(tmpdir(), "spendingmate-chrome-"));
const chrome = spawn(process.env.CHROME_EXECUTABLE, ["--user-data-dir=" + profile,
  "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });
const endpoint = await new Promise((done, reject) => {
  const timeout = setTimeout(() => reject(new Error("Chrome debugging endpoint unavailable")), 10000);
  chrome.once("error", reject);
  chrome.stderr.on("data", chunk => {
    const url = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (url) { clearTimeout(timeout); done(url); }
  });
});
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
const context = browser.contexts()[0];
await context.setExtraHTTPHeaders({ Authorization: "Basic " + Buffer.from("reviewer:fixture").toString("base64") });
const page = context.pages()[0];
page.setDefaultTimeout(12000);
const oldStarted = delay(), oldRelease = delay();
const stored = () => page.evaluate(key => sessionStorage.getItem(key), selectionKey);
const locked = () => page.getByRole("heading", { name: "審査用アクセスを確認できませんでした" }).waitFor();

try {
  // Simulate a network layer that delivers a response even after abort.
  await page.addInitScript(() => {
    window.escapeEvents = [];
    const recordEscape = (phase) => (event) => {
      if (event.key === "Escape" && event.isTrusted) window.escapeEvents.push(phase);
    };
    window.addEventListener("keydown", recordEscape("window capture"), true);
    document.addEventListener("keydown", recordEscape("document capture"), true);
    window.addEventListener("keydown", recordEscape("window bubble"));
    const nativeFetch = window.fetch;
    window.fetch = (resource, init) => String(resource).includes("/expenses")
      ? nativeFetch(resource, { ...init, signal: undefined }) : nativeFetch(resource, init);
  });
  onExpense = async () => { oldStarted.resolve(); await oldRelease.ready; return []; };
  await page.goto(base + "/p/" + tokenA);
  await page.getByRole("heading", { name: a.name }).waitFor();
  await oldStarted.ready;
  await page.evaluate(key => sessionStorage.setItem(key, "old selection"), selectionKey);
  const other = await context.newPage();
  await other.goto(base + "/blank");
  await other.bringToFront();
  await page.waitForFunction(() => document.hidden);
  assert.equal(await page.getByRole("heading", { name: a.name }).count(), 0);
  health = "revoked";
  await page.bringToFront();
  await locked();
  oldRelease.resolve();
  assert.equal(await stored(), null);
  assert.equal(await page.getByRole("heading", { name: a.name }).count(), 0);
  assert.equal(probes, 2);
  console.log("PASS real tab switch, revoked Basic credential, storage clear and delayed response isolation");

  for (const oldReply of [null, "text/html"]) {
    const expiredStarted = delay(), expiredRelease = delay();
    health = "ok";
    onExpense = async () => { expiredStarted.resolve(); await expiredRelease.ready; return oldReply; };
    await page.goto(base + "/p/" + tokenA);
    await page.getByRole("heading", { name: a.name }).waitFor();
    await expiredStarted.ready;
    onExpense = undefined;
    const beforeReturn = probes;
    await other.bringToFront();
    await page.waitForFunction(() => document.hidden);
    await page.bringToFront();
    await page.getByRole("heading", { name: a.name }).waitFor();
    assert.equal(probes, beforeReturn + 1);
    const expiredResponse = page.waitForResponse(r => r.url().includes("/expenses")
      && (oldReply === null ? r.status() === 401 : r.headers()["content-type"] === oldReply));
    expiredRelease.resolve();
    await (await expiredResponse).finished();
    assert.equal(await page.getByRole("heading", { name: a.name }).count(), 1);
  }

  health = "ok";
  await page.goto(base + "/projects/new");
  const form = page.locator("#project-name");
  await form.fill("保存前の架空Project名");
  const originalForm = await form.elementHandle();
  const protectedRoot = page.locator("#demo-protected-root");
  for (const outcome of ["ok", "revoked"]) {
    const started = delay(), release = delay();
    await other.bringToFront();
    await page.waitForFunction(() => document.hidden);
    onHealth = () => { started.resolve(); return release.ready; };
    health = outcome;
    await page.bringToFront();
    await started.ready;
    assert.equal(await form.isVisible(), false);
    assert(await protectedRoot.evaluate(node => node.hidden && node.inert));
    assert.equal(await form.inputValue(), "保存前の架空Project名");
    release.resolve();
    onHealth = undefined;
    if (outcome === "ok") {
      await form.waitFor();
      assert.equal(await form.inputValue(), "保存前の架空Project名");
      assert(await form.evaluate((node, old) => node === old, originalForm));
    } else {
      await locked();
      assert.equal(await form.count(), 0);
      assert.equal(await protectedRoot.count(), 0);
    }
  }
  console.log("PASS hidden and inert form survives successful tab revalidation and unmounts on revocation");

  health = "ok";
  await page.goto(base + "/p/" + tokenA);
  const expenseAmount = page.locator('[data-expense-field="amount"]');
  for (const outcome of ["ok", "revoked"]) {
    await page.getByRole("button", { name: /支出を追加/ }).click();
    await expenseAmount.fill("4321");
    const originalAmount = await expenseAmount.elementHandle();
    const started = delay(), release = delay();
    await other.bringToFront();
    await page.waitForFunction(() => document.hidden);
    onHealth = () => { started.resolve(); return release.ready; };
    health = outcome;
    await page.bringToFront();
    await started.ready;
    assert(await protectedRoot.evaluate(node => node.hidden && node.inert));
    await page.evaluate(() => { window.escapeEvents.length = 0; });
    await page.keyboard.press("Escape");
    assert.deepEqual(await page.evaluate(() => window.escapeEvents), ["window capture"]);
    assert.equal(await expenseAmount.inputValue(), "4321");
    release.resolve();
    onHealth = undefined;
    if (outcome === "ok") {
      await expenseAmount.waitFor();
      assert.equal(await expenseAmount.inputValue(), "4321");
      assert(await expenseAmount.evaluate((node, old) => node === old, originalAmount));
      await page.keyboard.press("Escape");
      await expenseAmount.waitFor({ state: "detached" });
    } else {
      await locked();
      assert.equal(await expenseAmount.count(), 0);
    }
  }
  await other.close();
  console.log("PASS trusted Escape blocked at window during revalidation, preserves 4321 after success, closes when verified and discards on revocation");

  health = "ok";
  await page.goto(base + "/p/" + tokenA);
  await page.getByRole("heading", { name: a.name }).waitFor();
  health = "revoked";
  await page.evaluate(() => { history.pushState({}, "", "/archives"); history.back(); });
  await locked();
  console.log("PASS successful revalidation rejects old 401 and old HTML; history back rechecks auth");

  for (const outcome of ["forbidden", "html", "redirect", "down"]) {
    health = "ok";
    await page.goto(base + "/p/" + tokenA);
    await page.getByRole("heading", { name: a.name }).waitFor();
    health = outcome;
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await locked();
    assert.equal(await page.getByRole("heading", { name: a.name }).count(), 0);
  }
  console.log("PASS persisted pageshow handler denies 403, HTML, redirects and health failure");

  health = "ok";
  await page.goto(base + "/p/" + tokenA, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: a.name }).waitFor();
  await page.evaluate(() => {
    window.addEventListener("pageshow", event => {
      if (event.persisted) sessionStorage.setItem("observed-bfcache", "yes");
    });
  });
  await page.goto(base + "/blank");
  health = "revoked";
  await page.goBack({ waitUntil: "commit" });
  await locked();
  assert.equal(await page.getByRole("heading", { name: a.name }).count(), 0);
  const persisted = await page.evaluate(() => sessionStorage.getItem("observed-bfcache") === "yes");
  console.log(persisted ? "PASS native bfcache restore rechecks revoked auth"
    : "SKIP native bfcache (browser reloaded history entry); history navigation denied access");

  for (const mediaType of ["text/html; charset=utf-8", "application/json"]) {
    health = "ok";
    const release = delay();
    onExpense = async () => { await release.ready; return mediaType; };
    await page.goto(base + "/p/" + tokenA);
    await page.getByRole("heading", { name: a.name }).waitFor();
    await page.evaluate(key => sessionStorage.setItem(key, "old selection"), selectionKey);
    release.resolve();
    await locked();
    assert.equal(await page.locator("#demo-protected-root").count(), 0);
    assert.equal(await stored(), null);
    onExpense = undefined;
  }
  console.log("PASS Expense 200 HTML locks Project detail and clears selection even when labeled JSON");

  for (const test of [
    { mediaType: "application/json", first: "<!DOCTYPE html><p>" },
    { mediaType: "application/json", first: " \n", next: "<!DOC", tail: "TYPE html><p>", release: delay() },
    { mediaType: "text/html", first: "<!DOCTYPE html><p>" },
    { mediaType: "application/json", first: '{"items": [', nonHtml: true },
  ]) {
    health = "ok";
    const htmlHeaders = delay();
    cutExpense = delay();
    expenseChunks = test;
    onExpense = async () => { await htmlHeaders.ready; return "truncated"; };
    await page.goto(base + "/p/" + tokenA);
    const detail = page.getByRole("heading", { name: a.name });
    await detail.waitFor();
    await page.evaluate(key => sessionStorage.setItem(key, "old selection"), selectionKey);
    if (test.release) {
      await page.evaluate(first => {
        const read = ReadableStreamDefaultReader.prototype.read;
        ReadableStreamDefaultReader.prototype.read = async function () {
          const chunk = await read.call(this);
          if (chunk.value && new TextDecoder().decode(chunk.value) === first) {
            document.documentElement.dataset.firstExpenseChunk = "read";
          }
          return chunk;
        };
      }, test.first);
    }
    const headers = page.waitForResponse(r => r.url().includes("/expenses") && r.status() === 200);
    const failed = page.waitForEvent("requestfailed", { predicate: req => req.url().includes("/expenses") });
    htmlHeaders.resolve();
    await headers;
    if (test.release) {
      await page.waitForFunction(() => document.documentElement.dataset.firstExpenseChunk === "read");
      assert(await detail.isVisible());
      test.release.resolve();
    }
    try {
      if (!test.nonHtml) await locked();
    } finally {
      cutExpense.resolve();
    }
    assert.match((await failed).failure().errorText, /ERR_CONTENT_LENGTH_MISMATCH|ERR_INCOMPLETE_CHUNKED_ENCODING/);
    if (test.nonHtml) {
      await page.getByText("支出履歴を読み込めませんでした。", { exact: true }).waitFor();
      assert(await detail.isVisible());
      assert.equal(await stored(), "old selection");
    } else {
      assert.equal(await page.locator("#demo-protected-root").count(), 0);
      assert.equal(await stored(), null);
    }
    onExpense = undefined;
  }
  console.log("PASS truncated JSON-labeled HTML, split prefix and text/html lock before disconnect; non-HTML disconnect stays authenticated");

  await page.goto(base + "/");
  await page.getByLabel(a.name + "の操作").filter({ visible: true }).first().click();
  await page.getByRole("button", { name: a.name + "を削除" }).click();
  const deleted = page.waitForResponse(r => r.request().method() === "DELETE" && r.status() === 204);
  await page.getByRole("button", { name: "削除する" }).click();
  await deleted;
  await page.getByRole("button", { name: "削除する" }).waitFor({ state: "detached" });
  assert(await page.locator("#demo-protected-root").isVisible());
  catalog = [a,b];
  console.log("PASS valid JSON Project page and DELETE 204");

  const choose = async (name, close = true) => {
    const picker = page.locator(".project-select");
    if (await picker.getAttribute("aria-expanded") !== "true") await picker.click();
    await page.getByRole("checkbox", { name: new RegExp(name) }).check();
    if (close) await page.getByRole("button", { name: "選択を完了" }).click();
  };
  const reselect = async () => {
    await page.getByRole("heading", { name: /Projectを再選択してください/ }).waitFor();
    assert.equal(await stored(), null);
    assert.equal(await page.locator(".f-kpis").count(), 0);
    assert(!((await page.locator(".filters").innerText()).includes("適用中：")));
  };
  health = "ok";
  await page.goto(base + "/analytics");
  await choose(a.name);
  await page.locator(".f-kpis").getByText("¥10,234", { exact: true }).first().waitFor();
  const staleStarted = delay(), staleRelease = delay();
  onCatalog = () => staleStarted.ready;
  onOverview = async () => { staleStarted.resolve(); await staleRelease.ready; return false; };
  catalog = [b];
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
  });
  await reselect();
  staleRelease.resolve();
  onCatalog = onOverview = undefined;
  await reselect();
  await choose(b.name);
  await page.locator(".f-kpis").getByText("¥20,678", { exact: true }).first().waitFor();
  console.log("PASS catalog removal invalidates applied selection and pending overview before reselection");

  catalog = [a,b];
  await page.evaluate(key => sessionStorage.removeItem(key), selectionKey);
  await page.reload();
  onOverview = async () => { catalog = [b]; return true; };
  await choose(a.name, false);
  await reselect();
  onOverview = undefined;
  await choose(b.name);
  await page.locator(".f-kpis").getByText("¥20,678", { exact: true }).first().waitFor();
  assert.deepEqual(JSON.parse(await stored()).projectTokens, [tokenB]);
  console.log("PASS PROJECT_NOT_FOUND clears applied selection, refreshes catalog and permits new selection");
  publicAccess = true;
  catalog = [a,b];
  await context.setExtraHTTPHeaders({});
  onExpense = () => null;
  await page.goto(base + "/p/" + tokenA);
  await page.getByRole("heading", { name: a.name }).waitFor();
  await page.getByText("支出履歴を読み込めませんでした。", { exact: true }).waitFor();
  await page.getByRole("button", { name: /支出を追加/ }).click();
  const publicAmount = page.locator('[data-expense-field="amount"]');
  await publicAmount.fill("4321");
  const publicProbes = probes;
  const otherPublicTab = await context.newPage();
  await otherPublicTab.goto(base + "/blank");
  await otherPublicTab.bringToFront();
  await page.waitForFunction(() => document.hidden);
  await page.bringToFront();
  await page.waitForFunction(() => !document.hidden);
  assert.equal(await publicAmount.inputValue(), "4321");
  assert(await page.locator("#demo-protected-root").isVisible());
  await otherPublicTab.close();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  assert.equal(await publicAmount.inputValue(), "4321");
  assert.equal(probes, publicProbes);
  await page.keyboard.press("Escape");
  await publicAmount.waitFor({ state: "detached" });
  console.log("PASS public mode opens without Basic, handles an API error, preserves form and skips auth rechecks");
} finally {
  oldRelease.resolve();
  await browser.close();
  chrome.kill();
  await rm(profile, { recursive: true, force: true, maxRetries: 5 });
  server.closeAllConnections();
  await new Promise(done => server.close(done));
}
