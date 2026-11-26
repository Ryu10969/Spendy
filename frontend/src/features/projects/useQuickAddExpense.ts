import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType } from "react-router-dom";

type VerificationRequest = {
  id: string;
  token: string | undefined;
  path: string;
  locationKey: string;
  replacing: boolean;
  attempt: number;
};
type Snapshot = {
  location: ReturnType<typeof useLocation>;
  navigationType: ReturnType<typeof useNavigationType>;
  publicToken: string | undefined;
};
type Entry = { request: VerificationRequest; status: "loading" | "error" | "ready"; open: boolean };

function ownsLocation(request: VerificationRequest, snapshot: Snapshot): boolean {
  const { location, navigationType, publicToken } = snapshot;
  return request.token === publicToken
    && request.path === location.pathname + location.search + location.hash
    && (request.locationKey === location.key
      || (request.replacing && navigationType === "REPLACE"
        && location.state?.quickAddExpenseEntry === request.id));
}

// Consume the intent, then keep verification bound to that exact history entry.
export function useQuickAddExpense(publicToken: string | undefined, isRealProject: boolean,
  refetch: () => Promise<{ isSuccess: boolean; data?: { status: string } }>) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const snapshot = { location, navigationType, publicToken };
  const latest = useRef(snapshot);
  const mounted = useRef(false);
  const consumed = useRef(new Set<string>());
  const active = useRef<VerificationRequest | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const requested = location.state?.quickAddExpense === true;

  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useLayoutEffect(() => {
    latest.current = { location, navigationType, publicToken };
    const request = active.current;
    if (!request) return;
    if (!ownsLocation(request, latest.current)) {
      active.current = null;
      setEntry(null);
    } else if (request.locationKey !== location.key) {
      // Only our marked REPLACE can transfer ownership to a new history key.
      request.locationKey = location.key;
      request.replacing = false;
    }
  }, [location, navigationType, publicToken]);

  const isCurrent = (request: VerificationRequest) => mounted.current
    && active.current === request && ownsLocation(request, latest.current);
  const verify = async (request: VerificationRequest) => {
    if (!isCurrent(request)) return;
    const attempt = ++request.attempt;
    setEntry({ request, status: "loading", open: false });
    try {
      const result = await refetch();
      if (!isCurrent(request) || request.attempt !== attempt) return;
      setEntry({ request, status: result.isSuccess ? "ready" : "error",
        open: result.isSuccess && result.data?.status === "ACTIVE" });
    } catch {
      if (isCurrent(request) && request.attempt === attempt) {
        setEntry({ request, status: "error", open: false });
      }
    }
  };
  useEffect(() => {
    if (!requested || consumed.current.has(location.key)) return;
    consumed.current.add(location.key);
    const request: VerificationRequest = {
      id: location.key, token: publicToken,
      path: location.pathname + location.search + location.hash,
      locationKey: location.key, replacing: true, attempt: 0,
    };
    if (isRealProject) active.current = request;
    const { quickAddExpense: _intent, ...state } = location.state;
    navigate(request.path, { replace: true, state: { ...state, quickAddExpenseEntry: request.id } });
    if (isRealProject) void verify(request);
    // The intent owns this request, not subsequent query renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, location.key, publicToken, isRealProject]);

  const current = entry && active.current === entry.request && ownsLocation(entry.request, snapshot) ? entry : null;
  return {
    loading: (isRealProject && requested && !consumed.current.has(location.key)) || current?.status === "loading",
    error: current?.status === "error",
    requestId: current?.status === "ready" && current.open ? current.request.id : undefined,
    handled: () => {
      if (current && isCurrent(current.request)) {
        setEntry(value => value?.request === current.request ? { ...value, open: false } : value);
      }
    },
    retry: () => { if (current) void verify(current.request); },
  };
}
