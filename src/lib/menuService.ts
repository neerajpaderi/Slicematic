/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from './supabaseClient';
import { PIZZA_BASES, PIZZA_TYPES, PIZZA_TOPPINGS } from './pizzaValidation';
import { PizzaBase, PizzaType, PizzaTopping } from '../types';

/**
 * Standard category types matching the database enum.
 */
export type MenuCategory = 'base' | 'pizza' | 'topping';

export interface MenuItem {
  id?: number;
  category: MenuCategory;
  name: string;
  price_inr: number;
  is_active: boolean;
}

/**
 * Fetches active menu items from Supabase, or falls back to static defaults if not configured.
 */
export async function getActiveMenuItems(): Promise<{
  bases: PizzaBase[];
  pizzas: PizzaType[];
  toppings: PizzaTopping[];
}> {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return loadLocalStaticMenu();
  }

  try {
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.warn('Error fetching active menu items, falling back to static lists:', error.message);
      return loadLocalStaticMenu();
    }

    if (!data || data.length === 0) {
      // If table exists but has no records, self-heal by seeding static defaults
      console.log('Database menu_items table empty, auto-seeding defaults...');
      await seedDefaultMenuItems(supabase);
      return loadLocalStaticMenu();
    }

    // Map fetched items into our category formats
    const bases: PizzaBase[] = data
      .filter((item: any) => item.category === 'base')
      .map((item: any) => ({
        id: item.name.toLowerCase().replace(/\s+/g, '_'),
        name: item.name,
        price: parseFloat(item.price_inr !== undefined ? item.price_inr : item.price) || 0,
      }));

    const pizzas: PizzaType[] = data
      .filter((item: any) => item.category === 'pizza')
      .map((item: any) => ({
        id: item.name.toLowerCase().replace(/\s+/g, '_'),
        name: item.name,
        price: parseFloat(item.price_inr !== undefined ? item.price_inr : item.price) || 0,
      }));

    const toppings: PizzaTopping[] = data
      .filter((item: any) => item.category === 'topping')
      .map((item: any) => ({
        id: item.name.toLowerCase().replace(/\s+/g, '_'),
        name: item.name,
        price: parseFloat(item.price_inr !== undefined ? item.price_inr : item.price) || 0,
      }));

    // Ensure we always have at least a fallback base, pizza flavor, and topping if database category is empty
    return {
      bases: bases.length > 0 ? bases : PIZZA_BASES,
      pizzas: pizzas.length > 0 ? pizzas : PIZZA_TYPES,
      toppings: toppings.length > 0 ? toppings : PIZZA_TOPPINGS,
    };
  } catch (err) {
    console.error('Exception fetching active menu items:', err);
    return loadLocalStaticMenu();
  }
}

/**
 * Loads default items from local storage/validation files.
 */
function loadLocalStaticMenu() {
  const localBases = localStorage.getItem('slicematic_custom_bases');
  const localPizzas = localStorage.getItem('slicematic_custom_pizzas');
  const localToppings = localStorage.getItem('slicematic_custom_toppings');

  return {
    bases: localBases ? JSON.parse(localBases) : PIZZA_BASES,
    pizzas: localPizzas ? JSON.parse(localPizzas) : PIZZA_TYPES,
    toppings: localToppings ? JSON.parse(localToppings) : PIZZA_TOPPINGS,
  };
}

/**
 * Seeds initial defaults into Supabase.
 */
