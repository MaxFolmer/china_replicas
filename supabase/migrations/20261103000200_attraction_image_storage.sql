-- Publicly displayed editorial photos. Only users listed in private.admins may
-- mutate this bucket; accepted formats exclude SVG and other active content.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attraction-images', 'attraction-images', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy attraction_images_editor_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'attraction-images' and (select private.is_admin()));

create policy attraction_images_editor_update on storage.objects
for update to authenticated
using (bucket_id = 'attraction-images' and (select private.is_admin()))
with check (bucket_id = 'attraction-images' and (select private.is_admin()));

create policy attraction_images_editor_delete on storage.objects
for delete to authenticated
using (bucket_id = 'attraction-images' and (select private.is_admin()));
