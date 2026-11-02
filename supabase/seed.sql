-- Only taxonomy. No fictional locations or unverified attractions in the public catalog.
insert into public.categories (slug, name) values
  ('landmark-replica', 'Копия достопримечательности'),
  ('themed-town', 'Тематический город'),
  ('theme-park', 'Тематический парк'),
  ('architectural-stylization', 'Архитектурная стилизация')
on conflict (slug) do nothing;
