-- =====================================================================
-- Migrasi 8: hak akses (dijalankan paling akhir)
--   * anon (belum login): tidak bisa apa-apa.
--   * authenticated: boleh memanggil, tetapi RLS dan pastikan_admin()
--     memastikan hanya admin yang benar-benar mendapat data.
--   * Tidak ada hak DELETE untuk data usaha.
-- =====================================================================

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon;

grant usage on schema public to authenticated;

grant select, update                 on public.profiles           to authenticated;
grant select, update                 on public.app_settings       to authenticated;
grant select, insert, update         on public.jewelry_categories to authenticated;
grant select, insert, update         on public.craftsmen          to authenticated;
grant select, insert, update         on public.orders             to authenticated;
grant select, insert, update         on public.order_items        to authenticated;
grant select                         on public.activity_logs      to authenticated;
grant select on public.v_items, public.v_orders, public.v_craftsmen to authenticated;

-- Kolom peran tidak boleh diubah dari aplikasi (dijaga juga oleh trigger).
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

grant execute on all functions in schema public to authenticated;
-- Fungsi khusus pemilik database, tidak boleh dipanggil dari aplikasi.
revoke execute on function public.jadikan_admin(text) from authenticated;
revoke execute on function public.tulis_log(text, text, uuid, uuid, uuid, uuid, jsonb, jsonb, text) from authenticated;

-- Objek yang dibuat nanti tidak otomatis terbuka untuk anon.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