async function seedDefaultMenuItems(supabase: any) {
  try {
    const makeItem = (category: 'base' | 'pizza' | 'topping', name: string, price: number, code: string) => ({
      category,
      name,
      price_inr: price,
      price: price,
      item_code: code,
      is_active: true
    });

    const itemsToInsert = [
      ...PIZZA_BASES.map((b, i) => makeItem('base', b.name, b.price, `B_${i+1}`)),
      ...PIZZA_TYPES.map((p, i) => makeItem('pizza', p.name, p.price, `P_${i+1}`)),
      ...PIZZA_TOPPINGS.map((t, i) => makeItem('topping', t.name, t.price, `T_${i+1}`)),
    ];

    // First, query all existing menu items so we never insert duplicates
    const { data: existing, error: fetchErr } = await supabase
      .from('menu_items')
      .select('item_code, name');

    const existingCodes = new Set<string>();
    const existingNames = new Set<string>();

    if (existing && !fetchErr) {
      for (const row of existing) {
        if (row.item_code) existingCodes.add(row.item_code);
        if (row.name) existingNames.add(row.name);
      }
    }

    // Now filter items to insert that are completely unique
    const uniqueItemsToInsert = itemsToInsert.filter(
      item => !existingCodes.has(item.item_code) && !existingNames.has(item.name)
    );

    if (uniqueItemsToInsert.length === 0) {
      console.log('All default menu items already exist in Supabase.');
      return;
    }

    // Try bulk insert of completely unique items
    const { error } = await supabase.from('menu_items').insert(uniqueItemsToInsert);
    if (error) {
      console.warn('Bulk insert failed, trying individual insert with check-constraint safety:', error.message);
      for (const item of uniqueItemsToInsert) {
        // Double check existence in this loop
        const { data: checkExist } = await supabase
          .from('menu_items')
          .select('item_id')
          .or(`item_code.eq.${item.item_code},name.eq.${item.name}`);
        
        if (checkExist && checkExist.length > 0) {
          continue; // skip if somehow already inserted
        }

        // Adjust price if it is 0 and the DB has check constraint price > 0
        let priceToUse = item.price;
        if (priceToUse === 0) {
          const { error: err0 } = await supabase.from('menu_items').insert({
            category: item.category,
            name: item.name,
            price: 0,
            item_code: item.item_code,
            is_active: true
          });
          if (!err0) continue; // Succeeded with price 0!
          
          console.warn('Price 0 insert failed (likely price > 0 check constraint). Trying with price 0.01 for No Extra Topping');
          priceToUse = 0.01; // Tiny fallback to satisfy check constraint
        }

        const { error: err1 } = await supabase.from('menu_items').insert({
          category: item.category,
          name: item.name,
          price: priceToUse,
          item_code: item.item_code,
          is_active: true
        });

        if (err1) {
          const { error: err2 } = await supabase.from('menu_items').insert({
            category: item.category,
            name: item.name,
            price_inr: priceToUse,
            is_active: true
          });
          if (err2) {
            console.error(`Failed both seeding paths for ${item.name}:`, err1.message, '||', err2.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('Exception seeding menu items:', e);
  }
}

/**
 * Parses dynamic .txt files for pizza customization updates.
 * Expected formats per line:
 * - "Thin Crust: 150.00"
 * - "Thin Crust, 150.00"
 * - "b1 thin crust 149" (code, name, price)
 * - "Thin Crust" (uses default/legacy price)
 */
export function parseMenuTextFile(text: string, category: MenuCategory): { name: string; price: number }[] {
  const lines = text.split(/\r?\n/);
  const results: { name: string; price: number }[] = [];

  const titleCase = (str: string) => {
    const s = str.trim().replace(/\s+/g, ' ');
    if (s === s.toLowerCase()) {
      return s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
    return s;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      continue; // Skip comments and empty lines
    }

    let name = '';
    let price = 0;
    let priceFound = false;

    // 1. Try splitting by semicolon first
    if (trimmed.includes(';')) {
      const parts = trimmed.split(';').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // e.g. b1; Thin Crust; 149
        const lastPart = parts[parts.length - 1];
        const parsedPrice = parseFloat(lastPart);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            name = parts.slice(1, -1).join(' ');
          } else {
            name = parts.slice(0, -1).join(' ');
          }
        }
      } else if (parts.length === 2) {
        // e.g. Thin Crust; 149 or b1; Thin Crust
        const lastPart = parts[1];
        const parsedPrice = parseFloat(lastPart);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          name = parts[0];
        } else {
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            name = parts[1];
          } else {
            name = parts.join(' ');
          }
        }
      }
    }
    // 2. Try splitting by comma
    else if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // e.g. b1, Thin Crust, 149
        const lastPart = parts[parts.length - 1];
        const parsedPrice = parseFloat(lastPart);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            name = parts.slice(1, -1).join(' ');
          } else {
            name = parts.slice(0, -1).join(' ');
          }
        }
      } else if (parts.length === 2) {
        // e.g. Thin Crust, 149 or b1, Thin Crust
        const lastPart = parts[1];
        const parsedPrice = parseFloat(lastPart);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          name = parts[0];
        } else {
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            name = parts[1];
          } else {
            name = parts.join(' ');
          }
        }
      }
    }
    // 2. Try splitting by colon
    else if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 3) {
        // e.g. b1: Thin Crust: 149
        const lastPart = parts[parts.length - 1];
        const parsedPrice = parseFloat(lastPart);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            name = parts.slice(1, -1).join(' ');
          } else {
            name = parts.slice(0, -1).join(' ');
          }
        }
      } else if (parts.length === 2) {
        // e.g. Thin Crust: 149
        const lastPart = parts[1];
        const parsedPrice = parseFloat(lastPart);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          name = parts[0];
        } else {
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            name = parts[1];
          } else {
            name = parts.join(' ');
          }
        }
      }
    }

    // 3. Fallback to space-separation (handles "b1 thin crust 149" or "thin crust 149")
    if (!name || !priceFound) {
      const words = trimmed.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        const lastWord = words[words.length - 1];
        const parsedPrice = parseFloat(lastWord);
        if (!isNaN(parsedPrice)) {
          price = parsedPrice;
          priceFound = true;
          const remainingWords = words.slice(0, -1);
          const firstWord = remainingWords[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstWord) || (firstWord.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstWord));
          if (isCode && remainingWords.length >= 2) {
            name = remainingWords.slice(1).join(' ');
          } else {
            name = remainingWords.join(' ');
          }
        } else {
          const firstWord = words[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstWord) || (firstWord.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstWord));
          if (isCode && words.length >= 2) {
            name = words.slice(1).join(' ');
          } else {
            name = words.join(' ');
          }
        }
      } else if (words.length === 1) {
        name = words[0];
      }
    }

    // Default prices if not specified
    if (!priceFound) {
      if (category === 'base') price = 150;
      else if (category === 'pizza') price = 299;
      else if (category === 'topping') price = 40;
    }

    name = titleCase(name);

    if (name) {
      results.push({ name, price });
    }
  }

  return results;
}

