#!/usr/bin/env bash
set -euo pipefail

PGCONF="$(ls -1 /etc/postgresql/*/main/postgresql.conf | head -n 1)"
HBA="$(ls -1 /etc/postgresql/*/main/pg_hba.conf | head -n 1)"

echo "Using:"
echo "  postgresql.conf = ${PGCONF}"
echo "  pg_hba.conf     = ${HBA}"

echo "Setting listen_addresses='*' ..."
sudo sed -i "s/^#\\?listen_addresses\\s*=.*/listen_addresses = '*'/" "${PGCONF}"

if ! grep -q "OTC-WSL-WINDOWS" "${HBA}"; then
  echo "" | sudo tee -a "${HBA}" >/dev/null
  echo "# OTC-WSL-WINDOWS (dev only)" | sudo tee -a "${HBA}" >/dev/null
  echo "host all all 172.16.0.0/12 scram-sha-256" | sudo tee -a "${HBA}" >/dev/null
  echo "host all all 192.168.0.0/16 scram-sha-256" | sudo tee -a "${HBA}" >/dev/null
  echo "host all all 10.0.0.0/8 scram-sha-256" | sudo tee -a "${HBA}" >/dev/null
fi

echo "Restarting postgresql..."
sudo systemctl restart postgresql

echo "Listening sockets:"
ss -lntp | grep 5432 || true


