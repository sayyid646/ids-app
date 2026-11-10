#!/usr/bin/env bash
# Membuat database baru, menjalankan tiruan Supabase, semua migrasi, lalu tes.
# Pemakaian: PGHOST=... PGPORT=... ./jalankan_tes.sh
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"
DB=ids_tes
export PGOPTIONS="-c client_min_messages=warning"
PSQL="psql -X -q -v ON_ERROR_STOP=1 -U postgres"
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
# peran anon/authenticated dibuat oleh tiruan bila belum ada
$PSQL -d $DB -f "$DIR/tests/00_tiruan_supabase.sql"
for f in "$DIR"/migrations/*.sql; do
  echo "migrasi: $(basename "$f")"
  $PSQL -d $DB -f "$f"
done
if [ -f "$DIR/tests/10_tes_bisnis.sql" ]; then
  PGOPTIONS="-c client_min_messages=notice" $PSQL -d $DB -f "$DIR/tests/10_tes_bisnis.sql"
fi
if [ "${ULANG:-1}" = "1" ]; then
  echo "menjalankan ulang semua migrasi (harus aman diulang)..."
  for f in "$DIR"/migrations/*.sql; do $PSQL -d $DB -f "$f"; done
  $PSQL -d $DB -t -c "select 'ulang: pengrajin=' || (select count(*) from public.craftsmen) || ' kategori=' || (select count(*) from public.jewelry_categories)"
fi
