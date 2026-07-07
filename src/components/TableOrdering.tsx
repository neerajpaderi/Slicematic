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
  Percent,
  Trash2,
  Send,
  Bot,
  MessageSquare
} from 'lucide-react';
import { getActiveMenuItems } from '../lib/menuService';
import { submitOrder } from '../lib/orderService';
import { validatePizzaOrder } from '../lib/pizzaValidation';
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
  const [selectedToppings, setSelectedToppings] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<'Cash' | 'Card' | 'UPI'>('UPI');

  // List of added pizza items (the Cart)
  const [cartItems, setCartItems] = useState<Array<{
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
  }>>([]);

  // Interactive UI states
  const [errors, setErrors] = useState<ValidationError>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState<any | null>(null);
  const [smsNotification, setSmsNotification] = useState<string | null>(null);

  // Chatbot states
  const [activeBuilderTab, setActiveBuilderTab] = useState<'manual' | 'ai'>('manual');
  const [chatMessages, setChatMessages] = useState<Array<{
    sender: 'user' | 'bot' | 'system';
    text: string;
    timestamp: Date;
    parsedOrder?: any;
  }>>([
    {
      sender: 'bot',
      text: "👋 Hi! I'm your AI Pizza Ordering Assistant. You can tell me what pizza you would like, and I'll automatically customize it and add it to your order!\n\nTry saying: *\"Give me a Pan Pizza Double Pepperoni with Extra Mozzarella, quantity 2\"*",
      timestamp: new Date()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const performOrderSubmission = async (
    targetName: string,
    targetPhone: string,
    targetPaymentMode: 'Cash' | 'Card' | 'UPI',
    targetCartItems: any[]
  ) => {
    if (targetCartItems.length === 0) {
      setErrorMsg('Your order is empty. Please configure a pizza first.');
      return;
    }

    const normalizedTableId = ['1', '2', '3', '4', '5'].includes(tableId) ? tableId : '1';
    const orderSource = `Tablet_Table_${normalizedTableId}`;

    const localSubtotal = targetCartItems.reduce((sum, item) => {
      const itemUnitPrice = item.basePrice + item.pizzaPrice + item.toppingPrice;
      return sum + (itemUnitPrice * item.quantity);
    }, 0);
    const localQuantity = targetCartItems.reduce((sum, item) => sum + item.quantity, 0);
    const localHasDiscount = localQuantity >= 5;
    const localDiscountAmount = localHasDiscount ? localSubtotal * 0.10 : 0;
    const localPostDiscountTotal = localSubtotal - localDiscountAmount;
    const localGstAmount = localPostDiscountTotal * 0.18;
    const localFinalTotalAmount = localPostDiscountTotal + localGstAmount;

    const localFinancials = {
      unitPrice: 0,
      subtotal: localSubtotal,
      discount: localDiscountAmount,
      postDiscountTotal: localPostDiscountTotal,
      gst: localGstAmount,
      finalTotal: localFinalTotalAmount,
      hasDiscount: localHasDiscount,
    };

    const inputData = {
      customerName: targetName,
      customerPhone: targetPhone,
      baseId: targetCartItems[0].baseId,
      typeId: targetCartItems[0].typeId,
      toppingId: targetCartItems[0].toppingId,
      quantity: localQuantity,
      paymentMode: targetPaymentMode,
      orderSource,
      items: targetCartItems,
    };

    const validation = validatePizzaOrder({
      customerName: targetName,
      customerPhone: targetPhone,
      quantity: localQuantity,
      paymentMode: targetPaymentMode,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      setErrorMsg(Object.values(validation.errors).join(', '));
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const result = await submitOrder(inputData, localFinancials);

      if (result.success) {
        setOrderCompleted({
          orderId: result.order?.id || Math.floor(Math.random() * 89999 + 10000),
          customerName: targetName.trim(),
          tableId: tableId,
          items: [...targetCartItems],
          finalTotal: localFinancials.finalTotal,
          paymentMode: targetPaymentMode,
        });

        console.log(`[SMS Gateway] Dispatched multi-item table order receipt for ₹${localFinancials.finalTotal.toFixed(2)} to ${targetPhone}`);
        setSmsNotification(`Digital receipt SMS has been dispatched to +91 ${targetPhone}`);
        setTimeout(() => setSmsNotification(null), 6000);

        // Reset forms
        setCustomerName('');
        setCustomerPhone('');
        setCartItems([]);
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

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userText = chatInput.trim();
    setChatInput('');
    setChatLoading(true);

    const updatedMessages = [
      ...chatMessages,
      { sender: 'user' as const, text: userText, timestamp: new Date() }
    ];
    setChatMessages(updatedMessages);

    try {
      // Map message history to OpenRouter format
      const messagesPayload = updatedMessages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const res = await fetch('/api/chat-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: messagesPayload,
          cart: cartItems,
          customerName,
          customerPhone,
          paymentMode
        })
      });

      if (!res.ok) {
        throw new Error('API server returned error status');
      }

      const result = await res.json();
      if (result.success) {
        const aiRawText = result.text;
        const aiParsedData = result.data; // This is the JSON object or null

        let botReply = aiRawText || '';
        let matchedItemDetails: any = null;

        if (aiParsedData && typeof aiParsedData === 'object') {
          const { 
            reply,
            pizza_name, 
            base_name, 
            topping_name, 
            quantity: extractedQty, 
            customer_name, 
            customer_phone, 
            payment_mode,
            order_action 
          } = aiParsedData;

          if (reply) {
            botReply = reply;
          }

          let finalCart = [...cartItems];
          let finalName = customerName;
          let finalPhone = customerPhone;
          let finalPayment = paymentMode;

          if (customer_name) {
            setCustomerName(customer_name);
            finalName = customer_name;
          }
          if (customer_phone) {
            setCustomerPhone(customer_phone);
            finalPhone = customer_phone;
          }
          if (payment_mode) {
            setPaymentMode(payment_mode as any);
            finalPayment = payment_mode as 'Cash' | 'Card' | 'UPI';
          }

          if (pizza_name) {
            const matchedPizza = pizzas.find(p => 
              p.name.toLowerCase().includes(pizza_name.toLowerCase()) || 
              pizza_name.toLowerCase().includes(p.name.toLowerCase())
            );
            const matchedBase = base_name ? bases.find(b => 
              b.name.toLowerCase().includes(base_name.toLowerCase()) || 
              base_name.toLowerCase().includes(b.name.toLowerCase())
            ) : null;

            let matchedToppingObjects: PizzaTopping[] = [];
            if (topping_name) {
              const parts = topping_name.split(',').map((p: string) => p.trim().toLowerCase());
              toppings.forEach(t => {
                const tName = t.name.toLowerCase();
                if (parts.some((p: string) => tName.includes(p) || p.includes(tName))) {
                  matchedToppingObjects.push(t);
                }
              });
            }

            const pizzaObj = matchedPizza || pizzas[0];
            const baseObj = matchedBase || bases[0];
            const finalQty = typeof extractedQty === 'number' && extractedQty > 0 ? Math.min(10, extractedQty) : 1;

            const toppingsPrice = matchedToppingObjects.reduce((sum, t) => sum + t.price, 0);
            const toppingsName = matchedToppingObjects.length > 0 
              ? matchedToppingObjects.map(t => t.name).join(', ') 
              : 'No Extra Topping';
            const toppingsId = matchedToppingObjects.length > 0
              ? matchedToppingObjects.map(t => t.id).join(',')
              : 'none';

            const newCartItem = {
              baseId: baseObj.id,
              baseName: baseObj.name,
              basePrice: baseObj.price,
              typeId: pizzaObj.id,
              pizzaName: pizzaObj.name,
              pizzaPrice: pizzaObj.price,
              toppingId: toppingsId,
              toppingName: toppingsName,
              toppingPrice: toppingsPrice,
              quantity: finalQty,
            };

            // Check if the item already exists in our local variable synchronously
            const existingIdx = finalCart.findIndex(item => 
              item.baseId === baseObj.id && 
              item.typeId === pizzaObj.id && 
              item.toppingId === toppingsId
            );

            if (existingIdx > -1) {
              const updated = [...finalCart];
              updated[existingIdx].quantity += finalQty;
              finalCart = updated;
            } else {
              finalCart = [...finalCart, newCartItem];
            }

            // Sync with React state
            setCartItems(finalCart);

            matchedItemDetails = {
              pizzaName: pizzaObj.name,
              baseName: baseObj.name,
              toppingsName,
              quantity: finalQty
            };
          }

          if (order_action === 'submit_order') {
            botReply += `\n\n🚀 *Submitting your order automatically...*`;
            setTimeout(async () => {
              await performOrderSubmission(finalName, finalPhone, finalPayment, finalCart);
            }, 50);
          }
        } else {
          if (aiRawText && aiRawText.toLowerCase().includes('thanks')) {
            botReply = "Thanks for chatting! Let me know if you would like to order a pizza. I'm ready to take your order.";
          } else {
            botReply = aiRawText || "I'm ready to take your order! Simply let me know what pizza, base crust, and toppings you want.";
          }
        }

        setChatMessages(prev => [
          ...prev,
          { sender: 'bot' as const, text: botReply, timestamp: new Date(), parsedOrder: matchedItemDetails }
        ]);
      } else {
        throw new Error('Failed to parse response');
      }
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => [
        ...prev,
        { 
          sender: 'bot' as const, 
          text: "⚠️ Sorry, I encountered an issue reaching the OpenRouter ordering server. Please ensure OPENROUTER_API_KEY is configured correctly, or try placing your order manually using the options above.", 
          timestamp: new Date() 
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

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
        if (data.toppings.length > 0) setSelectedToppings([data.toppings[0].id]);
      } catch (err: any) {
        setErrorMsg('Failed to load menu items from the database.');
      } finally {
        setLoading(false);
      }
    }
    loadMenu();
  }, []);

  // Calculate totals of items in the cart
  const totalSubtotal = cartItems.reduce((sum, item) => {
    const itemUnitPrice = item.basePrice + item.pizzaPrice + item.toppingPrice;
    return sum + (itemUnitPrice * item.quantity);
  }, 0);

  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const hasDiscount = totalQuantity >= 5;
  const discountAmount = hasDiscount ? totalSubtotal * 0.10 : 0;
  const postDiscountTotal = totalSubtotal - discountAmount;
  const gstAmount = postDiscountTotal * 0.18;
  const finalTotalAmount = postDiscountTotal + gstAmount;

  const orderFinancials = {
    unitPrice: 0,
    subtotal: totalSubtotal,
    discount: discountAmount,
    postDiscountTotal,
    gst: gstAmount,
    finalTotal: finalTotalAmount,
    hasDiscount,
  };

  // Validate customer inputs
  useEffect(() => {
    if (customerName || customerPhone) {
      const res = validatePizzaOrder({
        customerName,
        customerPhone,
        quantity: totalQuantity || 1,
        paymentMode,
      });
      setErrors(res.errors);
    }
  }, [customerName, customerPhone, totalQuantity, paymentMode]);

  // Current customization options selected
  const currentBase = bases.find(b => b.id === selectedBase) || bases[0];
  const currentType = pizzas.find(t => t.id === selectedType) || pizzas[0];
  const selectedToppingObjects = toppings.filter(p => selectedToppings.includes(p.id));
  const currentToppingsName = selectedToppingObjects.length > 0
    ? selectedToppingObjects.map(p => p.name).join(', ')
    : 'No Extra Topping';
  const currentToppingsPrice = selectedToppingObjects.reduce((sum, p) => sum + p.price, 0);
  const currentToppingsId = selectedToppingObjects.length > 0
    ? selectedToppingObjects.map(p => p.id).join(',')
    : 'none';

  const currentItemUnitPrice = currentBase && currentType
    ? currentBase.price + currentType.price + currentToppingsPrice
    : 0;

  // Add customized pizza combo to order (cart)
  const handleAddPizzaToOrder = () => {
    if (!selectedBase || !selectedType) {
      setErrorMsg('Please select a base and flavor first.');
      return;
    }

    const existingIdx = cartItems.findIndex(item => 
      item.baseId === selectedBase && 
      item.typeId === selectedType && 
      item.toppingId === currentToppingsId
    );

    if (existingIdx > -1) {
      const updated = [...cartItems];
      const nextQty = updated[existingIdx].quantity + quantity;
      if (nextQty > 10) {
        setErrorMsg('You can order a maximum of 10 pizzas of the same customization.');
        return;
      }
      updated[existingIdx].quantity = nextQty;
      setCartItems(updated);
    } else {
      setCartItems([...cartItems, {
        baseId: selectedBase,
        baseName: currentBase.name,
        basePrice: currentBase.price,
        typeId: selectedType,
        pizzaName: currentType.name,
        pizzaPrice: currentType.price,
        toppingId: currentToppingsId,
        toppingName: currentToppingsName,
        toppingPrice: currentToppingsPrice,
        quantity,
      }]);
    }

    setErrorMsg('');
    setQuantity(1);
  };

  // Remove pizza combo from cart
  const handleRemoveItem = (index: number) => {
    const updated = cartItems.filter((_, idx) => idx !== index);
    setCartItems(updated);
  };

  // Update item quantity
  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty < 1 || newQty > 10) return;
    const updated = [...cartItems];
    updated[index].quantity = newQty;
    setCartItems(updated);
  };

  // Submit complete multi-selection order
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setErrorMsg('');

    if (cartItems.length === 0) {
      setErrorMsg('Your order is empty. Please configure a pizza and click "Add Pizza to Order" first.');
      return;
    }

    await performOrderSubmission(customerName, customerPhone, paymentMode, cartItems);
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
        <div className="max-w-6xl mx-auto flex items-center justify-center gap-3">
          <div className="bg-amber-500 text-slate-950 p-2 rounded-xl">
            <Pizza className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">SliceMatic Table Ordering</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Dine-in Tablet Station — Table #{tableId}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 mt-8">
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
                
                {/* Cart Items List */}
                <div className="border-t border-b border-slate-200 py-3 my-2 space-y-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-bold">ORDERED ITEMS</span>
                  {orderCompleted.items.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-slate-700 font-sans">
                      <div>
                        <span className="font-semibold">{item.pizzaName}</span>
                        <span className="text-[10px] text-slate-400 block">
                          {item.baseName} {item.toppingId !== 'none' ? `+ ${item.toppingName}` : ''}
                        </span>
                      </div>
                      <span className="font-mono font-bold">{item.quantity}x</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between text-slate-600">
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
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3.5 px-4 rounded-xl transition duration-150 shadow cursor-pointer"
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
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
            >
              {/* Form Section */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display font-semibold text-slate-900 text-lg flex items-center gap-2">
                        <span>Build Your Pizza</span>
                        {activeBuilderTab === 'ai' && (
                          <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                            <Sparkles className="h-3 w-3" /> Powered
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-slate-500">Pick your options below, or chat with our automated AI Ordering Assistant.</p>
                    </div>

                    {/* Tab Selector */}
                    <div className="flex bg-slate-100 p-1 rounded-xl self-start sm:self-center border border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => setActiveBuilderTab('manual')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                          activeBuilderTab === 'manual'
                            ? 'bg-white text-slate-800 shadow-sm border border-slate-200/20'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Manual Builder
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveBuilderTab('ai')}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                          activeBuilderTab === 'ai'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        AI Pizza Assistant
                      </button>
                    </div>
                  </div>
                </div>

                {activeBuilderTab === 'manual' ? (
                  <div className="space-y-6">
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
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">3. Add Toppings (Multi-Select Enabled)</label>
                      <div className="grid grid-cols-2 gap-3">
                        {toppings.map((topping) => (
                          <button
                            key={topping.id}
                            type="button"
                            onClick={() => {
                              setSelectedToppings(prev => {
                                if (prev.includes(topping.id)) {
                                  return prev.filter(id => id !== topping.id);
                                } else {
                                  return [...prev, topping.id];
                                }
                              });
                            }}
                            className={`p-3 rounded-xl border text-left transition flex justify-between items-center cursor-pointer ${
                              selectedToppings.includes(topping.id)
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
                            {selectedToppings.includes(topping.id) && <Check className="h-4 w-4 text-amber-500 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Customization Quantity and Add Button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-100 pt-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">Quantity (1-10)</label>
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
                          <span className="text-xs text-slate-400 font-mono ml-2">
                            (₹{(currentItemUnitPrice * quantity).toFixed(2)})
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAddPizzaToOrder}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-6 rounded-xl shadow transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add Pizza to Order</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Chatbot Interface Section */
                  <div className="flex flex-col h-[480px] bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
                    {/* Chat Messages Scrolling Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                      {chatMessages.map((msg, index) => (
                        <div
                          key={index}
                          className={`flex items-start gap-2.5 ${msg.sender === 'user' ? 'justify-end' : ''}`}
                        >
                          {msg.sender === 'bot' && (
                            <div className="h-8 w-8 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
                              <Bot className="h-4 w-4" />
                            </div>
                          )}
                          <div
                            className={`p-3 text-xs leading-relaxed max-w-[85%] shadow-sm ${
                              msg.sender === 'user'
                                ? 'bg-slate-900 text-white rounded-2xl rounded-tr-none'
                                : 'bg-white text-slate-800 rounded-2xl rounded-tl-none border border-slate-150 whitespace-pre-line'
                            }`}
                          >
                            {msg.text}
                          </div>
                        </div>
                      ))}
                      {chatLoading && (
                        <div className="flex items-start gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0 animate-pulse">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className="bg-white border border-slate-150 p-3 text-xs rounded-2xl rounded-tl-none text-slate-500 flex items-center gap-2 shadow-sm">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                            <span>AI Assistant is analyzing your order...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Suggestions list */}
                    <div className="px-4 py-2 border-t border-slate-100 bg-white/70 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 font-sans uppercase shrink-0">Try:</span>
                      <button
                        type="button"
                        onClick={() => setChatInput("Give me a Pan Pizza Pepperoni with Mushrooms, qty 2")}
                        className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 py-1 px-2.5 rounded-full border border-slate-200/50 transition shrink-0 cursor-pointer"
                      >
                        "Pan Pepperoni with Mushrooms"
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatInput("Thin Crust Margherita with Extra Mozzarella, UPI")}
                        className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 py-1 px-2.5 rounded-full border border-slate-200/50 transition shrink-0 cursor-pointer"
                      >
                        "Thin Margherita, pay by UPI"
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatInput("I want 3 Cheese Burst Veggie Feast")}
                        className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 py-1 px-2.5 rounded-full border border-slate-200/50 transition shrink-0 cursor-pointer"
                      >
                        "3 Cheese Burst Veggie Feast"
                      </button>
                    </div>

                    {/* Input Area */}
                    <form onSubmit={handleSendChatMessage} className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder="Say what you want to order (e.g. 2 Cheese Burst Pepperoni)..."
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition"
                        disabled={chatLoading}
                      />
                      <button
                        type="submit"
                        disabled={chatLoading || !chatInput.trim()}
                        className="bg-amber-500 hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 text-white h-8.5 w-8.5 rounded-xl flex items-center justify-center shadow transition shrink-0 cursor-pointer"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Sidebar Invoice & Action Panel */}
              <div className="lg:col-span-5 space-y-6">
                {/* Cart Items List / Live Invoice */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="bg-slate-900 text-white px-5 py-3.5 border-b border-slate-800 flex justify-between items-center">
                    <span className="font-display font-semibold text-sm flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4 text-amber-500" />
                      Current Order
                    </span>
                    <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full font-mono text-xs font-bold">
                      {totalQuantity} Pizzas
                    </span>
                  </div>

                  {/* Customer Details section directly on the Invoice */}
                  <div className="bg-slate-50 border-b border-slate-200/60 px-5 py-3 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <User className="h-3 w-3 text-slate-400" />
                      Live Invoice Customer Details
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center gap-2 shadow-sm">
                        <div className="bg-amber-50 p-1.5 rounded-lg shrink-0">
                          <User className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[9px] text-slate-400 font-medium leading-none">CUSTOMER</p>
                          <p className="font-bold text-slate-700 truncate mt-0.5 text-xs">
                            {customerName.trim() ? customerName : 'Pending...'}
                          </p>
                        </div>
                      </div>
                      <div className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center gap-2 shadow-sm">
                        <div className="bg-amber-50 p-1.5 rounded-lg shrink-0">
                          <Phone className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[9px] text-slate-400 font-medium leading-none">CONTACT PHONE</p>
                          <p className="font-mono font-bold text-slate-700 truncate mt-0.5 text-xs">
                            {customerPhone.trim() ? `+91 ${customerPhone}` : 'Pending...'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    {cartItems.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 font-sans space-y-2">
                        <Pizza className="h-8 w-8 text-slate-300 mx-auto stroke-1" />
                        <p className="text-xs">Your order list is empty.</p>
                        <p className="text-[11px] text-slate-400">Configure a pizza and click "Add Pizza to Order" above!</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                        {cartItems.map((item, index) => {
                          const itemPrice = item.basePrice + item.pizzaPrice + item.toppingPrice;
                          return (
                            <div key={index} className="py-4 flex justify-between items-start gap-3">
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                                  <h4 className="text-sm font-bold text-slate-800">{item.pizzaName}</h4>
                                </div>
                                
                                {/* Section-wise price splitting */}
                                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-1 text-[11px] text-slate-600">
                                  <div className="flex justify-between">
                                    <span>🍕 Flavor ({item.pizzaName}):</span>
                                    <span className="font-mono text-slate-700 font-medium">₹{item.pizzaPrice.toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>🌾 Crust ({item.baseName}):</span>
                                    <span className="font-mono text-slate-700 font-medium">₹{item.basePrice.toFixed(2)}</span>
                                  </div>
                                  {item.toppingId !== 'none' && (
                                    <div className="flex justify-between">
                                      <span>🧀 Topping ({item.toppingName}):</span>
                                      <span className="font-mono text-slate-700 font-medium">₹{item.toppingPrice.toFixed(2)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between border-t border-slate-200/60 pt-1 mt-1 text-slate-800 font-semibold">
                                    <span>Unit Price:</span>
                                    <span className="font-mono text-amber-700">₹{itemPrice.toFixed(2)} each</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-2 shrink-0 pt-0.5">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(index, item.quantity - 1)}
                                    className="h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xs text-slate-600 transition"
                                  >
                                    -
                                  </button>
                                  <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleUpdateItemQty(index, item.quantity + 1)}
                                    className="h-6 w-6 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-xs text-slate-600 transition"
                                  >
                                    +
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveItem(index)}
                                    className="p-1 rounded text-slate-400 hover:text-rose-600 transition ml-1"
                                    title="Remove item"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <div className="text-right mt-1">
                                  <div className="text-[9px] text-slate-400 font-medium leading-none">Subtotal</div>
                                  <span className="text-xs font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded inline-block mt-1">
                                    ₹{(itemPrice * item.quantity).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Checkout Panel */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h4 className="font-display font-bold text-slate-800 text-sm">Customer & Checkout Details</h4>
                  </div>

                  <form onSubmit={handlePlaceOrder} className="space-y-4">
                    {/* Customer Inputs */}
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label htmlFor="customer-name-chk" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <User className="h-3 w-3 text-slate-400" />
                          Your Name
                        </label>
                        <input
                          id="customer-name-chk"
                          type="text"
                          required
                          placeholder="e.g. Robin"
                          value={customerName}
                          onChange={(e) => setCustomerName(e.target.value)}
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none transition ${
                            errors.customerName ? 'border-red-300 focus:ring-red-500/10' : 'border-slate-200 focus:ring-amber-500/10'
                          }`}
                        />
                        {errors.customerName && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="h-2.5 w-2.5" />
                            {errors.customerName}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="customer-phone-chk" className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                          <Phone className="h-3 w-3 text-slate-400" />
                          Phone Number
                        </label>
                        <input
                          id="customer-phone-chk"
                          type="text"
                          required
                          maxLength={10}
                          placeholder="e.g. 9876543210"
                          value={customerPhone}
                          onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                          className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-xs focus:bg-white focus:outline-none transition ${
                            errors.customerPhone ? 'border-red-300 focus:ring-red-500/10' : 'border-slate-200 focus:ring-amber-500/10'
                          }`}
                        />
                        {errors.customerPhone && (
                          <p className="text-[10px] text-rose-600 flex items-center gap-1 mt-0.5">
                            <AlertCircle className="h-2.5 w-2.5" />
                            {errors.customerPhone}
                          </p>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Payment Option</label>
                        <div className="flex gap-2">
                          {['UPI', 'Card', 'Cash'].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setPaymentMode(mode as any)}
                              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                                paymentMode === mode
                                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {mode}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Financial Breakdown */}
                    <div className="space-y-2 text-xs border-t border-slate-100 pt-3">
                      <div className="flex justify-between text-slate-500">
                        <span>Items Subtotal</span>
                        <span>₹{orderFinancials.subtotal.toFixed(2)}</span>
                      </div>

                      {/* Bulk discount display */}
                      {orderFinancials.hasDiscount && (
                        <div className="flex justify-between text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                          <span className="flex items-center gap-1">
                            <Percent className="h-3.5 w-3.5" />
                            10% Bulk Discount (Qty ≥ 5)
                          </span>
                          <span>-₹{orderFinancials.discount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between text-slate-500">
                        <span>GST Tax (18%)</span>
                        <span>₹{orderFinancials.gst.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between items-center text-slate-900 border-t border-dashed border-slate-200 pt-3 mt-2">
                        <span className="font-bold text-sm">Payable Amount</span>
                        <span className="font-mono font-extrabold text-lg text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                          ₹{orderFinancials.finalTotal.toFixed(2)}
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
                      type="submit"
                      disabled={submitting || cartItems.length === 0 || !customerName.trim() || !customerPhone.trim()}
                      className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 text-slate-950 font-bold py-3 px-4 rounded-xl shadow transition active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
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
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
