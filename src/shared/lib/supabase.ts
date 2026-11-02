import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const validUrl = z.url().safeParse(url).success;
export const configurationError = (url || key) && !(validUrl && key)
  ? 'Проверьте VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY в .env.local.'
  : null;
export const supabase = validUrl && key ? createClient(url!, key) : null;
