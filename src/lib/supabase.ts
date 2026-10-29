/**
 * Supabase client.
 *
 * The anon key is public by design - it ships in the bundle and anyone can read
 * it. Row Level Security is the security boundary, not the key. The service_role
 * key must never appear here; it bypasses RLS entirely.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True when the app has been given a backend.
 *
 * Checked rather than assumed so an unconfigured build shows a clear setup screen
 * instead of failing with a network error that looks like an outage.
 */
export const isConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
    auth: {
      // Password auth, so there is no callback URL to parse. Kept off to avoid
      // the client inspecting the URL on every load for a flow that is not used.
      detectSessionInUrl: false,
      persistSession: true,
      autoRefreshToken: true,
    },
  })
  : null;

/** Narrowing helper so call sites do not each repeat the null check. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }
  return supabase;
}
