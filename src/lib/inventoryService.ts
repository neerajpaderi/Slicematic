/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from './supabaseClient';

export interface InventoryIngredient {
  inventory_id: number;
  ingredient_name: string;
  unit: 'unit' | 'liter' | 'kg';
  current_stock: number;
  reorder_threshold: number;
  updated_at?: string;
}

export interface RecipeMapping {
  ingredient_map_id: number;
  item_id: number;
  item_name?: string;
  item_category?: string;
  inventory_id: number;
  ingredient_name?: string;
  quantity_required: number; // e.g., 1 base, 0.15L sauce, 0.05kg bell pepper
}

export interface InventoryTransaction {
  transaction_id?: number;
  order_id: number;
  inventory_id: number;
  ingredient_name?: string;
  quantity_used: number;
  transaction_time?: string;
}

// Default ingredients to seed if empty
const DEFAULT_INGREDIENTS: Omit<InventoryIngredient, 'inventory_id'>[] = [
  { ingredient_name: 'Pizza Base', unit: 'unit', current_stock: 100, reorder_threshold: 20 },
  { ingredient_name: 'Marinara Sauce', unit: 'liter', current_stock: 15.0, reorder_threshold: 3.0 },
  { ingredient_name: 'Mozzarella Cheese', unit: 'kg', current_stock: 12.5, reorder_threshold: 2.5 },
  { ingredient_name: 'Bell Pepper Topping', unit: 'kg', current_stock: 4.5, reorder_threshold: 1.0 },
  { ingredient_name: 'Red Onion Topping', unit: 'kg', current_stock: 5.0, reorder_threshold: 1.0 },
  { ingredient_name: 'Paneer Cubes Topping', unit: 'kg', current_stock: 6.0, reorder_threshold: 1.5 },
  { ingredient_name: 'Jalapenos Topping', unit: 'kg', current_stock: 3.0, reorder_threshold: 0.5 },
  { ingredient_name: 'Pepperoni Slices', unit: 'kg', current_stock: 8.0, reorder_threshold: 1.5 },
];

/**
 * Initializes and retrieves local fallback inventory states.
 */
function getLocalInventoryState() {
  const localInv = localStorage.getItem('slicematic_inventory');
  if (localInv) {
    try {
      return JSON.parse(localInv) as InventoryIngredient[];
    } catch {
      // JSON corruption
    }
  }

  // Set default state with pseudo IDs
  const state: InventoryIngredient[] = DEFAULT_INGREDIENTS.map((item, idx) => ({
    ...item,
    inventory_id: idx + 1,
    updated_at: new Date().toISOString()
  }));
  localStorage.setItem('slicematic_inventory', JSON.stringify(state));
  return state;
}

function saveLocalInventoryState(state: InventoryIngredient[]) {
  localStorage.setItem('slicematic_inventory', JSON.stringify(state));
}

/**
 * Initializes and retrieves local fallback recipe mapping states.
 */
