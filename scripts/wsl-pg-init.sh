#!/usr/bin/env bash
set -euo pipefail

DB_USER="${DB_USER:-otc}"
DB_PASSWORD="${DB_PASSWORD:-otc_password}"
DB_NAME="${DB_NAME:-otc}"

echo "Starting PostgreSQL (service)..."
service postgresql start >/dev/null 2>&1 || true

echo "Ensuring role/database exist: user=${DB_USER} db=${DB_NAME}"

ROLE_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" || true)"
if [[ "${ROLE_EXISTS}" != "1" ]]; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';"
else
  echo "Role ${DB_USER} already exists."
fi

DB_EXISTS="$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" || true)"
if [[ "${DB_EXISTS}" != "1" ]]; then
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"
else
  echo "Database ${DB_NAME} already exists."
fi

echo "Done."


