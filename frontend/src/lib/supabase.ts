import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process.env || {});
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://placeholder-project.supabase.co';
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'placeholder-anon-key';

export const isSupabaseConfigured: boolean = Boolean(
  env.VITE_SUPABASE_URL &&
  env.VITE_SUPABASE_PUBLISHABLE_KEY &&
  !env.VITE_SUPABASE_URL.includes('placeholder')
);

export const configuredSupabaseUrl: string = env.VITE_SUPABASE_URL || '';
export const hasPlaceholderSupabaseUrl: boolean =
  !env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL.includes('placeholder');

/**
 * Returns a masked representation of the publishable/anon key for secure display.
 * Secret service-role keys must NEVER be placed in frontend code.
 */
export function getMaskedPublishableKey(rawKey?: string): string {
  const key = rawKey !== undefined ? rawKey : (env.VITE_SUPABASE_PUBLISHABLE_KEY || '');
  if (!key || key.includes('placeholder')) {
    return 'Not configured in .env.local';
  }
  if (key.length <= 16) {
    return '••••••••••••••••';
  }
  const prefix = key.slice(0, 15);
  return `${prefix}••••••••••••••••••••`;
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);