/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pizza, 
  ShoppingCart, 
  User, 
  Phone, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Loader2, 
  ArrowRight,
  Plus,
  Minus,
  Check,
  Percent
} from 'lucide-react';
import { getActiveMenuItems } from '../lib/menuService';
import { submitOrder } from '../lib/orderService';
import { validatePizzaOrder, calculateFinancials } from '../lib/pizzaValidation';
import { PizzaBase, PizzaType, PizzaTopping, ValidationError } from '../types';

interface TableOrderingProps {
  tableId: string;
}

export default function TableOrdering({ tableId }: TableOrderingProps) {
  // Menu states fetched from Supabase
  const [loading, setLoading] = useState(true);
  const [bases, setBases] = useState<PizzaBase[]>([]);
  const [pizzas, setPizzas] = useState<PizzaType[]>([]);
  const [toppings, setToppings] = useState<PizzaTopping[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Cart / Customizer States
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedBase, setSelectedBase] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedTopping, setSelectedTopping] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Card' | 'UPI'>('UPI');

  // Interactive UI states
  const [errors, setErrors] = useState<ValidationError>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState<any | null>(null);
  const [smsNotification, setSmsNotification] = useState<string | null>(null);

  // Load active menu items from Supabase
  useEffect(() => {
    async function loadMenu() {
      try {
        const data = await getActiveMenuItems();
        setBases(data.bases);
        setPizzas(data.pizzas);
        setToppings(data.toppings);
        
        if (data.bases.length > 0) setSelectedBase(data.bases[0].id);
        if (data.pizzas.length > 0) setSelectedType(data.pizzas[0].id);
        if (data.toppings.length > 0) setSelectedTopping(data.toppings[0].id);
      } catch (err: any) {
        setErrorMsg('Failed to load menu items from the database.');
      } finally {
        setLoading(false);
      }
    }
    loadMenu();
  }, []);

  // Validate on changes
  useEffect(() => {
    if (customerName || customerPhone) {
      const res = validatePizzaOrder({
        customerName,
        customerPhone,
        quantity,
        paymentMode,
      });
      setErrors(res.errors);
    }
  }, [customerName, customerPhone, quantity, paymentMode]);

  // Calculations
  const currentBase = bases.find(b => b.id === selectedBase) || bases[0];
  const currentType = pizzas.find(t => t.id === selectedType) || pizzas[0];
  const currentTopping = toppings.find(p => p.id === selectedTopping) || toppings[0];

  const financials = currentBase && currentType && currentTopping
    ? calculateFinancials(quantity, currentBase.price, currentType.price, currentTopping.price)
    : { unitPrice: 0, subtotal: 0, discount: 0, postDiscountTotal: 0, gst: 0, finalTotal: 0, hasDiscount: false };

  // Handle Order Submit
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setErrorMsg('');

    const inputData = {
      customerName,
      customerPhone,
      baseId: selectedBase,
      typeId: selectedType,
      toppingId: selectedTopping,
      quantity,
      paymentMode,
    };

    const validation = validatePizzaOrder(inputData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);

    try {
      // Map table ID to required ENUM source, e.g. Tablet_Table_1, Tablet_Table_2...
      // Supports Table 1 to 5. If tableId exceeds 5 or is invalid, fallback to Tablet_Table_1
      const normalizedTableId = ['1', '2', '3', '4', '5'].includes(tableId) ? tableId : '1';
      const orderSource = `Tablet_Table_${normalizedTableId}`;

      const pizzaDetails = {
        baseName: currentBase.name,
        pizzaName: currentType.name,
        toppingName: currentTopping.name,
      };

      const result = await submitOrder({ ...inputData, orderSource }, financials, pizzaDetails);

      if (result.success) {
        setOrderCompleted({
          orderId: result.order?.id || Math.floor(Math.random() * 89999 + 10000),
          customerName: customerName.trim(),
          tableId: tableId,
          pizzaName: currentType.name,
          baseName: currentBase.name,
          toppingName: currentTopping.name,
          quantity,
          finalTotal: financials.finalTotal,
          paymentMode,
        });

        // Background receipt simulation
        console.log(`[SMS Gateway] Dispatched table order receipt for ₹${financials.finalTotal.toFixed(2)} to ${customerPhone}`);
        setSmsNotification(`Digital receipt SMS has been dispatched to +91 ${customerPhone}`);
        setTimeout(() => setSmsNotification(null), 5000);

        // Reset fields
        setCustomerName('');
        setCustomerPhone('');
        setQuantity(1);
      } else {
        setErrorMsg(result.message || 'Error saving order.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to place table order. Check Supabase connection.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
        <p className="mt-4 text-sm text-slate-500 font-mono">Initializing Table {tableId} Ordering System...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-12 font-sans selection:bg-amber-100">
      {/* Table Header Banner */}
      <header className="bg-slate-900 text-white py-6 px-4 shadow border-b border-slate-800 text-center relative overflow-hidden">
        <div className="absolute top-[-50%] left-[-10%] w-[120%] h-[200%] bg-gradient-to-tr from-amber-500/10 to-orange-500/5 rotate-12 pointer-events-none" />
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
          <div className="bg-amber-500 text-slate-950 p-2 rounded-xl">
            <Pizza className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">SliceMatic Table Ordering</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Dine-in Tablet Station — Table #{tableId}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-8">
        <AnimatePresence mode="wait">
          {orderCompleted ? (
            <motion.div
              key="receipt"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-3xl shadow-xl border border-slate-200 p-8 max-w-lg mx-auto text-center"
            >
              <div className="inline-flex bg-emerald-100 p-3.5 rounded-2xl mb-5">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-display font-bold text-slate-900">Pizza Order Sent to Oven!</h2>
              <p className="text-sm text-slate-500 mt-2">Your order has been recorded directly for Table #{orderCompleted.tableId}.</p>

              {/* Digital receipt details */}
              <div className="my-6 bg-slate-50 rounded-2xl border border-slate-100 p-6 text-left space-y-3 font-mono text-xs">
                <div className="flex justify-between text-slate-400 border-b border-slate-200 pb-2">
                  <span>ORDER REFERENCE</span>
                  <span className="font-bold text-slate-700">#{orderCompleted.orderId}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>CUSTOMER</span>
                  <span className="font-semibold text-slate-800">{orderCompleted.customerName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>PIZZA</span>
                  <span className="font-semibold text-slate-800">{orderCompleted.pizzaName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>CRUST / BASE</span>
                  <span className="font-semibold text-slate-800">{orderCompleted.baseName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>TOPPING</span>
                  <span className="font-semibold text-slate-800">{orderCompleted.toppingName}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>QTY</span>
                  <span className="font-bold text-slate-800">{orderCompleted.quantity}x</span>
                </div>
                <div className="flex justify-between text-slate-600 border-t border-dashed border-slate-200 pt-2">
                  <span>PAYMENT MODE</span>
                  <span className="font-semibold text-slate-800">{orderCompleted.paymentMode}</span>
                </div>
                <div className="flex justify-between text-slate-900 border-t border-slate-200 pt-3 text-sm font-bold">
                  <span>FINAL TOTAL</span>
                  <span className="text-emerald-600">₹{orderCompleted.finalTotal.toFixed(2)}</span>
                </div>
              </div>

              {smsNotification && (
                <div className="bg-amber-50 text-amber-800 border border-amber-200 rounded-xl p-3 text-xs text-left mb-6 flex gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{smsNotification}</span>
                </div>
              )}

              <button
                onClick={() => setOrderCompleted(null)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3.5 px-4 rounded-xl transition duration-150 shadow"
              >
                Order Another Pizza
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="order-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start"
            >
              {/* Form Section */}
              <div className="md:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <h3 className="font-display font-semibold text-slate-900 text-lg">Build Your Pizza</h3>
                  <p className="text-xs text-slate-500">Pick your favorite base crust, type flavor, and premium toppings.</p>
                </div>

                <form onSubmit={handlePlaceOrder} className="space-y-6">
                  {/* Customer Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="table-customer-name" className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-slate-400" />
                        Your Name
                      </label>
                      <input
                        id="table-customer-name"
                        type="text"
                        required
                        placeholder="e.g. Robin"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none transition ${
                          errors.customerName ? 'border-red-300 focus:ring-red-500/10' : 'border-slate-200 focus:ring-amber-500/10'
                        }`}
                      />
                      {errors.customerName && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-0.5 font-medium">
                          <AlertCircle className="h-3 w-3" />
                          {errors.customerName}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="table-customer-phone" className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5 text-slate-400" />
                        Phone Number
                      </label>
                      <input
                        id="table-customer-phone"
                        type="text"
                        required
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                        className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none transition ${
                          errors.customerPhone ? 'border-red-300 focus:ring-red-500/10' : 'border-slate-200 focus:ring-amber-500/10'
                        }`}
                      />
                      {errors.customerPhone && (
                        <p className="text-xs text-rose-600 flex items-center gap-1 mt-0.5 font-medium">
                          <AlertCircle className="h-3 w-3" />
                          {errors.customerPhone}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pizza Base Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">1. Select Pizza Base</label>
                    <div className="grid grid-cols-2 gap-3">
                      {bases.map((base) => (
                        <button
                          key={base.id}
                          type="button"
                          onClick={() => setSelectedBase(base.id)}
                          className={`p-3 rounded-xl border text-left transition flex justify-between items-center cursor-pointer ${
                            selectedBase === base.id
                              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/10'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{base.name}</p>
                            <p className="text-xs text-slate-500">₹{base.price.toFixed(2)}</p>
                          </div>
                          {selectedBase === base.id && <Check className="h-4 w-4 text-amber-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pizza Type / Flavor Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">2. Choose Pizza Flavor</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {pizzas.map((type) => (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setSelectedType(type.id)}
                          className={`p-3.5 rounded-xl border text-left transition flex justify-between items-center cursor-pointer ${
                            selectedType === type.id
                              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/10'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{type.name}</p>
                            <p className="text-xs text-slate-500">₹{type.price.toFixed(2)}</p>
                          </div>
                          {selectedType === type.id && <Check className="h-4 w-4 text-amber-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Toppings Selector */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">3. Add Topping</label>
                    <div className="grid grid-cols-2 gap-3">
                      {toppings.map((topping) => (
                        <button
                          key={topping.id}
                          type="button"
                          onClick={() => setSelectedTopping(topping.id)}
                          className={`p-3 rounded-xl border text-left transition flex justify-between items-center cursor-pointer ${
                            selectedTopping === topping.id
                              ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-500/10'
                              : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{topping.name}</p>
                            <p className="text-xs text-slate-500">
                              {topping.price > 0 ? `+₹${topping.price.toFixed(2)}` : 'Free'}
                            </p>
                          </div>
                          {selectedTopping === topping.id && <Check className="h-4 w-4 text-amber-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quantity and Payment selection */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-100 pt-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">4. Quantity (1-10)</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-10 w-10 rounded-xl flex items-center justify-center font-bold border border-slate-200 transition cursor-pointer"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="number"
                          readOnly
                          className="w-16 bg-slate-50 border border-slate-200 rounded-xl h-10 text-center font-mono font-bold text-slate-800"
                          value={quantity}
                        />
                        <button
                          type="button"
                          onClick={() => setQuantity(prev => Math.min(10, prev + 1))}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-10 w-10 rounded-xl flex items-center justify-center font-bold border border-slate-200 transition cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">5. Digital Checkout Option</label>
                      <div className="flex gap-2">
                        {['UPI', 'Card', 'Cash'].map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setPaymentMode(mode as any)}
                            className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                              paymentMode === mode
                                ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-sm'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </form>
              </div>

              {/* Sidebar Invoice & Action Panel */}
              <div className="md:col-span-5 space-y-6">
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-900 text-white px-5 py-3.5 border-b border-slate-800 flex justify-between items-center">
                    <span className="font-display font-semibold text-sm">Summary Invoice</span>
                    <span className="font-mono text-[10px] text-slate-400">TABLE #{tableId}</span>
                  </div>

                  <div className="p-5 space-y-4">
                    {/* Live pizza combination title */}
                    <div className="border-b border-slate-100 pb-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Custom Build</span>
                      <h4 className="font-display font-bold text-slate-800 mt-1">{currentType?.name || 'Pizza Selection'}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {currentBase?.name} {currentTopping?.id !== 'none' && `+ ${currentTopping?.name}`}
                      </p>
                    </div>

                    {/* Breakdown */}
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-500">
                        <span>Base Crust</span>
                        <span>₹{(currentBase?.price || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Flavor Style</span>
                        <span>₹{(currentType?.price || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500">
                        <span>Premium Topping</span>
                        <span>₹{(currentTopping?.price || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-slate-700 border-t border-slate-100 pt-2 font-mono">
                        <span>Pizza Unit Price</span>
                        <span>₹{financials.unitPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-slate-700 pt-2 border-t border-slate-100">
                        <span>Subtotal ({quantity}x)</span>
                        <span>₹{financials.subtotal.toFixed(2)}</span>
                      </div>

                      {/* Discount display */}
                      {financials.hasDiscount && (
                        <div className="flex justify-between text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                          <span className="flex items-center gap-1">
                            <Percent className="h-3.5 w-3.5" />
                            10% Bulk Discount
                          </span>
                          <span>-₹{financials.discount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-slate-500 border-t border-slate-100 pt-2">
                        <span>GST Tax (18%)</span>
                        <span>₹{financials.gst.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between items-center text-slate-900 border-t border-dashed border-slate-200 pt-3 mt-2">
                        <span className="font-bold text-sm">Payable Amount</span>
                        <span className="font-mono font-extrabold text-xl text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                          ₹{financials.finalTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {errorMsg && (
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-xs text-rose-800 flex gap-2">
                        <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    <button
                      onClick={handlePlaceOrder}
                      disabled={submitting || !customerName.trim() || !customerPhone.trim()}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer mt-4"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Sending Order...</span>
                        </>
                      ) : (
                        <>
                          <span>Submit Dine-In Order</span>
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
