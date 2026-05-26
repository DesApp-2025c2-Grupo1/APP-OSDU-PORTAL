#!/bin/sh
set -e

echo "Waiting for database..."
node scripts/wait-for-db.js

echo "Running database migrations..."
npm run migrate

if [ "$RUN_SEEDS" = "true" ]; then
  echo "Running database seeds..."
  npm run seed
fi

echo "Starting API..."
exec "$@"
