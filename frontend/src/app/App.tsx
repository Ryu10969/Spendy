import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { demoAccessState, subscribeDemoAccess, suspendDemoAccess, verifyDemoAccess } from "../api/client";
import { focusManager, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { createQueryClient, queryClient } from "./queryClient";
import { router } from "./router";
import { ThemeProvider } from "./ThemeProvider";

function VerifiedDemo({ visible }: { visible: boolean }) {
  const [client] = useState(() => createQueryClient(true));
  useEffect(() => () => client.clear(), [client]);
  useLayoutEffect(() => {
    if (!visible) void client.cancelQueries();
  }, [client, visible]);
  return <div id="demo-protected-root" hidden={!visible} inert={!visible}>
    <QueryClientProvider client={client}>
      <ThemeProvider><RouterProvider router={router} /></ThemeProvider>
    </QueryClientProvider>
  </div>;
}

function DemoApp() {
  const access = useSyncExternalStore(subscribeDemoAccess, demoAccessState, () => "waiting");
  const [hasVerified, setHasVerified] = useState(false);
  const publicAccess = access === "public";
  useEffect(() => {
    if (access === "verified") {
      setHasVerified(true);
      focusManager.setFocused(true);
    }
  }, [access]);
  useEffect(() => {
    if (publicAccess) return;
    // Commit the hidden state before the browser captures a history snapshot.
    const suspend = () => {
      focusManager.setFocused(false);
      flushSync(suspendDemoAccess);
    };
    const resume = () => {
      if (!document.hidden) void verifyDemoAccess();
    };
    const visibility = () => document.hidden ? suspend() : resume();
    const restore = () => {
      suspend();
      resume();
    };
    const pageShow = (event: PageTransitionEvent) => {
      if (event.persisted) restore();
      else resume();
    };
    // Inert blocks input on the protected subtree, but Escape can target the
    // document when focus leaves a concealed dialog.
    const suppressEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && demoAccessState() !== "verified") {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", suppressEscape, true);
    window.addEventListener("pagehide", suspend);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("popstate", restore);
    document.addEventListener("visibilitychange", visibility);
    resume();
    return () => {
      window.removeEventListener("keydown", suppressEscape, true);
      window.removeEventListener("pagehide", suspend);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("popstate", restore);
      document.removeEventListener("visibilitychange", visibility);
      focusManager.setFocused(undefined);
    };
  }, [publicAccess]);
  if (access === "locked") return <main>
    <h1>審査用アクセスを確認できませんでした</h1>
    <a href="/">デモの入口へ戻る</a>
  </main>;
  const visible = access === "verified" || publicAccess;
  return <>
    {(hasVerified || visible) && <VerifiedDemo visible={visible} />}
    {!visible && <main><p role="status">審査用アクセスを確認しています。</p></main>}
  </>;
}

export function App() {
  if (globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__) return <DemoApp />;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider><RouterProvider router={router} /></ThemeProvider>
    </QueryClientProvider>
  );
}
