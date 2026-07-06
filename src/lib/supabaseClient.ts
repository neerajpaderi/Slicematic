/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Keys can be provided in the environment (VITE_ prefix for client side access)
// or customized directly in the application's visual settings block.
const getSupabaseConfig = () => {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  const localUrl = localStorage.getItem('slicematic_supabase_url');
  const localKey = localStorage.getItem('slicematic_supabase_key');

  return {
    url: localUrl || envUrl || '',
    key: localKey || envKey || '',
    isCustom: !!(localUrl && localKey),
  };
};

let clientInstance: SupabaseClient | null = null;

/**
 * Lazily gets or initializes the Supabase JS Client.
 * Returns null if Supabase is not configured yet.
 */
export function getSupabaseClient(): SupabaseClient | null {
  const { url, key } = getSupabaseConfig();
  
  if (!url || !key || url === 'MY_SUPABASE_URL' || key === 'MY_SUPABASE_ANON_KEY') {
    return null;
  }

  if (!clientInstance) {
    try {
      clientInstance = createClient(url, key);
    } catch (err) {
      console.error('Error initializing Supabase client:', err);
      return null;
    }
  }

  return clientInstance;
}

/**
 * Returns current configuration values and status.
 */
export function getSupabaseStatus() {
  const { url, key, isCustom } = getSupabaseConfig();
  const configured = !!(url && key && url !== 'MY_SUPABASE_URL' && key !== 'MY_SUPABASE_ANON_KEY');
  return {
    configured,
    url,
    key: key ? `${key.substring(0, 6)}...${key.substring(key.length - 4)}` : '',
    rawKey: key,
    isCustom,
  };
}

/**
 * Saves custom Supabase credentials in local storage.
 */
export function saveSupabaseConfig(url: string, key: string) {
  if (!url || !key) {
    localStorage.removeItem('slicematic_supabase_url');
    localStorage.removeItem('slicematic_supabase_key');
  } else {
    localStorage.setItem('slicematic_supabase_url', url.trim());
    localStorage.setItem('slicematic_supabase_key', key.trim());
  }
  // Clear cached instance
  clientInstance = null;
}