function getLocalRecipesState(): RecipeMapping[] {
  const localRec = localStorage.getItem('slicematic_recipe_mappings');
  if (localRec) {
    try {
      return JSON.parse(localRec) as RecipeMapping[];
    } catch {
      // JSON corruption
    }
  }

  // Pre-seed some logical mappings for common pizza items
  // Real recipe values mapping to our default ingredients:
  // Item ID matches menu items, but locally we will map by item name for safety.
  // Thin Crust (base) -> Pizza Base (1 unit)
  // Margherita (pizza) -> Marinara Sauce (0.12 liters), Mozzarella Cheese (0.15 kg)
  // Bell Pepper (topping) -> Bell Pepper Topping (0.05 kg)
  const state: RecipeMapping[] = [
    { ingredient_map_id: 1, item_id: 1, item_name: 'Thin Crust', item_category: 'base', inventory_id: 1, ingredient_name: 'Pizza Base', quantity_required: 1.0 },
    { ingredient_map_id: 2, item_id: 2, item_name: 'Thick Crust', item_category: 'base', inventory_id: 1, ingredient_name: 'Pizza Base', quantity_required: 1.0 },
    { ingredient_map_id: 3, item_id: 3, item_name: 'Cheese Burst', item_category: 'base', inventory_id: 1, ingredient_name: 'Pizza Base', quantity_required: 1.0 },
    { ingredient_map_id: 4, item_id: 101, item_name: 'Margherita', item_category: 'pizza', inventory_id: 2, ingredient_name: 'Marinara Sauce', quantity_required: 0.12 },
    { ingredient_map_id: 5, item_id: 101, item_name: 'Margherita', item_category: 'pizza', inventory_id: 3, ingredient_name: 'Mozzarella Cheese', quantity_required: 0.15 },
    { ingredient_map_id: 6, item_id: 102, item_name: 'Double Cheese Margherita', item_category: 'pizza', inventory_id: 2, ingredient_name: 'Marinara Sauce', quantity_required: 0.12 },
    { ingredient_map_id: 7, item_id: 102, item_name: 'Double Cheese Margherita', item_category: 'pizza', inventory_id: 3, ingredient_name: 'Mozzarella Cheese', quantity_required: 0.25 },
    { ingredient_map_id: 8, item_id: 103, item_name: 'Peppy Paneer', item_category: 'pizza', inventory_id: 2, ingredient_name: 'Marinara Sauce', quantity_required: 0.10 },
    { ingredient_map_id: 9, item_id: 103, item_name: 'Peppy Paneer', item_category: 'pizza', inventory_id: 3, ingredient_name: 'Mozzarella Cheese', quantity_required: 0.15 },
    { ingredient_map_id: 10, item_id: 103, item_name: 'Peppy Paneer', item_category: 'pizza', inventory_id: 6, ingredient_name: 'Paneer Cubes Topping', quantity_required: 0.08 },
    { ingredient_map_id: 11, item_id: 201, item_name: 'Bell Pepper', item_category: 'topping', inventory_id: 4, ingredient_name: 'Bell Pepper Topping', quantity_required: 0.05 },
    { ingredient_map_id: 12, item_id: 202, item_name: 'Onion', item_category: 'topping', inventory_id: 5, ingredient_name: 'Red Onion Topping', quantity_required: 0.05 },
    { ingredient_map_id: 13, item_id: 203, item_name: 'Paneer', item_category: 'topping', inventory_id: 6, ingredient_name: 'Paneer Cubes Topping', quantity_required: 0.06 },
    { ingredient_map_id: 14, item_id: 204, item_name: 'Jalapenos', item_category: 'topping', inventory_id: 7, ingredient_name: 'Jalapenos Topping', quantity_required: 0.04 },
    { ingredient_map_id: 15, item_id: 205, item_name: 'Pepperoni', item_category: 'topping', inventory_id: 8, ingredient_name: 'Pepperoni Slices', quantity_required: 0.07 },
  ];

  localStorage.setItem('slicematic_recipe_mappings', JSON.stringify(state));
  return state;
}

function saveLocalRecipesState(state: RecipeMapping[]) {
  localStorage.setItem('slicematic_recipe_mappings', JSON.stringify(state));
}

/**
 * Retrieves local fallback transactions state.
 */
function getLocalTransactionsState(): InventoryTransaction[] {
  const localTx = localStorage.getItem('slicematic_inventory_transactions');
  return localTx ? JSON.parse(localTx) : [];
}

function saveLocalTransactionsState(state: InventoryTransaction[]) {
  localStorage.setItem('slicematic_inventory_transactions', JSON.stringify(state));
}

// =============================================================================
// PUBLIC API SERVICE EXPORTS
// =============================================================================

/**
 * Fetch all ingredients from live Supabase inventory table or fallback local storage.
 */
export async function getInventory(): Promise<InventoryIngredient[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return getLocalInventoryState();
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('inventory_id', { ascending: true });

    if (error) {
      console.warn('Error fetching Supabase inventory, using local simulation:', error.message);
      return getLocalInventoryState();
    }

    if (!data || data.length === 0) {
      // Seed Supabase with defaults if empty
      const seeded = DEFAULT_INGREDIENTS.map(item => ({
        ingredient_name: item.ingredient_name,
        unit: item.unit,
        current_stock: item.current_stock,
        reorder_threshold: item.reorder_threshold
      }));

      const { data: inserted, error: insertErr } = await supabase
        .from('inventory')
        .insert(seeded)
        .select();

      if (insertErr) {
        console.error('Error auto-seeding Supabase inventory:', insertErr);
        return getLocalInventoryState();
      }
      return inserted || [];
    }

    return data;
  } catch (err) {
    console.error('Exception fetching inventory:', err);
    return getLocalInventoryState();
  }
}

/**
 * Updates stock levels for a specific ingredient.
 */
export async function updateInventoryStock(id: number, currentStock: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const state = getLocalInventoryState();
    const idx = state.findIndex(item => item.inventory_id === id);
    if (idx !== -1) {
      state[idx].current_stock = currentStock;
      state[idx].updated_at = new Date().toISOString();
      saveLocalInventoryState(state);
      return true;
    }
    return false;
  }

  try {
    const { error } = await supabase
      .from('inventory')
      .update({ current_stock: currentStock, updated_at: new Date().toISOString() })
      .eq('inventory_id', id);

    if (error) {
      console.error('Failed to update Supabase inventory stock:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Exception updating inventory stock:', err);
    return false;
  }
}

