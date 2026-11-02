import { z } from 'zod';
import { supabase } from '../../shared/lib/supabase';
const attractionSchema = z.object({
  id: z.uuid(), name: z.string(), original_name: z.string().nullable(),
  description: z.string(),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  cities: z.object({ name: z.string() }).nullable(),
  categories: z.object({ slug: z.string(), name: z.string() }).nullable(),
  attraction_images: z.array(z.object({ image_url: z.url(), image_type: z.enum(['replica','original']), attribution: z.string(), license: z.string(), source_url: z.union([z.url(),z.literal('')]), sort_order: z.number() })),
});
export type PlacePhoto = { url:string; type:'replica'|'original'; credit?:string; source?:string };
export type Place = {
  id: string; name: string; original: string | null; description: string;
  latitude: number; longitude: number; city: string; category: string;
  image?: string; imageCredit?: string; imageSource?: string; images?:PlacePhoto[]; source?: string; demo?: boolean;
};
export async function listAttractions(signal: AbortSignal): Promise<Place[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('attractions')
    .select('id,name,original_name,description,latitude,longitude,cities(name),categories(slug,name),attraction_images(image_url,image_type,attribution,license,source_url,sort_order)')
    .eq('publication_status', 'published').order('name').limit(1000).abortSignal(signal);
  if (error) throw new Error(error.message);
  return z.array(attractionSchema).parse(data).map(row => {
    const images = row.attraction_images.sort((a, b) => a.sort_order - b.sort_order).map(image=>({url:image.image_url,type:image.image_type,
      credit:[image.attribution,image.license].filter(Boolean).join(' · ')||undefined,source:image.source_url||undefined}));
    const image = images.find(image => image.type === 'replica') || images[0];
    return {
      id: row.id, name: row.name, original: row.original_name, description: row.description,
      latitude: row.latitude, longitude: row.longitude, city: row.cities?.name || 'Город не указан',
      category: row.categories?.slug || 'other', image: image?.url, images,
      imageCredit:image?.credit, imageSource:image?.source,
    };
  });
}
