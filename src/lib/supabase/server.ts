import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isSupabaseConfigured } from './client';

export function createServerSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isSupabaseConfigured() || !url || !anonKey) return null;

  return createClient(url, serviceRoleKey?.trim() || anonKey);
}
