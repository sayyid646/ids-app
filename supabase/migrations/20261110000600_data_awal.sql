-- =====================================================================
-- Migrasi 6: data awal (aman dijalankan berulang, tidak menggandakan data)
-- =====================================================================

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- 8 kategori perhiasan, urut sesuai permintaan.
insert into public.jewelry_categories (name, sort_order)
select v.name, v.sort_order
from (values
  ('PREMIUM', 1), ('HIGH', 2), ('SULTAN', 3), ('LUXURY', 4),
  ('LIONTIN', 5), ('COUPLE', 6), ('BRACELET', 7), ('SPESIAL ITEM', 8)
) as v(name, sort_order)
where not exists (select 1 from public.jewelry_categories k where upper(k.name) = v.name);

-- 9 slot pengrajin. IDS 008 dan IDS 009 sengaja tanpa nama (belum diberikan).
insert into public.craftsmen (code, name)
select v.code, v.name
from (values
  ('IDS 001', 'Haji Iskandar'),
  ('IDS 002', 'Hafizurrahman'),
  ('IDS 003', 'Rif''an'),
  ('IDS 004', 'Ahmad Rifqi'),
  ('IDS 005', 'Khairin'),
  ('IDS 006', 'Rofii'),
  ('IDS 007', 'Riy'),
  ('IDS 008', null),
  ('IDS 009', null)
) as v(code, name)
where not exists (
  select 1 from public.craftsmen c
  where public.normalize_code(c.code) = v.code and c.deleted_at is null
);
