/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from './supabaseClient';

export interface StaffUser {
  id?: number;
  username: string;
  role: 'cashier' | 'admin';
  created_at?: string;
}

/**
 * Secures authentication against staff_users table in Supabase.
 * Falls back to local memory / storage for simulation mode if Supabase is not connected.
 */
export async function authenticateStaff(username: string, password: string): Promise<{ success: boolean; role?: 'cashier' | 'admin'; error?: string }> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    // Simulated local storage login fallback
    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (trimmedUser.toLowerCase() === 'admin' && trimmedPass === 'slicematic') {
      return { success: true, role: 'admin' };
    }
    if (trimmedUser.toLowerCase() === 'rajan' && trimmedPass === 'rajan123') {
      return { success: true, role: 'admin' };
    }
    
    // Check locally added staff in local storage
    const storedStaffStr = localStorage.getItem('slicematic_simulated_staff');
    if (storedStaffStr) {
      try {
        const storedStaff = JSON.parse(storedStaffStr);
        const matched = storedStaff.find(
          (s: any) => s.username.toLowerCase() === trimmedUser.toLowerCase() && s.password === trimmedPass
        );
        if (matched) {
          return { success: true, role: matched.role };
        }
      } catch (e) {
        console.error('Error parsing simulated staff users:', e);
      }
    }

    return { 
      success: false, 
      error: 'Incorrect credentials. Simulated options: "Rajan" & "rajan123", or "admin" & "slicematic".' 
    };
  }

  try {
    // 1. Query staff_users table in Supabase
    // Let's first try to select username, password_hash, role (standard column). If we get an error saying column "password_hash" does not exist, we try to select legacy "password" instead!
    let data: any = null;
    let queryError: any = null;

    const firstAttempt = await supabase
      .from('staff_users')
      .select('username, password_hash, role')
      .ilike('username', username.trim())
      .maybeSingle();

    if (firstAttempt.error) {
      const errMsg = firstAttempt.error.message || '';
      if (
        firstAttempt.error.code === 'PGRST116' ||
        errMsg.includes('relation "staff_users" does not exist')
      ) {
        queryError = firstAttempt.error;
      } else if (
        errMsg.includes('column') &&
        (errMsg.includes('password_hash') || errMsg.includes('does not exist'))
      ) {
        // Try legacy password instead
        const secondAttempt = await supabase
          .from('staff_users')
          .select('username, password, role')
          .ilike('username', username.trim())
          .maybeSingle();
        
        if (secondAttempt.error) {
          queryError = secondAttempt.error;
        } else {
          data = secondAttempt.data;
        }
      } else {
        queryError = firstAttempt.error;
      }
    } else {
      data = firstAttempt.data;
    }

    if (queryError) {
      console.warn('Error querying staff_users table:', queryError.message);
      if (queryError.code === 'PGRST116' || queryError.message.includes('relation "staff_users" does not exist')) {
        return { 
          success: false, 
          error: 'The "staff_users" table does not exist in your Supabase DB. Please run the updated SQL Schema in your Supabase SQL Editor.' 
        };
      }
      return { success: false, error: `Authentication error: ${queryError.message}` };
    }

    if (!data) {
      return { success: false, error: 'User not found in staff_users.' };
    }

    const retrievedPassword = data.password !== undefined ? data.password : data.password_hash;

    // 2. Clear password verification
    if (retrievedPassword === password) {
      return { success: true, role: data.role as 'cashier' | 'admin' };
    } else {
      return { success: false, error: 'Invalid password.' };
    }
  } catch (err: any) {
    console.error('Database connection error during auth:', err);
    return { success: false, error: `Authentication failed: ${err.message || err}` };
  }
}

/**
 * Writes a new staff user into Supabase table staff_users.
 * Requires admin privileges.
 */
export async function addStaffUser(username: string, password: string, role: 'cashier' | 'admin'): Promise<{ success: boolean; error?: string }> {
  const trimmedUser = username.trim();
  const trimmedPass = password.trim();

  if (!trimmedUser || trimmedUser.length < 2) {
    return { success: false, error: 'Username must be at least 2 characters.' };
  }
  if (!trimmedPass || trimmedPass.length < 4) {
    return { success: false, error: 'Password must be at least 4 characters.' };
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    // Save to local storage for simulation mode
    const storedStaffStr = localStorage.getItem('slicematic_simulated_staff');
    const storedStaff = storedStaffStr ? JSON.parse(storedStaffStr) : [];
    
    // Check duplication
    if (
      storedStaff.some((s: any) => s.username.toLowerCase() === trimmedUser.toLowerCase()) || 
      trimmedUser.toLowerCase() === 'admin' || 
      trimmedUser.toLowerCase() === 'rajan'
    ) {
      return { success: false, error: 'Username already exists.' };
    }

    storedStaff.push({ username: trimmedUser, password: trimmedPass, role });
    localStorage.setItem('slicematic_simulated_staff', JSON.stringify(storedStaff));

    return { success: true };
  }

  try {
    // Try using 'password_hash' first as it matches our official schema
    const firstInsert = await supabase
      .from('staff_users')
      .insert({
        username: trimmedUser,
        password_hash: trimmedPass,
        role
      });

    if (firstInsert.error) {
      const errMsg = firstInsert.error.message || '';
      if (
        errMsg.includes('column') &&
        (errMsg.includes('password_hash') || errMsg.includes('does not exist'))
      ) {
        // Fallback to legacy 'password' column if password_hash doesn't exist
        const secondInsert = await supabase
          .from('staff_users')
          .insert({
            username: trimmedUser,
            password: trimmedPass,
            role
          });

        if (secondInsert.error) {
          if (secondInsert.error.code === '23505') { // unique_violation
            return { success: false, error: 'Username already exists in the system.' };
          }
          return { success: false, error: secondInsert.error.message };
        }
      } else {
        if (firstInsert.error.code === '23505') { // unique_violation
          return { success: false, error: 'Username already exists in the system.' };
        }
        return { success: false, error: firstInsert.error.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error inserting staff user:', err);
    return { success: false, error: err.message || err };
  }
}

/**
 * Gets list of staff users (admin view)
 */
export async function getStaffUsers(): Promise<StaffUser[]> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    const localDefaults: StaffUser[] = [
      { username: 'Rajan', role: 'admin' },
      { username: 'admin', role: 'admin' }
    ];
    const storedStaffStr = localStorage.getItem('slicematic_simulated_staff');
    if (storedStaffStr) {
      try {
        const stored = JSON.parse(storedStaffStr);
        return [...localDefaults, ...stored.map((s: any) => ({ username: s.username, role: s.role }))];
      } catch (e) {
        return localDefaults;
      }
    }
    return localDefaults;
  }

  try {
    const { data, error } = await supabase
      .from('staff_users')
      .select('id, username, role, created_at')
      .order('id', { ascending: true });

    if (error) {
      console.warn('Error fetching staff list from Supabase:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error loading staff:', err);
    return [];
  }
}
