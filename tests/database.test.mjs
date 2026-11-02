import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL engine; auth scaffolding models JWT identity, not Supabase Auth itself.
test('migrations, coordinate constraints and access boundaries', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  const migrations = new URL('../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(migrations)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, migrations), 'utf8'));
  }
  await db.exec(await readFile(new URL('../supabase/seed.sql', import.meta.url), 'utf8'));
  const admin = '10000000-0000-4000-8000-000000000001';
  const alice = '10000000-0000-4000-8000-000000000002';
  const bob = '10000000-0000-4000-8000-000000000003';
  const published = '20000000-0000-4000-8000-000000000001';
  const draft = '20000000-0000-4000-8000-000000000002';
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [admin, alice, bob]);
  await db.query('insert into private.admins (user_id) values ($1)', [admin]);
  await db.query(`insert into public.attractions (id,slug,name,latitude,longitude,existence_status,publication_status,last_verified_at)
    values ($1,'published','Published',30,120,'exists','published',now()),
      ($2,'draft','Draft',null,null,'unknown','draft',null)`, [published, draft]);
  await db.query(`insert into public.sources (attraction_id,source_type,source_url) values
    ($1,'official','https://example.org/public'),($2,'other','https://example.org/private')`, [published, draft]);
  const initialBatch = (await db.query("insert into public.import_batches(source,filename) values ('google','private.json') returning id")).rows[0].id;
  await db.query('insert into public.import_items(batch_id,row_number,raw_data) values ($1,1,$2)', [initialBatch, {private:'original archive'}]);
  await db.query("insert into public.verification_logs(attraction_id,existence_status,visitor_status,notes) values ($1,'unknown','unknown','editor notes')", [draft]);
  async function as(role, userId, action) {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId || '']);
      return await action();
    } finally { await db.exec('rollback'); }
  }
  await t.test('anonymous visitors see published places and their sources only', async () => {
    await as('anon', null, async () => {
      assert.deepEqual((await db.query('select name from public.attractions')).rows, [{ name: 'Published' }]);
      assert.equal((await db.query('select * from public.sources')).rows.length, 1);
      assert.equal((await db.query('select * from public.categories')).rows.length, 4);
    });
    await assert.rejects(as('anon', null, () => db.query('select * from public.import_items')), /permission denied/);
    await assert.rejects(as('anon', null, () => db.query("insert into public.attractions(slug,name) values ('bad','bad')")), /permission denied/);
  });
  await t.test('regular users cannot edit the catalog, see raw imports or promote themselves', async () => {
    await as('authenticated', alice, async () => {
      assert.equal((await db.query('select * from public.attractions')).rows.length, 1);
      assert.equal((await db.query('select * from public.import_items')).rows.length, 0);
      assert.equal((await db.query('select * from public.verification_logs')).rows.length, 0);
      assert.equal((await db.query("update public.attractions set name='hacked' returning id")).rows.length, 0);
    });
    await assert.rejects(as('authenticated', alice, () => db.query("insert into public.attractions(slug,name) values ('bad','bad')")), /row-level security/);
    await assert.rejects(as('authenticated', alice, () => db.query('insert into private.admins values ($1)', [alice])), /permission denied/);
  });
  await t.test('favorites belong to their owner and require a published attraction', async () => {
    await db.query('insert into public.favorites(user_id,attraction_id) values ($1,$2)', [bob,published]);
    await as('authenticated', alice, async () => {
      assert.equal((await db.query('select * from public.favorites')).rows.length, 0);
      await db.query('insert into public.favorites(user_id,attraction_id) values ($1,$2)', [alice,published]);
      assert.equal((await db.query('select * from public.favorites')).rows.length, 1);
      assert.equal((await db.query('delete from public.favorites where user_id=$1 returning *', [bob])).rows.length, 0);
    });
    await assert.rejects(as('authenticated', alice, () => db.query('insert into public.favorites(user_id,attraction_id) values ($1,$2)', [bob,draft])), /row-level security/);
    await assert.rejects(as('authenticated', alice, () => db.query('insert into public.favorites(user_id,attraction_id) values ($1,$2)', [alice,draft])), /row-level security/);
  });
  await t.test('admin can edit drafts and retain original import payloads', async () => {
    await as('authenticated', admin, async () => {
      assert.equal((await db.query('select * from public.attractions')).rows.length, 2);
      assert.equal((await db.query("update public.attractions set description='reviewed' where id=$1 returning id", [draft])).rows.length, 1);
      const batch = (await db.query("insert into public.import_batches(source,filename) values ('baidu','sample.json') returning id")).rows[0].id;
      await db.query('insert into public.import_items(batch_id,row_number,raw_data) values ($1,1,$2)', [batch,{raw:'unchanged'}]);
      assert.equal((await db.query('select * from public.import_items')).rows.length, 2);
    });
  });
  await t.test('invalid coordinates and unverified publication are rejected', async () => {
    await assert.rejects(db.query("insert into public.attractions(slug,name,latitude,longitude) values ('invalid','Bad',91,120)"), /check constraint/);
    await assert.rejects(db.query("insert into public.attractions(slug,name,latitude) values ('partial','Bad',30)"), /check constraint/);
    await assert.rejects(db.query("update public.attractions set publication_status='published' where id=$1", [draft]), /check constraint/);
    await assert.rejects(db.query("insert into public.sources(attraction_id,source_type,source_url,source_latitude,source_longitude) values ($1,'baidu','https://example.org/point',30,120)", [draft]), /check constraint/);
  });
});
