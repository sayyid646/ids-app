-- =====================================================================
-- Migrasi 13: label harga stok barang, foto katalog tanpa latar, dan tanda tangan nota
-- Aman dijalankan ulang.
-- =====================================================================

-- Harga jual setiap model (boleh kosong).
alter table public.products add column if not exists price numeric(14,2);
alter table public.products drop constraint if exists products_price_check;
alter table public.products add constraint products_price_check check (price is null or (price >= 0 and price <= 100000000000));

-- Foto katalog bawaan diganti versi tanpa latar putih (supaya bisa diputar dengan bayangan).
update public.products
set photo_static = regexp_replace(photo_static, '^katalog/v1/(.*)\.jpg$', 'katalog/v2/\1.webp')
where photo_static ~ '^katalog/v1/.*\.jpg$';

create or replace function public.log_products()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v jsonb := jsonb_build_object('kode', new.code, 'nama', new.name);
begin
  if tg_op = 'INSERT' then
    perform public.tulis_log('produk_ditambahkan', 'product', new.id, null, null, null, null, v);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform public.tulis_log('produk_dihapus', 'product', new.id, null, null, null, null, v);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.tulis_log('produk_dipulihkan', 'product', new.id, null, null, null, null, v);
  else
    if new.price is distinct from old.price then
      perform public.tulis_log('harga_produk_diubah', 'product', new.id, null, null, null,
        jsonb_build_object('harga', old.price), v || jsonb_build_object('harga', new.price));
    end if;
    if (old.code, old.name, old.class, old.kind, old.gender, old.notes, old.photo_path)
       is distinct from (new.code, new.name, new.class, new.kind, new.gender, new.notes, new.photo_path) then
      perform public.tulis_log('produk_diubah', 'product', new.id, null, null, null,
        jsonb_build_object('kode', old.code, 'nama', old.name), v);
    end if;
  end if;
  return new;
end $$;

-- Gambar tanda tangan untuk nota (disimpan di penyimpanan "identitas", sama seperti logo).
alter table public.app_settings add column if not exists signature_path text;
