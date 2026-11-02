# Project conventions

- Use React + TypeScript + Vite, Leaflet, and Supabase. Keep features under src/features.
- Commands: npm ci, npm run dev, npm run check.
- Record schema changes in new supabase/migrations/*.sql files. Never edit an applied migration.
- Enable RLS on all exposed tables. Test anonymous, authenticated, admin and cross-user access when changing policies.
- private.admins is managed through SQL by the project owner, never by the browser or user_metadata.
- Canonical coordinates are WGS84. Preserve original coordinates and their source system. Never guess GCJ02/BD09 conversion from a filename alone.
- Keep imports in import_batches/import_items until reviewed. Do not invent locations or verification evidence.
- Do not expose service-role keys, passwords, source archives or personal data in frontend/Git.
- npm run db:reset destroys LOCAL database contents. Do not reset a linked cloud project.
- Public deployments, remote migrations, and production data changes must be explicitly requested.
- npm test uses embedded PostgreSQL with auth scaffolding; it does not validate Supabase Auth/Storage/API behavior. Run integration checks against actual Supabase before release.
