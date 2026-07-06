/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let serverUrl = '';
let serverKey = '';

/**
 * Dynamically registers backend-injected Supabase credentials at runtime.
 */
export function setServerSupabaseConfig(url: string, key: string) {
  serverUrl = url || '';
  serverKey = key || '';
  clientInstance = null; // Force client recreation
}

// Keys can be provided in the environment (VITE_ prefix for client side access)
// or customized directly in the application's visual settings block.
const getSupabaseConfig = () => {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  const localUrl = localStorage.getItem('slicematic_supabase_url');
  const localKey = localStorage.getItem('slicematic_supabase_key');

  return {
    url: localUrl || serverUrl || envUrl || '',
    key: localKey || serverKey || envKey || '',
    isCustom: !!(localUrl && localKey) || !!(serverUrl && serverKey),
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

/**
 * Tests direct connection/credentials against a Supabase endpoint before saving them permanently.
 */
export async function testSupabaseConnection(url: string, key: string): Promise<{ success: boolean; message: string }> {
  if (!url || !key) {
    return { success: false, message: 'Please provide both a valid URL and API Key.' };
  }
  try {
    const tempClient = createClient(url.trim(), key.trim());
    // Try performing a minimal select query on a standard table
    const { data, error } = await tempClient.from('menu_items').select('id').limit(1);
    
    if (error) {
      // If the table doesn't exist yet, but we get a PGRST116, relation error, or access denied,
      // it means the URL and key are authentic, just that tables are missing.
      const msg = error.message || '';
      
      if (msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('schema public')) {
        return {
          success: false,
          message: 'Database connection failed: "permission denied for schema public". This means your Supabase "anon" or "authenticated" role does not have USAGE/SELECT permissions on the public schema. To fix this, run the following statement in your Supabase SQL Editor and try again:\n\nGRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;\nGRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;\nGRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;'
        };
      }

      if (msg.toLowerCase().includes('sequence') || msg.toLowerCase().includes('permission denied for sequence')) {
        return {
          success: false,
          message: 'Database sequence permission error: "permission denied for sequence". This means your API key cannot increment SERIAL IDs (primary keys). To fix this, run the following command in your Supabase SQL Editor:\n\nGRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;\nALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;'
        };
      }

      if (
        error.code === 'PGRST116' || 
        msg.includes('relation') || 
        msg.includes('does not exist') || 
        msg.includes('404')
      ) {
        return {
          success: true,
          message: 'Connected to Supabase! However, the "menu_items" table was not found. Please initialize the database schema in the Admin panel.'
        };
      }
      return {
        success: false,
        message: `Database connection error: ${error.message}`
      };
    }
    
    return {
      success: true,
      message: 'Connection successful! Verified access to the "menu_items" table.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to connect: ${err?.message || err}`
    };
  }
}

