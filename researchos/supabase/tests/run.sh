#!/usr/bin/env bash
# Aplica stub + migrações num Postgres local (com pgvector) e roda os testes de comportamento.
# Uso: DB=rtest PSQL="psql -U postgres" ./run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL=${PSQL:-psql}; DB=${DB:-rtest}
$PSQL -q -c "drop database if exists $DB" -c "create database $DB"
for f in tests/stub_supabase.sql migrations/*.sql tests/behavior.sql; do
  $PSQL -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" 2>&1 | grep -E "NOTICE:  (ok|===)|ERROR|FALHOU" | sed 's/^.*NOTICE:  //' || true
done
