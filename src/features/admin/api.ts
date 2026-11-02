import { z } from 'zod';
import { supabase } from '../../shared/lib/supabase';
const httpUrl = z.url().refine(v => /^https?:\/\//.test(v), 'Нужна ссылка http:// или https://');
const nullableCoordinate = (min: number, max: number) => z.preprocess(v => v === '' || v === null ? null : Number(v), z.number().min(min).max(max).nullable());
export const placeSchema = z.object({
  id: z.uuid().optional(), name: z.string().trim().min(1, 'Укажите название'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug: латинские буквы, цифры и дефисы'),
  name_zh: z.string(), original_name: z.string(), description: z.string(),
  city_id: z.union([z.uuid(), z.literal('')]), category_id: z.union([z.uuid(), z.literal('')]),
  latitude: nullableCoordinate(-90, 90), longitude: nullableCoordinate(-180, 180),
  existence_status: z.enum(['unknown','exists','demolished','relocated','not_found']),
  visitor_status: z.enum(['unknown','open','closed','restricted']),
  publication_status: z.enum(['draft','published','archived']),
}).refine(v => (v.latitude === null) === (v.longitude === null), 'Укажите обе координаты или оставьте обе пустыми');
export type PlaceInput = z.infer<typeof placeSchema>;
export type EditorPlace = PlaceInput & { id: string; updated_at: string; last_verified_at: string | null };
export const sourceSchema = z.object({
  source_type: z.enum(['google','baidu','osm','wikidata','official','other']), source_url: httpUrl,
  source_latitude: nullableCoordinate(-90,90), source_longitude: nullableCoordinate(-180,180),
  coordinate_system: z.enum(['WGS84','GCJ02','BD09','unknown']).nullable(), checked_at: z.string().nullable(),
}).refine(v => (v.source_latitude === null) === (v.source_longitude === null), 'Укажите обе исходные координаты');
export type Source = z.infer<typeof sourceSchema>;
export const imageSchema = z.object({image_url:httpUrl, image_type:z.enum(['replica','original']), source_url:httpUrl,
  license:z.string().trim().min(1,'Укажите лицензию'), attribution:z.string().trim().min(1,'Укажите автора'), sort_order:z.number().int()});
export type PlaceImage = z.infer<typeof imageSchema>;
export type Review = { evidence_urls: string[]; notes: string };
export type Lookup = { id: string; name: string; province_id?: string };
export type Log = { id: string; verified_at: string; existence_status: string; visitor_status: string; notes: string; evidence_urls: string[] };
function client() { if (!supabase) throw new Error('Подключение Supabase не настроено.'); return supabase; }
export async function loadCatalog(from = 0) {
  const {data,error,count} = await client().from('attractions').select('*',{count:'exact'}).order('updated_at',{ascending:false}).order('id').range(from,from+49);
  if(error) throw error;
  return { rows:(data || []).map(row => ({...row,name_zh:row.name_zh || '',original_name:row.original_name || '',city_id:row.city_id || '',category_id:row.category_id || ''})) as EditorPlace[], count:count || 0 };
}
export async function loadLookups() {
  const results = await Promise.all(['categories','cities','provinces'].map(table => client().from(table).select('*').order('name').limit(1000)));
  for(const result of results) if(result.error) throw result.error;
  return {categories:results[0].data as Lookup[],cities:results[1].data as Lookup[],provinces:results[2].data as Lookup[]};
}
export async function loadDetails(id: string) {
  const [sources,images,logs] = await Promise.all([
    client().from('sources').select('source_type,source_url,source_latitude,source_longitude,coordinate_system,checked_at').eq('attraction_id',id).order('id'),
    client().from('attraction_images').select('image_url,image_type,source_url,license,attribution,sort_order').eq('attraction_id',id).order('sort_order'),
    client().from('verification_logs').select('*').eq('attraction_id',id).order('verified_at',{ascending:false}).limit(20),
  ]);
  for(const r of [sources,images,logs]) if(r.error) throw r.error;
  return {sources:z.array(sourceSchema).parse(sources.data),images:z.array(imageSchema).parse(images.data),logs:logs.data as Log[]};
}
export async function savePlace(place: PlaceInput, sources: Source[], images: PlaceImage[], review: Review | null, updatedAt: string | null) {
  const parsed = placeSchema.parse(place);
  const parsedSources = z.array(sourceSchema).parse(sources);
  const parsedImages = z.array(imageSchema).parse(images);
  if(review) z.array(httpUrl).min(1,'Добавьте ссылку, подтверждающую проверку').parse(review.evidence_urls);
  const {data,error} = await client().rpc('admin_save_attraction', {p_place:parsed,p_sources:parsedSources,p_images:parsedImages,p_review:review,p_expected_updated_at:updatedAt});
  if(error) throw error;
  return z.object({id:z.uuid(),updated_at:z.string()}).parse(data);
}
export async function addCity(provinceName: string, cityName: string) {
  if(!provinceName.trim() || !cityName.trim()) throw new Error('Укажите провинцию и город.');
  const {data,error} = await client().rpc('admin_upsert_city', {p_province_name:provinceName.trim(),p_city_name:cityName.trim()});
  if(error) throw error;
  return z.uuid().parse(data);
}
const uploadMimeTypes = new Map([['image/jpeg','jpg'],['image/png','png'],['image/webp','webp'],['image/avif','avif']]);
export async function uploadAttractionImage(attractionId: string, file: File) {
  if(!z.uuid().safeParse(attractionId).success) throw new Error('Сначала сохраните объект, затем добавьте фотографию.');
  const extension=uploadMimeTypes.get(file.type);
  if(!extension) throw new Error('Поддерживаются JPEG, PNG, WebP и AVIF.');
  if(file.size===0 || file.size>10*1024*1024) throw new Error('Размер фотографии должен быть от 1 байта до 10 МБ.');
  const path=`${attractionId}/${crypto.randomUUID()}.${extension}`;
  const bucket=client().storage.from('attraction-images');
  const {error}=await bucket.upload(path,file,{cacheControl:'31536000',contentType:file.type,upsert:false});
  if(error) throw error;
  return bucket.getPublicUrl(path).data.publicUrl;
}
export function friendlyError(error: unknown): string {
  if(error instanceof z.ZodError) return error.issues.map(i => i.message).join('. ');
  const e=error as {message?:string;code?:string};
  const messages:Record<string,string>={editor_required:'Требуются права редактора.', invalid_city:'Проверьте названия провинции и города.', concurrent_edit:'Объект уже изменён другим редактором. Откройте его заново перед сохранением.', review_required_for_status_change:'При изменении статусов добавьте запись проверки и подтверждающую ссылку.', review_evidence_required:'Для проверки нужна хотя бы одна ссылка http(s).', publication_requirements:'Для публикации нужны город, категория, источник и проверка существования объекта.', place_not_found:'Объект больше не существует.', 'Сначала сохраните объект, затем добавьте фотографию.':'Сначала сохраните объект, затем добавьте фотографию.', 'Поддерживаются JPEG, PNG, WebP и AVIF.':'Поддерживаются JPEG, PNG, WebP и AVIF.', 'Размер фотографии должен быть от 1 байта до 10 МБ.':'Размер фотографии должен быть от 1 байта до 10 МБ.'};
  if(e.code==='23505') return 'Такой slug, город или ссылка уже существуют.';
  if(e.code==='42501') return 'Недостаточно прав для этого действия.';
  if(e.code==='23514') return 'Проверьте координаты и условия публикации.';
  if(e.message?.includes('Bucket not found')) return 'Хранилище фотографий ещё не подключено. Примените миграцию Storage.';
  return messages[e.message || ''] || 'Не удалось выполнить действие. Проверьте подключение и повторите попытку.';
}