/**
 * Adds a new custom raw ingredient.
 */
export async function addInventoryIngredient(
  name: string,
  unit: 'unit' | 'liter' | 'kg',
  current: number,
  threshold: number
): Promise<{ success: boolean; ingredient?: InventoryIngredient; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const state = getLocalInventoryState();
    const newId = state.length > 0 ? Math.max(...state.map(s => s.inventory_id)) + 1 : 1;
    const newIngredient: InventoryIngredient = {
      inventory_id: newId,
      ingredient_name: name,
      unit,
      current_stock: current,
      reorder_threshold: threshold,
      updated_at: new Date().toISOString()
    };
    state.push(newIngredient);
    saveLocalInventoryState(state);
    return { success: true, ingredient: newIngredient };
  }

  try {
    const { data, error } = await supabase
      .from('inventory')
      .insert({
        ingredient_name: name,
        unit,
        current_stock: current,
        reorder_threshold: threshold
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true, ingredient: data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown database error' };
  }
}

/**
 * Removes a raw ingredient.
 */
export async function removeInventoryIngredient(id: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const state = getLocalInventoryState();
    const filtered = state.filter(item => item.inventory_id !== id);
    saveLocalInventoryState(filtered);
    return true;
  }

  try {
    const { error } = await supabase
      .from('inventory')
      .delete()
      .eq('inventory_id', id);

    return !error;
  } catch (err) {
    console.error('Exception removing inventory ingredient:', err);
    return false;
  }
}

/**
 * Fetch all recipe mappings linking menu items to raw ingredients.
 */
export async function getRecipeMappings(): Promise<RecipeMapping[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return getLocalRecipesState();
  }

  try {
    // Try to perform a rich join
    const { data, error } = await supabase
      .from('menu_item_ingredients')
      .select(`
        ingredient_map_id,
        item_id,
        inventory_id,
        quantity_required
      `);

    if (error) {
      console.warn('Could not select menu_item_ingredients, using simulated state:', error.message);
      return getLocalRecipesState();
    }

    // Since joined details are helpful, fetch menu_items and inventory in parallel to build mappings
    const { data: menuItems } = await supabase.from('menu_items').select('id, name, category');
    const { data: inventory } = await supabase.from('inventory').select('inventory_id, ingredient_name');

    const mapped: RecipeMapping[] = data.map((item: any) => {
      const menuObj = menuItems?.find((m: any) => m.id === item.item_id);
      const invObj = inventory?.find((i: any) => i.inventory_id === item.inventory_id);

      return {
        ingredient_map_id: item.ingredient_map_id,
        item_id: item.item_id,
        item_name: menuObj?.name || `Item #${item.item_id}`,
        item_category: menuObj?.category || 'pizza',
        inventory_id: item.inventory_id,
        ingredient_name: invObj?.ingredient_name || `Ingredient #${item.inventory_id}`,
        quantity_required: parseFloat(item.quantity_required) || 0,
      };
    });

    return mapped.length > 0 ? mapped : getLocalRecipesState();
  } catch (err) {
    console.error('Exception getting recipe mappings:', err);
    return getLocalRecipesState();
  }
}

/**
 * Adds a new recipe mapped requirement.
 */
export async function addRecipeMapping(
  itemId: number,
  inventoryId: number,
  quantityRequired: number,
  itemName?: string,
  itemCategory?: string
): Promise<{ success: boolean; mapping?: RecipeMapping; error?: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const recipes = getLocalRecipesState();
    const ingredients = getLocalInventoryState();
    const ingName = ingredients.find(i => i.inventory_id === inventoryId)?.ingredient_name || 'Ingredient';

    const newMapId = recipes.length > 0 ? Math.max(...recipes.map(r => r.ingredient_map_id)) + 1 : 1;
    const newMapping: RecipeMapping = {
      ingredient_map_id: newMapId,
      item_id: itemId,
      item_name: itemName || `Custom Item #${itemId}`,
      item_category: itemCategory || 'pizza',
      inventory_id: inventoryId,
      ingredient_name: ingName,
      quantity_required: quantityRequired,
    };

    recipes.push(newMapping);
    saveLocalRecipesState(recipes);
    return { success: true, mapping: newMapping };
  }

  try {
    const { data, error } = await supabase
      .from('menu_item_ingredients')
      .insert({
        item_id: itemId,
        inventory_id: inventoryId,
        quantity_required: quantityRequired
      })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, mapping: data };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown database error' };
  }
}