/**
 * Updates dynamic menu items from file upload results.
 * Upserts new/modified items, and deactivates any existing items in that category that were omitted.
 */
export async function updateMenuFromParsedItems(
  items: { name: string; price: number }[],
  category: MenuCategory
): Promise<{ success: boolean; count: number; error?: string }> {
  if (items.length === 0) {
    return { success: false, count: 0, error: 'The uploaded file did not contain any valid menu lines.' };
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    // Client-side local storage fallback
    const customList = items.map(item => ({
      id: item.name.toLowerCase().replace(/\s+/g, '_'),
      name: item.name,
      price: item.price,
    }));

    if (category === 'base') {
      localStorage.setItem('slicematic_custom_bases', JSON.stringify(customList));
    } else if (category === 'pizza') {
      localStorage.setItem('slicematic_custom_pizzas', JSON.stringify(customList));
    } else if (category === 'topping') {
      localStorage.setItem('slicematic_custom_toppings', JSON.stringify(customList));
    }

    return { success: true, count: items.length };
  }

  try {
    // 1. Fetch current menu items in this category
    const { data: existingItems, error: fetchErr } = await supabase
      .from('menu_items')
      .select('*')
      .eq('category', category);

    if (fetchErr) {
      return { success: false, count: 0, error: `Failed to fetch existing items: ${fetchErr.message}` };
    }

    // 2. Mark ALL existing items in this category as INACTIVE first (to de-register removed ones)
    const { error: deactivateErr } = await supabase
      .from('menu_items')
      .update({ is_active: false })
      .eq('category', category);

    if (deactivateErr) {
      return { success: false, count: 0, error: `Failed to reset status: ${deactivateErr.message}` };
    }

    // 3. Upsert the new parsed items (sets is_active to true)
    let updateCount = 0;
    for (const item of items) {
      const existing = existingItems?.find((e: any) => e.name.toLowerCase() === item.name.toLowerCase());

      if (existing) {
        // Update existing item
        const key = existing.id !== undefined ? 'id' : 'item_id';
        const existingId = existing.id !== undefined ? existing.id : existing.item_id;

        const updateData: any = { is_active: true };
        if (existing.price_inr !== undefined) updateData.price_inr = item.price;
        if (existing.price !== undefined) updateData.price = item.price;

        const { error: updateErr } = await supabase
          .from('menu_items')
          .update(updateData)
          .eq(key, existingId);

        if (!updateErr) {
          updateCount++;
        } else {
          console.warn(`Failed to update item ${item.name}:`, updateErr.message);
        }
      } else {
        // Insert new item
        const insertData: any = {
          category,
          name: item.name,
          is_active: true,
        };
        
        // Generate a random unique item code
        const code = `${category[0].toUpperCase()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

        if (existingItems && existingItems.length > 0) {
          const sample = existingItems[0];
          if (sample.price_inr !== undefined) insertData.price_inr = item.price;
          if (sample.price !== undefined) insertData.price = item.price;
          if (sample.item_code !== undefined) insertData.item_code = code;
        } else {
          // Fallback: assign to both
          insertData.price_inr = item.price;
          insertData.price = item.price;
          insertData.item_code = code;
        }

        const { error: insertErr } = await supabase
          .from('menu_items')
          .insert(insertData);

        if (!insertErr) {
          updateCount++;
        } else {
          console.warn(`Failed to insert item ${item.name}:`, insertErr.message);
        }
      }
    }

    return { success: true, count: updateCount };
  } catch (err: any) {
    console.error('Exception updating menu items:', err);
    return { success: false, count: 0, error: err.message || 'Unknown database update error.' };
  }
}
