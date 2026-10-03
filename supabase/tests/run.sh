#!/usr/bin/env bash
# Runs migrations + tenant-isolation tests on a throwaway Postgres database.
set -euo pipefail
cd "$(dirname "$0")"
DB="${PGDATABASE:-orbita_test}"
psql -v ON_ERROR_STOP=1 -q -c "drop database if exists $DB" -c "create database $DB" postgres
export PGDATABASE="$DB"
psql -v ON_ERROR_STOP=1 -q -f stub_auth.sql
for f in ../migrations/*.sql; do psql -v ON_ERROR_STOP=1 -q -f "$f"; done
psql -v ON_ERROR_STOP=1 -f isolation.sql
