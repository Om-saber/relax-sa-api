#!/usr/bin/env bash
#
# Local PostgreSQL without Docker or sudo.
# Creates a throwaway cluster in /tmp (or PGDATA) on a non-default port.
#
#   ./scripts/local-db.sh start   # prints DATABASE_URL
#   ./scripts/local-db.sh stop
#   ./scripts/local-db.sh status
#
set -euo pipefail

PGDATA="${PGDATA:-/tmp/relax-pg}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-relax}"
PGDATABASE="${PGDATABASE:-relax}"
SOCKET_DIR="$(dirname "$PGDATA")"

case "${1:-start}" in
  start)
    if [ ! -d "$PGDATA" ]; then
      echo "Initializing cluster at $PGDATA ..."
      initdb -D "$PGDATA" -U "$PGUSER" --auth=trust --encoding=UTF8 --locale=C >/dev/null
    fi

    if pg_ctl -D "$PGDATA" status >/dev/null 2>&1; then
      echo "PostgreSQL already running on port $PGPORT"
    else
      pg_ctl -D "$PGDATA" \
        -o "-p $PGPORT -h 127.0.0.1 -k $SOCKET_DIR" \
        -l "$PGDATA.log" start
    fi

    createdb -h 127.0.0.1 -p "$PGPORT" -U "$PGUSER" "$PGDATABASE" 2>/dev/null || true

    echo
    echo "DATABASE_URL=postgresql://${PGUSER}@127.0.0.1:${PGPORT}/${PGDATABASE}?schema=public"
    ;;

  stop)
    pg_ctl -D "$PGDATA" stop
    ;;

  status)
    pg_ctl -D "$PGDATA" status
    ;;

  *)
    echo "usage: $0 {start|stop|status}"
    exit 1
    ;;
esac
