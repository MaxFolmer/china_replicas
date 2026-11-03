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
    create schema storage;
    create table auth.users (id uuid primary key);
    create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id), name text not null);
    alter table storage.objects enable row level security;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema auth, storage to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
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
    });
    await assert.rejects(as('authenticated', alice, () => db.query("update public.attractions set name='hacked' returning id")), /permission denied/);
    await assert.rejects(as('authenticated', alice, () => db.query("insert into public.attractions(slug,name) values ('bad','bad')")), /permission denied/);
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
  await t.test('only editors can write attraction image objects', async () => {
    await assert.rejects(as('authenticated', alice, () => db.query("insert into storage.objects(bucket_id,name) values ('attraction-images','blocked.jpg')")), /row-level security/);
    await as('authenticated', admin, async () => {
      await db.query("insert into storage.objects(bucket_id,name) values ('attraction-images','allowed.jpg')");
    });
  });
  await t.test('editors can read private catalog data but cannot write tables directly', async () => {
    await as('authenticated', admin, async () => {
      assert.equal((await db.query('select * from public.attractions')).rows.length, 2);
      assert.equal((await db.query('select * from public.import_items')).rows.length, 1);
    });
    await assert.rejects(as('authenticated', admin, () => db.query("update public.attractions set description='bypass' where id=$1", [draft])), /permission denied/);
    await assert.rejects(as('authenticated', admin, () => db.query("insert into public.verification_logs(attraction_id,existence_status,visitor_status) values ($1,'exists','open')", [draft])), /permission denied/);
    await assert.rejects(as('authenticated', admin, () => db.query('delete from public.verification_logs where attraction_id=$1', [draft])), /permission denied/);
  });
  await t.test('invalid coordinates and unverified publication are rejected', async () => {
    await assert.rejects(db.query("insert into public.attractions(slug,name,latitude,longitude) values ('invalid','Bad',91,120)"), /check constraint/);
    await assert.rejects(db.query("insert into public.attractions(slug,name,latitude) values ('partial','Bad',30)"), /check constraint/);
    await assert.rejects(db.query("update public.attractions set publication_status='published' where id=$1", [draft]), /check constraint/);
    await assert.rejects(db.query("insert into public.sources(attraction_id,source_type,source_url,source_latitude,source_longitude) values ($1,'baidu','https://example.org/point',30,120)", [draft]), /check constraint/);
  });
  async function save(payload, sources = [], images = [], review = null, expected = null) {
    return (await db.query('select public.admin_save_attraction($1::jsonb,$2::jsonb,$3::jsonb,$4::jsonb,$5::timestamptz) as result',
      [JSON.stringify(payload), JSON.stringify(sources), JSON.stringify(images), review === null ? null : JSON.stringify(review), expected])).rows[0].result;
  }
  async function addCity(province, city) {
    return (await db.query('select public.admin_upsert_city($1,$2) as id', [province, city])).rows[0].id;
  }
  async function createImport(sourceName,filename,items) {
    return (await db.query('select public.admin_create_import_batch($1,$2,$3::jsonb) as id',[sourceName,filename,JSON.stringify(items)])).rows[0].id;
  }
  async function reviewImport(itemId,action,attractionId=null) {
    return (await db.query('select public.admin_review_import_item($1,$2,$3,$4) as result',[itemId,action,attractionId,''])).rows[0].result;
  }
  const newDraft = {slug:'rpc-draft',name:'RPC draft',existence_status:'unknown',visitor_status:'unknown',publication_status:'draft'};
  const source = {source_type:'official',source_url:'https://example.org/evidence'};
  await t.test('editor role RPC cannot be used for privilege escalation', async () => {
    await as('authenticated', alice, async () => assert.equal((await db.query('select public.is_editor() as allowed')).rows[0].allowed, false));
    await as('authenticated', admin, async () => assert.equal((await db.query('select public.is_editor() as allowed')).rows[0].allowed, true));
    await assert.rejects(as('anon', null, () => db.query('select public.is_editor()')), /permission denied/);
    await assert.rejects(as('authenticated', alice, () => save(newDraft)), /editor_required/);
    await assert.rejects(as('authenticated', alice, () => addCity('Test province','Test city')), /editor_required/);
    await assert.rejects(as('anon', null, () => save(newDraft)), /permission denied/);
  });
  await t.test('admin creates a draft and saves sources atomically', async () => {
    await as('authenticated', admin, async () => {
      const result = await save(newDraft,[source]);
      assert.ok(result.id); assert.ok(result.updated_at);
      assert.equal((await db.query('select source_url from public.sources where attraction_id=$1',[result.id])).rows[0].source_url, source.source_url);
      assert.equal((await db.query('select last_verified_at from public.attractions where id=$1',[result.id])).rows[0].last_verified_at,null);
    });
  });
  await t.test('import queue preserves raw rows and rejects regular users', async () => {
    await assert.rejects(as('authenticated',alice,()=>createImport('manual','places.csv',[{name:'Blocked'}])),/editor_required/);
    await as('authenticated',admin,async()=>{
      const id=await createImport('google','places.csv',[{name:'Raw place',latitude:'30.1',custom:{untouched:true}},{name:'Second'}]);
      const rows=(await db.query('select row_number,raw_data from public.import_items where batch_id=$1 order by row_number',[id])).rows;
      assert.equal(rows.length,2);assert.equal(rows[0].row_number,1);assert.deepEqual(rows[0].raw_data.custom,{untouched:true});
    });
    await assert.rejects(as('authenticated',admin,()=>createImport('invalid','bad.csv',[{}])),/invalid_import/);
  });
  await t.test('import review creates safe drafts, links duplicates and rejects rows', async () => {
    const batch=(await db.query("insert into public.import_batches(source,filename,created_by) values ('google','review.csv',$1) returning id",[admin])).rows[0].id;
    const setupItems=[{_import:{name:'Imported draft',latitude:30.1,longitude:120.2,source_url:'https://maps.example/one'}},{_import:{name:'Duplicate'}},{_import:{name:'Reject me'}}];
    for(let i=0;i<setupItems.length;i++)await db.query('insert into public.import_items(batch_id,row_number,raw_data) values ($1,$2,$3)',[batch,i+1,setupItems[i]]);
    const rows=(await db.query('select id from public.import_items where batch_id=$1 order by row_number',[batch])).rows;
    await assert.rejects(as('authenticated',alice,()=>reviewImport(rows[0].id,'create')),/editor_required/);
    let createdId;
    await as('authenticated',admin,async()=>{
      const created=await reviewImport(rows[0].id,'create');createdId=created.attraction_id;
      const draft=(await db.query('select latitude,longitude,publication_status from public.attractions where id=$1',[createdId])).rows[0];
      const sourceRow=(await db.query('select source_latitude,source_longitude,coordinate_system from public.sources where attraction_id=$1',[createdId])).rows[0];
      assert.deepEqual(draft,{latitude:null,longitude:null,publication_status:'draft'});
      assert.deepEqual(sourceRow,{source_latitude:30.1,source_longitude:120.2,coordinate_system:'unknown'});
      await reviewImport(rows[1].id,'link',createdId);
      await reviewImport(rows[2].id,'reject');
      assert.equal((await db.query('select review_status from public.import_items where id=$1',[rows[1].id])).rows[0].review_status,'approved');
      assert.equal((await db.query('select review_status from public.import_items where id=$1',[rows[2].id])).rows[0].review_status,'rejected');
      await assert.rejects(reviewImport(rows[0].id,'create'),/import_item_reviewed/);
    });
  });
  await t.test('image rights metadata may be completed later', async () => {
    await as('authenticated', admin, async () => {
      const result=await save({...newDraft,slug:'photo-draft',name:'Photo draft'},[],[{image_url:'https://example.org/photo.jpg',image_type:'replica',source_url:'',license:'',attribution:'',sort_order:0}]);
      const image=(await db.query('select source_url,license,attribution from public.attraction_images where attraction_id=$1',[result.id])).rows[0];
      assert.deepEqual(image,{source_url:'',license:'',attribution:''});
    });
  });
  await t.test('publication requires source, geography and an evidenced review', async () => {
    await assert.rejects(as('authenticated', admin, () => save({...newDraft,publication_status:'published'})), /publication_requirements/);
    await assert.rejects(as('authenticated', admin, () => save({...newDraft,existence_status:'exists'})), /review_required_for_status_change/);
    await assert.rejects(as('authenticated', admin, () => save(newDraft,[],[],{evidence_urls:[]})), /review_evidence_required/);
    await as('authenticated', admin, async () => {
      const city=await addCity('Test province','Test city');
      assert.equal(await addCity('Test province','Test city'),city);
      const category=(await db.query('select id from public.categories limit 1')).rows[0].id;
      const result=await save({...newDraft,publication_status:'published',existence_status:'exists',latitude:30,longitude:120,city_id:city,category_id:category},[source],[],{evidence_urls:[source.source_url],notes:'Reviewed'});
      const row=(await db.query('select * from public.attractions where id=$1',[result.id])).rows[0];
      const log=(await db.query('select * from public.verification_logs where attraction_id=$1',[result.id])).rows[0];
      assert.equal(row.publication_status,'published');assert.ok(row.last_verified_at);
      assert.equal(log.verified_by,admin);assert.equal(log.notes,'Reviewed');
      assert.equal(new Date(log.verified_at).getTime(),new Date(row.last_verified_at).getTime());
    });
  });
  await t.test('stale saves are rejected instead of overwriting a newer edit', async () => {
    await assert.rejects(as('authenticated',admin,()=>save({...newDraft,id:draft},[],[],null,'2000-01-01T00:00:00Z')), /concurrent_edit/);
    assert.equal((await db.query('select name from public.attractions where id=$1',[draft])).rows[0].name,'Draft');
  });
  await t.test('a child write failure rolls back the object and source changes', async () => {
    const before=(await db.query('select updated_at from public.attractions where id=$1',[draft])).rows[0].updated_at;
    await assert.rejects(as('authenticated',admin,()=>save({...newDraft,id:draft,name:'Must roll back'},[source],[{image_url:'invalid',image_type:'replica',source_url:'https://example.org',license:'CC BY',attribution:'Test'}],null,before)), /check constraint/);
    assert.equal((await db.query('select name from public.attractions where id=$1',[draft])).rows[0].name,'Draft');
    assert.equal((await db.query('select source_url from public.sources where attraction_id=$1',[draft])).rows[0].source_url,'https://example.org/private');
  });

});
