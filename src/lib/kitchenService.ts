/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from './supabaseClient';

export interface KitchenState {
  status: 'Pending' | 'Preparing' | 'Ready' | 'Completed';
  approved: boolean;
  approvedAt: string; // ISO string
  tokenNumber: string; // "T-101"
}

/**
 * Helper to update order status in Supabase if connected
 */
async function syncStatusToSupabase(orderId: string, status: 'Placed' | 'Preparing' | 'Ready' | 'Completed') {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    const numericId = parseInt(orderId, 10);
    if (isNaN(numericId)) return;

    const { error } = await supabase
      .from('order_status')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('order_id', numericId);

    if (error) {
      console.warn('Could not sync status to Supabase order_status table:', error.message);
    }
  } catch (e) {
    console.warn('Failed to sync status to Supabase:', e);
  }
}

/**
 * Gets the kitchen tracking state for a specific order.
 */
export function getKitchenStateForOrder(orderId: string): KitchenState {
  try {
    const stored = localStorage.getItem('slicematic_kitchen_states');
    const states = stored ? JSON.parse(stored) : {};
    if (states[orderId]) {
      return states[orderId];
    }
  } catch (e) {
    console.error('Error reading kitchen states:', e);
  }
  return {
    status: 'Pending',
    approved: false,
    approvedAt: '',
    tokenNumber: '',
  };
}

/**
 * Saves/updates the kitchen tracking state for a specific order.
 */
export function saveKitchenStateForOrder(orderId: string, state: KitchenState) {
  try {
    const stored = localStorage.getItem('slicematic_kitchen_states');
    const states = stored ? JSON.parse(stored) : {};
    states[orderId] = state;
    localStorage.setItem('slicematic_kitchen_states', JSON.stringify(states));
    
    // Dispatch local storage event for multi-tab/frame synchronization
    window.dispatchEvent(new Event('storage'));
  } catch (e) {
    console.error('Error saving kitchen state:', e);
  }
}

/**
 * Allocates a new sequential token number starting from T-100.
 */
export function allocateTokenNumber(): string {
  try {
    const currentStr = localStorage.getItem('slicematic_token_counter');
    let current = currentStr ? parseInt(currentStr, 10) : 100;
    current += 1;
    localStorage.setItem('slicematic_token_counter', current.toString());
    return `T-${current}`;
  } catch (e) {
    console.error('Error allocating token number:', e);
    return `T-${Math.floor(100 + Math.random() * 900)}`;
  }
}

/**
 * Approves a pending order from the kitchen desk, sets a 5-minute timer and allocates a token.
 */
export function approveOrderInKitchen(orderId: string): KitchenState {
  const currentState = getKitchenStateForOrder(orderId);
  if (currentState.approved) {
    return currentState;
  }
  
  const token = allocateTokenNumber();
  const newState: KitchenState = {
    status: 'Preparing',
    approved: true,
    approvedAt: new Date().toISOString(),
    tokenNumber: token,
  };
  
  saveKitchenStateForOrder(orderId, newState);
  
  // Sync status to Supabase as 'Preparing'
  syncStatusToSupabase(orderId, 'Preparing');

  return newState;
}

/**
 * Updates the preparation status of an approved order.
 */
export function updateKitchenOrderStatus(
  orderId: string,
  status: 'Pending' | 'Preparing' | 'Ready' | 'Completed'
): KitchenState {
  const currentState = getKitchenStateForOrder(orderId);
  const newState: KitchenState = {
    ...currentState,
    status,
  };
  saveKitchenStateForOrder(orderId, newState);

  // Sync state transitions to Supabase (Pending doesn't have direct counterpart, so map appropriately)
  const dbStatus: 'Placed' | 'Preparing' | 'Ready' | 'Completed' = 
    status === 'Pending' ? 'Placed' : status;
  syncStatusToSupabase(orderId, dbStatus);

  return newState;
}
