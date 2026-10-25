#!/usr/bin/env bash
# Throwaway local Postgres for development (Neon or any Postgres in production).
# Usage: scripts/local-db.sh start | stop | reset
set -euo pipefail
cd "$(dirname "$0")/.."
DATA=.pgdata
PORT=${PGPORT_LOCAL:-5546}
case "${1:-start}" in
  start)
    [ -d "$DATA" ] || initdb -D "$DATA" -A trust -U outpost >/dev/null
    pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w status >/dev/null 2>&1 \
      || pg_ctl -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w start >/dev/null
    psql -h localhost -p "$PORT" -U outpost -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='outpost'" | grep -q 1 \
      || createdb -h localhost -p "$PORT" -U outpost outpost
    echo "DATABASE_URL=postgresql://outpost@localhost:$PORT/outpost"
    ;;
  stop) pg_ctl -D "$DATA" -w stop ;;
  reset)
    pg_ctl -D "$DATA" -w stop >/dev/null 2>&1 || true
    rm -rf "$DATA"
    "$0" start
    ;;
esac
