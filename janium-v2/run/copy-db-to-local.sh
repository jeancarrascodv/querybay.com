#!/usr/bin/env bash

podman stop janium-postgres
podman rm janium-postgres
podman volume prune -f --filter dangling=true

podman run \
  --name janium-postgres \
  --detach \
  -e POSTGRES_PASSWORD=Janium12345 \
  -e POSTGRES_USER=janium_dev \
  -e POSTGRES_DB=janium_dev \
  -p 5432:5432 \
  docker.io/library/postgres:17-alpine

. /var/lib/janium/.env

while ! psql postgresql://janium_dev:Janium12345@localhost:5432/janium_dev -c 'SELECT 1' > /dev/null 2>&1; do
  echo "waiting for database to be ready"
  sleep 1
done

podman exec janium-postgres /bin/bash -c \
  "pg_dump '${DB_CONNECT_URL}' --exclude-table-data=log_entries | psql postgresql://janium_dev:Janium12345@localhost:5432/janium_dev"