/**
 * Removes an existing recipe mapping.
 */
export async function removeRecipeMapping(mapId: number): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    const state = getLocalRecipesState();
    const filtered = state.filter(item => item.ingredient_map_id !== mapId);
    saveLocalRecipesState(filtered);
    return true;
  }

  try {
    const { error } = await supabase
      .from('menu_item_ingredients')
      .delete()
      .eq('ingredient_map_id', mapId);

    return !error;
  } catch (err) {
    console.error('Exception deleting recipe mapping:', err);
    return false;
  }
}

/**
 * Automated Stock Reduction:
 * Triggered on order placement to deduct exact quantity levels.
 */
export async function deductInventoryForOrder(
  orderId: number,
  baseName: string,
  pizzaName: string,
  toppingName: string,
  orderQty: number
): Promise<{ success: boolean; transactions: InventoryTransaction[]; warnings: string[] }> {
  const warnings: string[] = [];
  const transactions: InventoryTransaction[] = [];

  const inventory = await getInventory();
  const recipes = await getRecipeMappings();

  // Find all recipe requirements mapped for this Base, Pizza Type, and Topping
  const targets = [
    baseName.toLowerCase().trim(),
    pizzaName.toLowerCase().trim(),
    toppingName.toLowerCase().trim()
  ];

  // Map local matching
  const matchingRecipes = recipes.filter(r => {
    const name = r.item_name?.toLowerCase().trim() || '';
    return targets.some(target => name.includes(target) || target.includes(name));
  });

  // Deduct each match
  for (const recipe of matchingRecipes) {
    const matchedIng = inventory.find(i => i.inventory_id === recipe.inventory_id);
    if (!matchedIng) continue;

    const totalUsed = recipe.quantity_required * orderQty;
    const nextStock = Math.max(0, matchedIng.current_stock - totalUsed);

    // Save transaction trace
    transactions.push({
      order_id: orderId,
      inventory_id: recipe.inventory_id,
      ingredient_name: recipe.ingredient_name,
      quantity_used: totalUsed
    });

    // Write back stock
    await updateInventoryStock(recipe.inventory_id, nextStock);

    // Reorder Alerts
    if (nextStock <= matchedIng.reorder_threshold) {
      warnings.push(`Stock Warning: "${matchedIng.ingredient_name}" is below reorder threshold! (${nextStock.toFixed(2)} remaining)`);
    }
  }

  // Record transactions locally if needed
  if (!getSupabaseClient()) {
    const localTxs = getLocalTransactionsState();
    transactions.forEach((tx, idx) => {
      tx.transaction_id = localTxs.length + idx + 1;
      tx.transaction_time = new Date().toISOString();
      localTxs.unshift(tx);
    });
    saveLocalTransactionsState(localTxs);
  } else {
    try {
      // Seed into Supabase inventory_transactions
      const supabase = getSupabaseClient()!;
      const insertable = transactions.map(tx => ({
        order_id: orderId,
        inventory_id: tx.inventory_id,
        quantity_used: tx.quantity_used
      }));
      await supabase.from('inventory_transactions').insert(insertable);
    } catch (e) {
      console.warn('Could not insert Supabase inventory transactions, proceeding:', e);
    }
  }

  return { success: true, transactions, warnings };
}

/**
 * Returns audit trail logs of deductions.
 */
export async function getInventoryTransactions(): Promise<InventoryTransaction[]> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return getLocalTransactionsState();
  }

  try {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .order('transaction_id', { ascending: false });

    if (error) {
      console.warn('Error fetching Supabase transactions, using local fallback:', error.message);
      return getLocalTransactionsState();
    }

    const { data: inventory } = await supabase.from('inventory').select('inventory_id, ingredient_name');
    const mapped: InventoryTransaction[] = data.map((tx: any) => {
      const ing = inventory?.find((i: any) => i.inventory_id === tx.inventory_id);
      return {
        transaction_id: tx.transaction_id,
        order_id: tx.order_id,
        inventory_id: tx.inventory_id,
        ingredient_name: ing?.ingredient_name || `Ingredient #${tx.inventory_id}`,
        quantity_used: parseFloat(tx.quantity_used) || 0,
        transaction_time: tx.transaction_time || tx.created_at
      };
    });

    return mapped;
  } catch (err) {
    console.error('Exception getting transactions:', err);
    return getLocalTransactionsState();
  }
}
