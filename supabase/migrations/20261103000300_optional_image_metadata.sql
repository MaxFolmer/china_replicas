-- Rights metadata can be completed later during editorial review. The image URL
-- and type remain mandatory; empty optional fields are accepted from the form.
alter table public.attraction_images
  drop constraint if exists attraction_images_source_url_check,
  drop constraint if exists attraction_images_license_check;

alter table public.attraction_images
  add constraint attraction_images_source_url_check
  check (source_url = '' or source_url ~ '^https?://'),
  add constraint attraction_images_license_check
  check (license = '' or length(trim(license)) > 0);
