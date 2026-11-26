#!/usr/bin/env bash
set -u

cd "$(dirname "$0")/.." || exit 1

# Put each server in its own process group so cleanup also reaches its children.
set -m

backend_pid=
frontend_pid=

cleanup() {
  trap - EXIT INT TERM
  for pid in "$backend_pid" "$frontend_pid"; do
    [[ -z $pid ]] || kill -TERM -- "-$pid" 2>/dev/null || true
  done
  for pid in "$backend_pid" "$frontend_pid"; do
    [[ -z $pid ]] || wait "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(
  cd backend && \
    SPRING_PROFILES_ACTIVE=local SERVER_ADDRESS=127.0.0.1 \
    SPENDINGMATE_LOCAL_HOME_OVERVIEW_ENABLED=true \
    SPENDINGMATE_LOCAL_ANALYTICS_OVERVIEW_ENABLED="${SPENDINGMATE_LOCAL_ANALYTICS_OVERVIEW_ENABLED-true}" \
    exec ./gradlew bootRun --no-daemon
) </dev/null &
backend_pid=$!
(cd frontend && exec npm run dev -- --host 127.0.0.1) </dev/null &
frontend_pid=$!

echo "Started Backend (PID $backend_pid) and Frontend (PID $frontend_pid). Press Ctrl+C to stop both."

while kill -0 "$backend_pid" 2>/dev/null && kill -0 "$frontend_pid" 2>/dev/null; do
  sleep 0.2 &
  wait $! 2>/dev/null || true
done

if ! kill -0 "$backend_pid" 2>/dev/null; then
  if wait "$backend_pid"; then status=0; else status=$?; fi
  echo "Backend exited with status $status; stopping Frontend." >&2
else
  if wait "$frontend_pid"; then status=0; else status=$?; fi
  echo "Frontend exited with status $status; stopping Backend." >&2
fi
exit "$status"
