/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getSupabaseClient } from './supabaseClient';
import { validatePizzaOrder } from './pizzaValidation';
import { PizzaOrderInput, OrderFinancials } from '../types';
import { deductInventoryForOrder } from './inventoryService';

/**
 * Cleans an item name, removing any parsing leftovers (like prefixes, codes, or trailing prices) from raw text files.
 */
function cleanItemName(rawName: string): string {
  let trimmed = rawName.trim();
  if (!trimmed) return '';
  
  const separators = [';', ',', ':'];
  for (const sep of separators) {
    if (trimmed.includes(sep)) {
      const parts = trimmed.split(sep).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        const parsedPrice = parseFloat(lastPart);
        
        if (parts.length >= 3 && !isNaN(parsedPrice)) {
          const firstPart = parts[0];
          const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
          if (isCode) {
            return parts.slice(1, -1).join(' ').trim();
          } else {
            return parts.slice(0, -1).join(' ').trim();
          }
        } else if (parts.length === 2) {
          if (!isNaN(parsedPrice)) {
            return parts[0].trim();
          } else {
            const firstPart = parts[0];
            const isCode = /^[a-zA-Z]\d+$/i.test(firstPart) || (firstPart.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstPart));
            if (isCode) {
              return parts[1].trim();
            }
          }
        }
      }
    }
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const lastWord = words[words.length - 1];
    const parsedPrice = parseFloat(lastWord);
    if (!isNaN(parsedPrice)) {
      const remainingWords = words.slice(0, -1);
      const firstWord = remainingWords[0];
      const isCode = /^[a-zA-Z]\d+$/i.test(firstWord) || (firstWord.length <= 3 && /^[a-zA-Z0-9]+$/.test(firstWord));
      if (isCode && remainingWords.length >= 2) {
        return remainingWords.slice(1).join(' ').trim();
      } else {
        return remainingWords.join(' ').trim();
      }
    }
  }

  return trimmed;
}

/**
 * Sanitizes and normalizes phone numbers to strictly comply with '^[6-9]\d{9}$' database check constraint.
 */
export function sanitizePhoneNumber(phone: string): string {
  if (!phone) {
    return '9999999999';
  }
  const digits = phone.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  let base = digits;
  if (base.length === 0) {
    return '9999999999';
  }
  if (!/^[6-9]/.test(base)) {
    base = '9' + base;
  }
  const clean = base.padEnd(10, '0').slice(0, 10);
  if (/^[6-9]\d{9}$/.test(clean)) {
    return clean;
  }
  return '9999999999';
}

/**
 * Resolves a menu item ID from Supabase 'menu_items' by category and name.
 * If the item does not exist, it inserts it automatically (auto-seeding / self-healing DB).
 */
