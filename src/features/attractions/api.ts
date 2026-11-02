import { z } from 'zod';
import { supabase } from '../../shared/lib/supabase';
const attractionSchema = z.object({
  id: z.uuid(), name: z.string(), original_name: z.string().nullable(),
  latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
});
export type Attraction = z.infer<typeof attractionSchema>;
export async function listAttractions(signal: AbortSignal): Promise<Attraction[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('attractions')
    .select('id,name,original_name,latitude,longitude')
    .eq('publication_status', 'published').order('name').limit(1000).abortSignal(signal);
  if (error) throw new Error(error.message);
  return z.array(attractionSchema).parse(data);
}
