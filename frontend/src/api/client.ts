const demo = globalThis.__SPENDINGMATE_PORTFOLIO_DEMO__;
type DemoAccess = "waiting" | "checking" | "verified" | "public" | "locked";
let access: DemoAccess = "waiting";
let generation = new AbortController();
const accessEvents = new EventTarget();

export const demoAnalyticsSelectionKey = "spendingmate.demo.analytics.selection";
export const demoAccessState = () => access;

export function subscribeDemoAccess(listener: () => void) {
  accessEvents.addEventListener("change", listener);
  return () => accessEvents.removeEventListener("change", listener);
}

function setAccess(next: DemoAccess) {
  access = next;
  accessEvents.dispatchEvent(new Event("change"));
}

function lockDemoAccess() {
  generation.abort();
  try {
    window.sessionStorage.removeItem(demoAnalyticsSelectionKey);
  } catch {
    // Storage can be unavailable.
  }
  setAccess("locked");
}

export function suspendDemoAccess() {
  if (access === "locked" || access === "public" || access === "waiting") return;
  generation.abort();
  generation = new AbortController();
  setAccess("waiting");
}

export async function verifyDemoAccess() {
  if (access !== "waiting") return;
  const signal = generation.signal;
  setAccess("checking");
  try {
    const response = await fetch("/actuator/health", {
      headers: { Accept: "application/json, application/vnd.spring-boot.actuator.v3+json" },
      credentials: "same-origin",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (signal.aborted) return;
    if ((response.status === 200 || response.status === 503)
      && response.headers.get("X-Spendingmate-Demo-Access") === "public") {
      setAccess("public");
      return;
    }
    const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0];
    if (response.status !== 200 || !["application/json", "application/vnd.spring-boot.actuator.v3+json"].includes(mediaType ?? "")
      || (await response.json())?.status !== "UP") {
      throw new Error("Demo health verification failed.");
    }
    if (!signal.aborted) setAccess("verified");
  } catch {
    if (!signal.aborted) lockDemoAccess();
  }
}

function accessError() {
  return new ApiError(401, "DEMO_ACCESS_LOST", "Reviewer access must be verified again.");
}

export type ApiFieldError = {
  field: string;
  message: string;
};

type ApiErrorBody = {
  code?: unknown;
  message?: unknown;
  fieldErrors?: unknown;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors: ApiFieldError[];

  constructor(status: number, code: string, message: string, fieldErrors: ApiFieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

function isApiFieldError(value: unknown): value is ApiFieldError {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.field === "string" && typeof candidate.message === "string";
}

function parseResponseBody(text: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function readDemoBody(body: ReadableStream<Uint8Array>, accessSignal: AbortSignal): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let foundBodyStart = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (accessSignal.aborted) throw accessError();
      if (done) return text + decoder.decode();
      const chunk = decoder.decode(value, { stream: true });
      if (!foundBodyStart) {
        const start = chunk.trimStart();
        if (start.startsWith("<")) {
          lockDemoAccess();
          throw accessError();
        }
        foundBodyStart = start.length > 0;
      }
      text += chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");

  const accessSignal = demo && access !== "public" ? generation.signal : undefined;
  if (demo) {
    if (access !== "verified" && access !== "public") throw accessError();
    headers.set("X-Spendingmate-Demo", "1");
  }

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    ...(demo ? { redirect: "manual" } : {}),
    ...(accessSignal ? {
      signal: init?.signal ? AbortSignal.any([init.signal, accessSignal]) : accessSignal,
    } : {}),
  });
  if (accessSignal?.aborted) throw accessError();
  if (accessSignal && (response.status === 401 || response.status === 403 || response.type === "opaqueredirect"
    || (response.status >= 300 && response.status < 400))) {
    lockDemoAccess();
    throw accessError();
  }
  const mediaType = response.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  const demoSuccessWithBody = response.ok && response.status !== 204;
  if (accessSignal && demoSuccessWithBody && (mediaType === "text/html" || mediaType === "application/xhtml+xml")) {
    lockDemoAccess();
    throw accessError();
  }
  const text = accessSignal && demoSuccessWithBody && response.body
    ? await readDemoBody(response.body, accessSignal)
    : await response.text();
  if (accessSignal?.aborted) throw accessError();
  const body = parseResponseBody(text);

  if (!response.ok) {
    const errorBody =
      body && typeof body === "object" ? (body as ApiErrorBody) : undefined;
    const code = typeof errorBody?.code === "string" ? errorBody.code : "API_REQUEST_FAILED";
    const message =
      typeof errorBody?.message === "string" ? errorBody.message : "API request failed.";
    const fieldErrors = Array.isArray(errorBody?.fieldErrors)
      ? errorBody.fieldErrors.filter(isApiFieldError)
      : [];

    throw new ApiError(response.status, code, message, fieldErrors);
  }

  if (demo && (response.status === 204 ? init?.method !== "DELETE"
    : mediaType !== "application/json" || body === null)) {
    throw new ApiError(response.status, "INVALID_API_RESPONSE", "Expected a JSON API response.");
  }
  return body as T;
}