async function resolveMenuItemId(
  supabase: any,
  category: 'base' | 'pizza' | 'topping',
  name: string,
  price: number
): Promise<number> {
  const cleanedName = cleanItemName(name) || name;
  try {
    // 1. Check if item exists (select * to be completely safe and get all columns)
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('name', cleanedName)
      .maybeSingle();

    if (error) {
      console.warn(`Error resolving menu item (${cleanedName}):`, error);
    }
    if (data) {
      return data.item_id !== undefined ? data.item_id : (data.id || 1);
    }

    // 2. If it does not exist, insert it (self-healing database) using a robust cascade
    let insertedItem: any = null;
    let menuDbError = '';

    const randomCode = `${category[0].toUpperCase()}_${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    const menuItemShapes = [
      {
        name: 'Standard (price + item_code + is_active)',
        data: {
          category,
          name: cleanedName,
          price,
          item_code: randomCode,
          is_active: true
        }
      },
      {
        name: 'Standard without code (price + is_active)',
        data: {
          category,
          name: cleanedName,
          price,
          is_active: true
        }
      },
      {
        name: 'Legacy (price_inr + item_code + is_active)',
        data: {
          category,
          name: cleanedName,
          price_inr: price,
          item_code: randomCode,
          is_active: true
        }
      },
      {
        name: 'Legacy without code (price_inr + is_active)',
        data: {
          category,
          name: cleanedName,
          price_inr: price,
          is_active: true
        }
      },
      {
        name: 'Minimal price_inr with item_code (no is_active)',
        data: {
          category,
          name: cleanedName,
          price_inr: price,
          item_code: randomCode
        }
      },
      {
        name: 'Minimal price with item_code (no is_active)',
        data: {
          category,
          name: cleanedName,
          price,
          item_code: randomCode
        }
      },
      {
        name: 'Absolute Minimum (price_inr)',
        data: {
          category,
          name: cleanedName,
          price_inr: price
        }
      },
      {
        name: 'Absolute Minimum (price)',
        data: {
          category,
          name: cleanedName,
          price
        }
      }
    ];

    for (const shape of menuItemShapes) {
      const { data: inserted, error: insertError } = await supabase
        .from('menu_items')
        .insert([shape.data])
        .select();

      if (!insertError && inserted && inserted.length > 0) {
        insertedItem = inserted[0];
        break;
      } else if (insertError) {
        console.warn(`Menu item shape ${shape.name} failed:`, insertError.message);
        menuDbError += `[${shape.name}: ${insertError.message}] `;
      }
    }

    if (insertedItem) {
      return insertedItem.item_id !== undefined ? insertedItem.item_id : (insertedItem.id || 1);
    }

    console.warn(`Error auto-seeding menu item (${cleanedName}): All insert shapes failed. Details: ${menuDbError}`);
    return 1;
  } catch (err) {
    console.warn(`resolveMenuItemId using fallback ID 1 for: ${cleanedName}`, err);
    return 1;
  }
}

/**
 * Inserts an order and its line item into Supabase tables 'orders' and 'order_line_items'.
 * Follows the strict high-contrast database schema.
 */
export async function submitOrder(
  input: PizzaOrderInput & {
    items?: Array<{
      baseId: string;
      baseName: string;
      basePrice: number;
      typeId: string;
      pizzaName: string;
      pizzaPrice: number;
      toppingId: string;
      toppingName: string;
      toppingPrice: number;
      quantity: number;
    }>;
  },
  financials: OrderFinancials,
  pizzaDetails?: { baseName: string; pizzaName: string; toppingName: string }
) {
  const isMultiItem = !!(input.items && input.items.length > 0);
  const qty = isMultiItem
    ? input.items!.reduce((sum, item) => sum + item.quantity, 0)
    : input.quantity;

  const firstItem = isMultiItem ? input.items![0] : null;
  const resolvedPizzaDetails = pizzaDetails || (firstItem ? {
    baseName: firstItem.baseName,
    pizzaName: firstItem.pizzaName,
    toppingName: firstItem.toppingName,
  } : { baseName: 'Thin Crust', pizzaName: 'Custom Pizza', toppingName: 'None' });

  // 1. Re-validate all inputs prior to submission (strict safety check)
  const validationInput = {
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    quantity: qty,
    paymentMode: input.paymentMode,
  };
  const validation = validatePizzaOrder(validationInput);
  if (!validation.isValid) {
    const errorMsg = Object.values(validation.errors).join(' ');
    throw new Error(`Validation failed: ${errorMsg}`);
  }

  if (!input.paymentMode) {
    throw new Error('Payment mode is required for order submission.');
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    // Save to local fallback storage if Supabase is not configured
    const localOrder = {
      id: `local_${Date.now()}`,
      customer_name: input.customerName,
      customer_phone: input.customerPhone,
      payment_mode: input.paymentMode!,
      quantity: qty,
      subtotal: financials.subtotal,
      discount: financials.discount,
      gst: financials.gst,
      final_total: financials.finalTotal,
      created_at: new Date().toISOString(),
      pizza: resolvedPizzaDetails,
      synced: false,
      items: input.items,
    };
    
    try {
      const existing = localStorage.getItem('slicematic_orders_history');
      const history = existing ? JSON.parse(existing) : [];
      history.unshift(localOrder);
      localStorage.setItem('slicematic_orders_history', JSON.stringify(history.slice(0, 50)));
    } catch (e) {
      console.error('Error writing order to local history:', e);
    }
    
    // Auto-deduct inventory ingredients for local simulation
    let warningMessage = '';
    try {
      const orderNumId = Date.now();
      const allWarnings: string[] = [];
      
      if (isMultiItem) {
        for (const item of input.items!) {
          const { warnings } = await deductInventoryForOrder(
            orderNumId,
            item.baseName,
            item.pizzaName,
            item.toppingName,
            item.quantity
          );
          allWarnings.push(...warnings);
        }
      } else {
        const { warnings } = await deductInventoryForOrder(
          orderNumId,
          resolvedPizzaDetails.baseName,
          resolvedPizzaDetails.pizzaName,
          resolvedPizzaDetails.toppingName,
          qty
        );
        allWarnings.push(...warnings);
      }
      
      if (allWarnings.length > 0) {
        warningMessage = ' ' + Array.from(new Set(allWarnings)).join(' | ');
      }
    } catch (invErr) {
      console.warn('Local inventory deduction failed:', invErr);
    }

    return {
      success: true,
      mode: 'local',
      order: localOrder,
      message: `Order simulated successfully! Configure Supabase in the panel below to synchronize cloud database tables.${warningMessage}`,
    };
  }

  try {
    console.log('Attempting order submission...');

    const phone = sanitizePhoneNumber(input.customerPhone);

    // 1. Ensure customer exists in customers table
    try {
      const customerData = {
        phone,
        name: input.customerName.trim() || 'Guest',
      };
      
      const { data: existingCustomer, error: findErr } = await supabase
        .from('customers')
        .select('phone')
        .eq('phone', phone)
        .maybeSingle();

      if (findErr) {
        console.warn('Error checking existing customer:', findErr.message);
      }

      if (!existingCustomer) {
        const { error: insertErr } = await supabase
          .from('customers')
          .insert([customerData]);
        if (insertErr) {
          console.warn('Customer insertion failed (trying upsert as fallback):', insertErr.message);
          const { error: upsertErr } = await supabase
            .from('customers')
            .upsert(customerData, { onConflict: 'phone' });
          if (upsertErr) {
            console.warn('Customer upsert also failed:', upsertErr.message);
          }
        }
      }
    } catch (custErr) {
      console.warn('Customer table pre-population skipped:', custErr);
    }

    // 2. Cascade Insertion for orders Table
    let orderId: any = null;
    let savedInSchema = '';
    let dbErrorDetails = '';
    const sub = financials.subtotal;
    const disc = financials.discount;
    const gstVal = financials.gst;
    const finalVal = financials.finalTotal;

    const shapes = [
      {
        name: 'Normalized (discount_amount, gst_amount, payment_mode)',
        data: {
          customer_phone: phone,
          quantity: qty,
          subtotal: sub,
          discount_amount: disc,
          gst_amount: gstVal,
          final_total: finalVal,
          payment_mode: input.paymentMode,
        }
      },
      {
        name: 'Normalized (discount_amount, gst_amount, payment_mode, customer_name)',
        data: {
          customer_phone: phone,
          customer_name: input.customerName.trim(),
          quantity: qty,
          subtotal: sub,
          discount_amount: disc,
          gst_amount: gstVal,
          final_total: finalVal,
          payment_mode: input.paymentMode,
        }
      },
      {
        name: 'Normalized (discount, gst, payment_mode)',
        data: {
          customer_phone: phone,
          quantity: qty,
          subtotal: sub,
          discount: disc,
          gst: gstVal,
          final_total: finalVal,
          payment_mode: input.paymentMode,
        }
      },
      {
        name: 'Normalized (discount, gst, payment_mode, customer_name)',
        data: {
          customer_phone: phone,
          customer_name: input.customerName.trim(),
          quantity: qty,
          subtotal: sub,
          discount: disc,
          gst: gstVal,
          final_total: finalVal,
          payment_mode: input.paymentMode,
        }
      },
      {
        name: 'Normalized (discount_amount, gst_amount, NO payment_mode)',
        data: {
          customer_phone: phone,
          quantity: qty,
          subtotal: sub,
          discount_amount: disc,
          gst_amount: gstVal,
          final_total: finalVal,
        }
      },
      {
        name: 'Normalized (discount, gst, NO payment_mode)',
        data: {
          customer_phone: phone,
          quantity: qty,
          subtotal: sub,
          discount: disc,
          gst: gstVal,
          final_total: finalVal,
        }
      },
      {
        name: 'Flat/Legacy (discount_amount, gst_amount, customer_name)',
        data: {
          customer_name: input.customerName.trim(),
          customer_phone: phone,
          payment_mode: input.paymentMode,
          quantity: qty,
          subtotal: sub,
          discount_amount: disc,
          gst_amount: gstVal,
          final_total: finalVal,
          order_source: input.orderSource || 'Counter',
          order_status: 'Received',
        }
      },
      {
        name: 'Flat/Legacy (discount, gst, customer_name)',
        data: {
          customer_name: input.customerName.trim(),
          customer_phone: phone,
          payment_mode: input.paymentMode,
          quantity: qty,
          subtotal: sub,
          discount: disc,
          gst: gstVal,
          final_total: finalVal,
          order_source: input.orderSource || 'Counter',
          order_status: 'Received',
        }
      },
      {
        name: 'Barebones (customer_phone, payment_mode)',
        data: {
          customer_phone: phone,
          payment_mode: input.paymentMode,
          quantity: qty,
          subtotal: sub,
          final_total: finalVal,
        }
      },
      {
        name: 'Barebones (customer_name, payment_mode)',
        data: {
          customer_name: input.customerName.trim(),
          customer_phone: phone,
          payment_mode: input.paymentMode,
          quantity: qty,
          subtotal: sub,
          final_total: finalVal,
        }
      },
      {
        name: 'Absolute Minimum (payment_mode)',
        data: {
          payment_mode: input.paymentMode,
          quantity: qty,
          subtotal: sub,
          final_total: finalVal,
        }
      },
      {
        name: 'Absolute Minimum',
        data: {
          quantity: qty,
          subtotal: sub,
          final_total: finalVal,
        }
      }
    ];

    for (const shape of shapes) {
      console.log(`Trying order insertion shape: ${shape.name}`);
      const { data, error } = await supabase
        .from('orders')
        .insert([shape.data])
        .select();

      if (!error && data && data.length > 0) {
        orderId = data[0].order_id || data[0].id;
        savedInSchema = shape.name;
        console.log(`Successfully saved order with schema shape: ${shape.name}, Order ID: ${orderId}`);
        break;
      } else if (error) {
        console.warn(`Shape ${shape.name} failed:`, error.message);
        dbErrorDetails += `[${shape.name}: ${error.message}] `;
      }
    }

    if (!orderId) {
      throw new Error(`Supabase order insertion failed across all structural schemas. Details: ${dbErrorDetails}`);
    }

    // 3. Try Inserting Order Line Items / Relationships (Best effort, does not throw)
    try {
      if (isMultiItem) {
        const orderItemsToInsert: any[] = [];
        const orderLineItemsToInsert: any[] = [];
        
        for (const item of input.items!) {
          let bId = 1;
          let pId = 1;
          let tId = 1;
          try {
            bId = await resolveMenuItemId(supabase, 'base', item.baseName, item.basePrice || 150.0);
            pId = await resolveMenuItemId(supabase, 'pizza', item.pizzaName, item.pizzaPrice || 299.0);
            tId = await resolveMenuItemId(supabase, 'topping', item.toppingName, item.toppingPrice || 40.0);
          } catch (resErr) {
            console.warn('Could not auto-resolve multi-item menu_items IDs:', resErr);
          }
          
          for (let q = 0; q < item.quantity; q++) {
            orderItemsToInsert.push(
              {
                order_id: orderId,
                item_id: bId,
                item_type: 'base',
                item_name: item.baseName,
                unit_price: item.basePrice || 150.0,
              },
              {
                order_id: orderId,
                item_id: pId,
                item_type: 'pizza',
                item_name: item.pizzaName,
                unit_price: item.pizzaPrice || 299.0,
              },
              {
                order_id: orderId,
                item_id: tId,
                item_type: 'topping',
                item_name: item.toppingName,
                unit_price: item.toppingPrice || 40.0,
              }
            );
            
            orderLineItemsToInsert.push({
              order_id: orderId,
              base_id: bId,
              pizza_id: pId,
              topping_id: tId,
              base_name: item.baseName,
              pizza_name: item.pizzaName,
              topping_name: item.toppingName,
            });
          }
        }
        
        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItemsToInsert);
        if (itemsErr) {
          console.warn('order_items table insertion failed (schema might use order_line_items):', itemsErr.message);
          
          const { error: lineItemsErr } = await supabase
            .from('order_line_items')
            .insert(orderLineItemsToInsert);
          if (lineItemsErr) {
            console.warn('order_line_items table insertion also failed:', lineItemsErr.message);
          }
        }
      } else {
        // Single item fallback
        let baseId = 1;
        let pizzaId = 1;
        let toppingId = 1;
        try {
          baseId = await resolveMenuItemId(supabase, 'base', resolvedPizzaDetails.baseName, 150.0);
          pizzaId = await resolveMenuItemId(supabase, 'pizza', resolvedPizzaDetails.pizzaName, 299.0);
          toppingId = await resolveMenuItemId(supabase, 'topping', resolvedPizzaDetails.toppingName, 40.0);
        } catch (resErr) {
          console.warn('Could not auto-resolve menu_items IDs, proceeding with defaults:', resErr);
        }
        
        const orderItemsToInsert: any[] = [];
        const orderLineItemsToInsert: any[] = [];
        
        for (let q = 0; q < qty; q++) {
          orderItemsToInsert.push(
            {
              order_id: orderId,
              item_id: baseId,
              item_type: 'base',
              item_name: resolvedPizzaDetails.baseName,
              unit_price: financials.subtotal / qty,
            },
            {
              order_id: orderId,
              item_id: pizzaId,
              item_type: 'pizza',
              item_name: resolvedPizzaDetails.pizzaName,
              unit_price: financials.subtotal / qty,
            },
            {
              order_id: orderId,
              item_id: toppingId,
              item_type: 'topping',
              item_name: resolvedPizzaDetails.toppingName,
              unit_price: financials.subtotal / qty,
            }
          );
          
          orderLineItemsToInsert.push({
            order_id: orderId,
            base_id: baseId,
            pizza_id: pizzaId,
            topping_id: toppingId,
            base_name: resolvedPizzaDetails.baseName,
            pizza_name: resolvedPizzaDetails.pizzaName,
            topping_name: resolvedPizzaDetails.toppingName,
          });
        }
        
        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItemsToInsert);
        if (itemsErr) {
          console.warn('order_items table insertion failed (schema might use order_line_items):', itemsErr.message);
          
          const { error: lineItemsErr } = await supabase
            .from('order_line_items')
            .insert(orderLineItemsToInsert);
          if (lineItemsErr) {
            console.warn('order_line_items table insertion also failed:', lineItemsErr.message);
          }
        }
      }
    } catch (itemExc) {
      console.warn('Exceptions during order items insertion:', itemExc);
    }

    // 4. Try Inserting into payments table
    try {
      const { error: payErr } = await supabase
        .from('payments')
        .insert({
          order_id: orderId,
          payment_mode: input.paymentMode,
        });
      if (payErr) console.warn('Payments table insert skipped or failed:', payErr.message);
    } catch (payExc) {
      console.warn('Payments table exception:', payExc);
    }

    // 5. Try Inserting into order_status table
    try {
      const { error: statusErr } = await supabase
        .from('order_status')
        .insert({
          order_id: orderId,
          status: 'Placed',
        });
      if (statusErr) console.warn('Order status table insert skipped or failed:', statusErr.message);
    } catch (statusExc) {
      console.warn('Order status table exception:', statusExc);
    }

    // Success response: format the unified order object for the local UI cache & user
    const savedOrder = {
      id: orderId,
      customer_name: input.customerName,
      customer_phone: phone,
      payment_mode: input.paymentMode,
      quantity: qty,
      subtotal: financials.subtotal,
      discount: financials.discount,
      gst: financials.gst,
      final_total: financials.finalTotal,
      created_at: new Date().toISOString(),
      pizza: resolvedPizzaDetails,
      items: input.items,
      synced: true,
    };
    saveLocalOrderToHistory(savedOrder);

    // Auto-deduct inventory ingredients
    let warningMessage = '';
    try {
      const allWarnings: string[] = [];
      if (isMultiItem) {
        for (const item of input.items!) {
          const { warnings } = await deductInventoryForOrder(
            orderId,
            item.baseName,
            item.pizzaName,
            item.toppingName,
            item.quantity
          );
          allWarnings.push(...warnings);
        }
      } else {
        const { warnings } = await deductInventoryForOrder(
          orderId,
          resolvedPizzaDetails.baseName,
          resolvedPizzaDetails.pizzaName,
          resolvedPizzaDetails.toppingName,
          qty
        );
        allWarnings.push(...warnings);
      }
      
      if (allWarnings.length > 0) {
        warningMessage = ' ' + Array.from(new Set(allWarnings)).join(' | ');
      }
    } catch (invErr) {
      console.warn('Inventory deduction failed:', invErr);
    }

    return {
      success: true,
      mode: 'supabase',
      order: savedOrder,
      message: `Pizza order was successfully inserted into your Supabase database! (Saved using ${savedInSchema} shape)${warningMessage}`,
    };

  } catch (err: any) {
    console.error('Error during Supabase order submission:', err);
    throw err;
  }
}

/**
 * Saves order to local history storage as a fallback/cache.
 */
function saveLocalFallbackOrder(
  input: PizzaOrderInput,
  financials: OrderFinancials,
  pizzaDetails: { baseName: string; pizzaName: string; toppingName: string }
) {
  const localOrder = {
    id: `local_${Date.now()}`,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    payment_mode: input.paymentMode!,
    quantity: input.quantity,
    subtotal: financials.subtotal,
    discount: financials.discount,
    gst: financials.gst,
    final_total: financials.finalTotal,
    created_at: new Date().toISOString(),
    pizza: pizzaDetails,
    synced: false,
  };

  saveLocalOrderToHistory(localOrder);
  return localOrder;
}

function saveLocalOrderToHistory(order: any) {
  try {
    const existing = localStorage.getItem('slicematic_orders_history');
    const history = existing ? JSON.parse(existing) : [];
    history.unshift(order);
    localStorage.setItem('slicematic_orders_history', JSON.stringify(history.slice(0, 50))); // Keep last 50 orders
  } catch (e) {
    console.error('Error writing order to local history:', e);
  }
}

/**
 * Retrieves the history of placed orders.
 */
export function getOrdersHistory() {
  try {
    const existing = localStorage.getItem('slicematic_orders_history');
    return existing ? JSON.parse(existing) : [];
  } catch (e) {
    console.error('Error reading order history:', e);
    return [];
  }
}

/**
 * Clears the local orders history cache.
 */
export function clearOrdersHistory() {
  localStorage.removeItem('slicematic_orders_history');
}

/**
 * Fetches real orders from Supabase (merging relationships where possible)
 */
export async function fetchSupabaseOrders(): Promise<any[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    // 1. Fetch orders
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('*')
      .order('order_time', { ascending: false })
      .limit(50);

    if (ordersErr || !orders) {
      console.warn('Could not fetch orders from Supabase:', ordersErr?.message);
      return [];
    }

    // 2. Fetch supporting data to stitch relationships
    let customers: any[] = [];
    let payments: any[] = [];
    let orderItems: any[] = [];
    let orderLineItems: any[] = [];

    try {
      const res = await supabase.from('customers').select('*');
      if (res.data) customers = res.data;
    } catch (e) { console.warn('Customers load skipped:', e); }

    try {
      const res = await supabase.from('payments').select('*');
      if (res.data) payments = res.data;
    } catch (e) { console.warn('Payments load skipped:', e); }

    try {
      const res = await supabase.from('order_items').select('*');
      if (res.data) orderItems = res.data;
    } catch (e) { console.warn('Order items load skipped:', e); }

    try {
      const res = await supabase.from('order_line_items').select('*');
      if (res.data) orderLineItems = res.data;
    } catch (e) { console.warn('Order line items load skipped:', e); }

    return orders.map((o: any) => {
      // Find corresponding customer name
      const phone = o.customer_phone;
      const matchedCustomer = customers?.find((c: any) => c.phone === phone);
      const customerName = matchedCustomer ? matchedCustomer.name : (o.customer_name || 'Walk-in Customer');

      // Find payment mode
      const matchedPayment = payments?.find((p: any) => p.order_id === (o.order_id || o.id));
      const paymentMode = matchedPayment ? matchedPayment.payment_mode : (o.payment_mode || 'Cash');

      // Reconstruct pizza details
      const orderId = o.order_id || o.id;
      let pizzaDetails = { baseName: 'Thin Crust', pizzaName: 'Margerita', toppingName: 'Mushrooms' };

      const matchedItems = orderItems?.filter((oi: any) => oi.order_id === orderId);
      if (matchedItems && matchedItems.length > 0) {
        const base = matchedItems.find((m: any) => m.item_type === 'base')?.item_name || 'Thin Crust';
        const pizza = matchedItems.find((m: any) => m.item_type === 'pizza')?.item_name || 'Custom Pizza';
        const topping = matchedItems.find((m: any) => m.item_type === 'topping')?.item_name || 'None';
        pizzaDetails = { baseName: base, pizzaName: pizza, toppingName: topping };
      } else {
        const matchedLineItem = orderLineItems?.find((oli: any) => oli.order_id === orderId);
        if (matchedLineItem) {
          pizzaDetails = {
            baseName: matchedLineItem.base_name || 'Thin Crust',
            pizzaName: matchedLineItem.pizza_name || 'Custom Pizza',
            toppingName: matchedLineItem.topping_name || 'None'
          };
        } else if (o.pizza) {
          pizzaDetails = typeof o.pizza === 'string' ? JSON.parse(o.pizza) : o.pizza;
        }
      }

      return {
        id: o.order_id || o.id,
        customer_name: customerName,
        customer_phone: phone || o.customer_phone || '',
        payment_mode: paymentMode,
        quantity: o.quantity,
        subtotal: parseFloat(o.subtotal) || 0,
        discount: parseFloat(o.discount_amount !== undefined ? o.discount_amount : o.discount) || 0,
        gst: parseFloat(o.gst_amount !== undefined ? o.gst_amount : o.gst) || 0,
        final_total: parseFloat(o.final_total) || 0,
        created_at: o.order_time || o.created_at || new Date().toISOString(),
        pizza: pizzaDetails,
        synced: true
      };
    });
  } catch (err) {
    console.error('Exception fetching cloud orders:', err);
    return [];
  }
}

/**
 * SQL Schema Instructions for Supabase Tables.
 * Returns the exact updated high-contrast DDL statements.
 */
export function getSupabaseSQLSchema(): string {
  return `-- SQL DDL Script for SliceMatic Pizza 3-Tier Normalized DB Schema
-- Run this in your Supabase SQL Editor to provision the 9 relational tables:

-- ==========================================
-- 1. CUSTOMERS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS customers (
    phone       VARCHAR(10) PRIMARY KEY CHECK (phone ~ '^[6-9]\\d{9}$'),
    name        VARCHAR(40) NOT NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. STAFF USERS TABLE (Roles management)
-- ==========================================
CREATE TABLE IF NOT EXISTS staff_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('cashier', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Seed defaults if missing
INSERT INTO staff_users (username, password_hash, role) VALUES
('Rajan', 'rajan123', 'admin'),
('admin', 'slicematic', 'admin')
ON CONFLICT (username) DO NOTHING;

-- ==========================================
-- 3. MENU ITEMS (Bases, Pizzas, and Toppings)
-- ==========================================
CREATE TABLE IF NOT EXISTS menu_items (
    item_id     SERIAL PRIMARY KEY,
    item_code   VARCHAR(10) NOT NULL UNIQUE,
    category    VARCHAR(10) NOT NULL CHECK (category IN ('base', 'pizza', 'topping')),
    name        VARCHAR(50) NOT NULL UNIQUE,
    price       NUMERIC(6,2) NOT NULL CHECK (price >= 0),
    is_active   BOOLEAN NOT NULL DEFAULT true
);

-- ==========================================
-- 4. ORDERS MASTER RECORD
-- ==========================================
CREATE TABLE IF NOT EXISTS orders (
    order_id         SERIAL PRIMARY KEY,
    customer_phone   VARCHAR(10) NOT NULL REFERENCES customers(phone),
    quantity         INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    subtotal         NUMERIC(8,2) NOT NULL,
    discount_amount  NUMERIC(8,2) NOT NULL DEFAULT 0,
    gst_amount       NUMERIC(8,2) NOT NULL,
    final_total      NUMERIC(8,2) NOT NULL,
    order_time       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 5. ORDER LINE ITEMS (Snapshotted for integrity)
-- ==========================================
CREATE TABLE IF NOT EXISTS order_items (
    order_item_id  SERIAL PRIMARY KEY,
    order_id       INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    item_id        INTEGER NOT NULL REFERENCES menu_items(item_id),
    item_type      VARCHAR(10) NOT NULL CHECK (item_type IN ('base', 'pizza', 'topping')),
    item_name      VARCHAR(50) NOT NULL,
    unit_price     NUMERIC(6,2) NOT NULL
);

-- ==========================================
-- 6. PAYMENTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS payments (
    payment_id    SERIAL PRIMARY KEY,
    order_id      INTEGER NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
    payment_mode  VARCHAR(10) NOT NULL CHECK (payment_mode IN ('Cash', 'Card', 'UPI')),
    paid_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 7. ORDER STATUS (Kitchen tracking)
-- ==========================================
CREATE TABLE IF NOT EXISTS order_status (
    status_id   SERIAL PRIMARY KEY,
    order_id    INTEGER NOT NULL UNIQUE REFERENCES orders(order_id) ON DELETE CASCADE,
    status      VARCHAR(20) NOT NULL DEFAULT 'Placed'
                CHECK (status IN ('Placed', 'Preparing', 'Ready', 'Completed')),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 8. INVENTORY LEVEL TRACKING (Live Ingredient Stocks)
-- ==========================================
CREATE TABLE IF NOT EXISTS inventory (
    inventory_id        SERIAL PRIMARY KEY,
    ingredient_name      VARCHAR(30) NOT NULL UNIQUE,
    unit                  VARCHAR(10) NOT NULL CHECK (unit IN ('unit', 'liter', 'kg')),
    current_stock         NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
    reorder_threshold     NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (reorder_threshold >= 0),
    updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Populate default ingredient count
INSERT INTO inventory (ingredient_name, unit, current_stock, reorder_threshold) VALUES
('Pizza Base', 'unit', 100.00, 20.00),
('Marinara Sauce', 'liter', 15.00, 3.00),
('Mozzarella Cheese', 'kg', 12.50, 2.50),
('Bell Pepper Topping', 'kg', 4.50, 1.00),
('Red Onion Topping', 'kg', 5.00, 1.00),
('Paneer Cubes Topping', 'kg', 6.00, 1.50),
('Jalapenos Topping', 'kg', 3.00, 0.50),
('Pepperoni Slices', 'kg', 8.00, 1.50)
ON CONFLICT (ingredient_name) DO NOTHING;

-- ==========================================
-- 9. RECIPE INGREDIENT MAPPING (Menu-to-Stock connection)
-- ==========================================
CREATE TABLE IF NOT EXISTS menu_item_ingredients (
    ingredient_map_id  SERIAL PRIMARY KEY,
    item_id            INTEGER NOT NULL REFERENCES menu_items(item_id) ON DELETE CASCADE,
    inventory_id       INTEGER NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
    quantity_required  NUMERIC(8,3) NOT NULL CHECK (quantity_required > 0)
);

-- ==========================================
-- 10. INVENTORY TRANSACTION AUDIT TRAIL
-- ==========================================
CREATE TABLE IF NOT EXISTS inventory_transactions (
    transaction_id     SERIAL PRIMARY KEY,
    order_id            INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
    inventory_id        INTEGER NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
    quantity_used        NUMERIC(8,3) NOT NULL CHECK (quantity_used >= 0),
    transaction_time      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Enable RLS and insert open policies for easy prototyping
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all ops" ON customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON staff_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON menu_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON orders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON order_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON payments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON order_status FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON inventory FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON menu_item_ingredients FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all ops" ON inventory_transactions FOR ALL USING (true) WITH CHECK (true);

-- =========================================================================
-- 11. GRANT PERMISSIONS ON SCHEMAS, TABLES, AND SEQUENCES (FOR API ACCESS)
-- =========================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`;
}
