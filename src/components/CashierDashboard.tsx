/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Pizza,
  User,
  Phone,
  ShoppingCart,
  BadgePercent,
  CheckCircle,
  AlertCircle,
  Database,
  Sparkles,
  RefreshCw,
  Trash2,
  FileText,
  Check,
  Plus,
  Minus,
  HelpCircle,
  BarChart3,
  LogOut,
  Upload,
  Play,
  Printer,
  Settings,
  History,
  Wrench,
  Activity
} from 'lucide-react';
import { getActiveMenuItems, parseMenuTextFile, updateMenuFromParsedItems } from '../lib/menuService';
import { validatePizzaOrder, calculateFinancials, runPizzaUnitTests } from '../lib/pizzaValidation';
import { getSupabaseStatus, getSupabaseClient } from '../lib/supabaseClient';
import { submitOrder, getOrdersHistory, clearOrdersHistory, fetchSupabaseOrders } from '../lib/orderService';
import { PizzaBase, PizzaType, PizzaTopping, ValidationError, PaymentMode, UnitTestResult } from '../types';
import { 
  getInventory, 
  updateInventoryStock, 
  addInventoryIngredient, 
  removeInventoryIngredient, 
  getRecipeMappings, 
  addRecipeMapping, 
  removeRecipeMapping, 
  getInventoryTransactions,
  InventoryIngredient,
  RecipeMapping,
  InventoryTransaction
} from '../lib/inventoryService';

interface CashierDashboardProps {
  user: { username: string; role: 'cashier' | 'admin' };
  onLogout: () => void;
  onNavigateToAnalytics: () => void;
}

export default function CashierDashboard({ user, onLogout, onNavigateToAnalytics }: CashierDashboardProps) {
  // Menu options (loaded dynamically from database)
  const [bases, setBases] = useState<PizzaBase[]>([]);
  const [pizzas, setPizzas] = useState<PizzaType[]>([]);
  const [toppings, setToppings] = useState<PizzaTopping[]>([]);
  const [menuLoading, setMenuLoading] = useState(true);

  // Form selections
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [selectedBase, setSelectedBase] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedTopping, setSelectedTopping] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [paymentMode, setPaymentMode] = useState<PaymentMode | undefined>(undefined);

  // States
  const [errors, setErrors] = useState<ValidationError>({});
  const [nlInput, setNlInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<{ success: boolean; source: string; data: any; error?: string } | null>(null);

  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitAlert, setSubmitAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  const [testResults, setTestResults] = useState<UnitTestResult[]>([]);
  const [showTests, setShowTests] = useState(false);

  const [showConfirmGate, setShowConfirmGate] = useState(false);
  const [latestOrder, setLatestOrder] = useState<any | null>(null);
  const [smsToast, setSmsToast] = useState<string | null>(null);

  // File Upload statuses
  const [uploadStatus, setUploadStatus] = useState<{ [key: string]: { type: 'success' | 'error' | 'loading'; message: string } }>({});

  // LIVE INVENTORY STATES
  const [activeInventoryTab, setActiveInventoryTab] = useState<'stocks' | 'recipes' | 'audits'>('stocks');
  const [inventoryList, setInventoryList] = useState<InventoryIngredient[]>([]);
  const [recipesList, setRecipesList] = useState<RecipeMapping[]>([]);
  const [transactionsList, setTransactionsList] = useState<InventoryTransaction[]>([]);
  const [invLoading, setInvLoading] = useState(false);

  // Recipe Mapping Form
  const [mapSelectedCategory, setMapSelectedCategory] = useState<'base' | 'pizza' | 'topping'>('pizza');
  const [mapSelectedName, setMapSelectedName] = useState('');
  const [mapSelectedIngredientId, setMapSelectedIngredientId] = useState<number>(1);
  const [mapQuantityRequired, setMapQuantityRequired] = useState<number>(0.1);

  // Add Ingredient Form
  const [newIngName, setNewIngName] = useState('');
  const [newIngUnit, setNewIngUnit] = useState<'unit' | 'liter' | 'kg'>('kg');
  const [newIngStock, setNewIngStock] = useState<number>(10);
  const [newIngThreshold, setNewIngThreshold] = useState<number>(2);

  const supabaseStatus = getSupabaseStatus();

  // Load recipe/inventory data
  const loadInventoryData = async () => {
    setInvLoading(true);
    try {
      const inv = await getInventory();
      setInventoryList(inv);
      if (inv.length > 0) {
        setMapSelectedIngredientId(inv[0].inventory_id);
      }

      const rec = await getRecipeMappings();
      setRecipesList(rec);

      const tx = await getInventoryTransactions();
      setTransactionsList(tx);
    } catch (err) {
      console.error('Error loading inventory data:', err);
    } finally {
      setInvLoading(false);
    }
  };

  // Load order history from local storage and from Supabase if connected
  const loadOrderHistory = async () => {
    // 1. Load local history first (for fast render/fallback)
    const local = getOrdersHistory();
    setOrderHistory(local);

    // 2. Fetch from database if connected
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const cloudOrders = await fetchSupabaseOrders();
        if (cloudOrders && cloudOrders.length > 0) {
          setOrderHistory(cloudOrders);
        }
      } catch (err) {
        console.warn('Could not load order history from cloud database:', err);
      }
    }
  };

  // Load menu items and order history
  const loadMenuAndHistory = async () => {
    setMenuLoading(true);
    try {
      const menu = await getActiveMenuItems();
      setBases(menu.bases);
      setPizzas(menu.pizzas);
      setToppings(menu.toppings);

      if (menu.bases.length > 0) {
        setSelectedBase(menu.bases[0].id);
        setMapSelectedName(menu.bases[0].name);
      }
      if (menu.pizzas.length > 0) setSelectedType(menu.pizzas[0].id);
      if (menu.toppings.length > 0) setSelectedTopping(menu.toppings[0].id);

      await loadOrderHistory();
      await loadInventoryData();
    } catch (e) {
      console.error('Error loading dynamic cashier menu:', e);
    } finally {
      setMenuLoading(false);
    }
  };

  useEffect(() => {
    loadMenuAndHistory();
  }, []);

  // Stock adjustments
  const handleUpdateStock = async (inventoryId: number, currentVal: number, changeAmt: number) => {
    const newVal = Math.max(0, currentVal + changeAmt);
    try {
      await updateInventoryStock(inventoryId, newVal);
      await loadInventoryData();
    } catch (err) {
      console.error('Failed to update stock:', err);
    }
  };

  // Create new raw ingredient
  const handleCreateRawIngredient = async () => {
    if (!newIngName.trim()) return;
    try {
      await addInventoryIngredient(
        newIngName.trim(),
        newIngUnit,
        newIngStock,
        newIngThreshold
      );
      setNewIngName('');
      setNewIngStock(10);
      setNewIngThreshold(2);
      await loadInventoryData();
    } catch (err) {
      console.error('Failed to add ingredient:', err);
    }
  };

  // Remove raw ingredient
  const handleRemoveIngredient = async (inventoryId: number) => {
    try {
      await removeInventoryIngredient(inventoryId);
      await loadInventoryData();
    } catch (err) {
      console.error('Failed to remove ingredient:', err);
    }
  };

  // Create recipe mapping
  const handleCreateRecipeMapping = async () => {
    // Find item ID by looking in the selected category state (bases, pizzas, or toppings)
    let selectedItem: any = null;
    if (mapSelectedCategory === 'base') {
      selectedItem = bases.find(b => b.name === mapSelectedName);
    } else if (mapSelectedCategory === 'pizza') {
      selectedItem = pizzas.find(p => p.name === mapSelectedName);
    } else {
      selectedItem = toppings.find(t => t.name === mapSelectedName);
    }

    if (!selectedItem) {
      console.error('Menu item not found for mapping:', mapSelectedName);
      return;
    }

    const itemId = parseInt(selectedItem.id);
    if (isNaN(itemId)) {
      console.error('Item ID is not a number:', selectedItem.id);
      return;
    }

    try {
      await addRecipeMapping(itemId, mapSelectedIngredientId, mapQuantityRequired);
      await loadInventoryData();
    } catch (err) {
      console.error('Failed to map recipe ingredient:', err);
    }
  };

  // Remove recipe mapping
  const handleRemoveRecipeMapping = async (mapId: number) => {
    try {
      await removeRecipeMapping(mapId);
      await loadInventoryData();
    } catch (err) {
      console.error('Failed to remove recipe mapping:', err);
    }
  };

  // Auto-select first item when recipe category changes
  useEffect(() => {
    if (mapSelectedCategory === 'base' && bases.length > 0) {
      setMapSelectedName(bases[0].name);
    } else if (mapSelectedCategory === 'pizza' && pizzas.length > 0) {
      setMapSelectedName(pizzas[0].name);
    } else if (mapSelectedCategory === 'topping' && toppings.length > 0) {
      setMapSelectedName(toppings[0].name);
    }
  }, [mapSelectedCategory, bases, pizzas, toppings]);

  // Validate fields on change
  useEffect(() => {
    const res = validatePizzaOrder({
      customerName,
      customerPhone,
      quantity,
      paymentMode,
    });
    setErrors(res.errors);
  }, [customerName, customerPhone, quantity, paymentMode]);

  // Current selected item details
  const currentBase = bases.find(b => b.id === selectedBase) || bases[0];
  const currentType = pizzas.find(t => t.id === selectedType) || pizzas[0];
  const currentTopping = toppings.find(p => p.id === selectedTopping) || toppings[0];

  const financials = currentBase && currentType && currentTopping
    ? calculateFinancials(quantity, currentBase.price, currentType.price, currentTopping.price)
    : { unitPrice: 0, subtotal: 0, discount: 0, postDiscountTotal: 0, gst: 0, finalTotal: 0, hasDiscount: false };

  // AI Order Parser
  const handleAiParse = async () => {
    if (!nlInput.trim()) return;
    setAiLoading(true);
    setAiResult(null);

    try {
      const response = await fetch('/api/parse-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nlInput }),
      });

      const resData = await response.json();
      setAiResult(resData);

      if (resData.success && resData.data) {
        const extracted = resData.data;

        if (extracted.customer_name) setCustomerName(extracted.customer_name);
        if (extracted.customer_phone) setCustomerPhone(extracted.customer_phone);
        if (extracted.quantity) {
          const parsedQty = parseInt(extracted.quantity, 10);
          if (!isNaN(parsedQty)) setQuantity(parsedQty);
        }

        // Match Base
        if (extracted.base_name) {
          const matchedBase = bases.find(
            b => b.name.toLowerCase().includes(extracted.base_name.toLowerCase()) ||
                 extracted.base_name.toLowerCase().includes(b.name.toLowerCase())
          );
          if (matchedBase) setSelectedBase(matchedBase.id);
        }

        // Match Pizza
        if (extracted.pizza_name) {
          const matchedType = pizzas.find(
            t => t.name.toLowerCase().includes(extracted.pizza_name.toLowerCase()) ||
                 extracted.pizza_name.toLowerCase().includes(t.name.toLowerCase())
          );
          if (matchedType) setSelectedType(matchedType.id);
        }

        // Match Topping
        if (extracted.topping_name) {
          const matchedTopping = toppings.find(
            p => p.name.toLowerCase().includes(extracted.topping_name.toLowerCase()) ||
                 extracted.topping_name.toLowerCase().includes(p.name.toLowerCase())
          );
          if (matchedTopping) setSelectedTopping(matchedTopping.id);
        }

        // Match Payment
        if (extracted.payment_mode) {
          const mode = extracted.payment_mode;
          if (['Cash', 'Card', 'UPI'].includes(mode)) {
            setPaymentMode(mode as PaymentMode);
          }
        }
      }
    } catch (err: any) {
      setAiResult({
        success: false,
        source: 'error',
        data: null,
        error: err.message || 'Failed to connect to parser backend.',
      });
    } finally {
      setAiLoading(false);
    }
  };

  // SMS Simulator
  const sendMobileReceipt = (phoneNumber: string, orderId: string | number, finalTotal: number) => {
    console.log(`[SMS Gateway Sim] Sending to +91 ${phoneNumber}: Your SliceMatic order #${orderId} for ₹${finalTotal.toFixed(2)} is confirmed!`);
    setSmsToast(`Receipt successfully dispatched to +91 ${phoneNumber}`);
    setTimeout(() => setSmsToast(null), 6000);
  };

  // Handle Form Submit (Salesperson confirmation launcher)
  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAlert(null);

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
      setSubmitAlert({
        type: 'error',
        message: 'Order validation failed. Please fix form errors first.',
      });
      return;
    }

    if (!paymentMode) {
      setSubmitAlert({
        type: 'error',
        message: 'Please explicitly choose a payment mode (Cash, Card, or UPI) to check out.',
      });
      return;
    }

    setShowConfirmGate(true);
  };

  // DB Insert after gate confirmation
  const handleOrderConfirmAndSubmit = async () => {
    setShowConfirmGate(false);
    setSubmitLoading(true);
    setSubmitAlert(null);

    const inputData = {
      customerName,
      customerPhone,
      baseId: selectedBase,
      typeId: selectedType,
      toppingId: selectedTopping,
      quantity,
      paymentMode,
      orderSource: 'Counter',
    };

    try {
      const pizzaDetails = {
        baseName: currentBase.name,
        pizzaName: currentType.name,
        toppingName: currentTopping.name,
      };

      const result = await submitOrder(inputData, financials, pizzaDetails);

      if (result.success) {
        const orderId = result.order?.id || `local_${Math.floor(Math.random() * 899999 + 100000)}`;
        const timestamp = result.order?.created_at || new Date().toISOString();

        setLatestOrder({
          orderId,
          timestamp,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          pizzaName: currentType.name,
          baseName: currentBase.name,
          toppingName: currentTopping.name,
          pizzaPrice: currentType.price,
          basePrice: currentBase.price,
          toppingPrice: currentTopping.price,
          quantity,
          subtotal: financials.subtotal,
          discount: financials.discount,
          gst: financials.gst,
          finalTotal: financials.finalTotal,
          paymentMode,
        });

        // Clear forms
        setCustomerName('');
        setCustomerPhone('');
        setQuantity(1);
        setPaymentMode(undefined);
        setAiResult(null);

        // Reload lists
        await loadOrderHistory();
        await loadInventoryData();

        sendMobileReceipt(customerPhone, orderId, financials.finalTotal);
      } else {
        setSubmitAlert({
          type: 'error',
          message: result.message || 'Failed to submit order.',
        });
      }
    } catch (err: any) {
      setSubmitAlert({
        type: 'error',
        message: err.message || 'Database insert failed. Check Supabase parameters.',
      });
    } finally {
      setSubmitLoading(false);
    }
  };

  // Menu file upload updates availability dynamically
  const handleMenuFileUpload = (e: React.ChangeEvent<HTMLInputElement>, category: 'base' | 'pizza' | 'topping', label: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus(prev => ({ ...prev, [category]: { type: 'loading', message: `Uploading ${file.name}...` } }));

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) {
          setUploadStatus(prev => ({ ...prev, [category]: { type: 'error', message: 'Uploaded file is empty.' } }));
          return;
        }

        const parsedItems = parseMenuTextFile(text, category);
        const result = await updateMenuFromParsedItems(parsedItems, category);

        if (result.success) {
          setUploadStatus(prev => ({ 
            ...prev, 
            [category]: { type: 'success', message: `Successfully loaded ${result.count} active ${label} options!` } 
          }));
          
          // Refresh lists
          await loadMenuAndHistory();
        } else {
          setUploadStatus(prev => ({ ...prev, [category]: { type: 'error', message: result.error || 'Parsing error.' } }));
        }
      } catch (err: any) {
        setUploadStatus(prev => ({ ...prev, [category]: { type: 'error', message: err.message || 'File processing error.' } }));
      }
    };
    reader.readAsText(file);
  };

  const handleRunTests = () => {
    const results = runPizzaUnitTests();
    setTestResults(results);
    setShowTests(true);
  };

  const handleClearHistory = () => {
    clearOrdersHistory();
    setOrderHistory([]);
  };

  if (menuLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
        <p className="mt-4 text-sm text-slate-500 font-mono">Loading Cashier Terminal Configuration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* SECURITY BANNER & ADMIN BRIDGE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-50 text-indigo-700 p-2 rounded-xl border border-indigo-100">
            <User className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-slate-800">Welcome, Staff: <span className="text-indigo-600 font-bold">{user.username}</span></h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Role Privileges: <span className="uppercase font-semibold text-slate-600">{user.role}</span></p>
          </div>
        </div>

        <div className="flex gap-2">
          {user.role === 'admin' && (
            <button
              onClick={onNavigateToAnalytics}
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-2 px-4 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
            >
              <BarChart3 className="h-3.5 w-3.5 text-amber-400" />
              <span>Enter Admin Analytics</span>
            </button>
          )}
          <button
            onClick={onLogout}
            className="bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-semibold text-xs py-2 px-4 rounded-xl border border-slate-200 hover:border-rose-200 transition flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Switch Operator</span>
          </button>
        </div>
      </div>

      {/* NOTIFICATION TOASTS */}
      {submitAlert && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-start gap-3 shadow-sm border ${
            submitAlert.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {submitAlert.type === 'success' ? <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" /> : <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5 shrink-0" />}
          <div className="text-xs">
            <p className="font-semibold">{submitAlert.type === 'success' ? 'Task Succeeded' : 'Alert Rejected'}</p>
            <p className="mt-0.5">{submitAlert.message}</p>
          </div>
        </motion.div>
      )}

      {smsToast && (
        <div className="p-4 rounded-xl flex items-start gap-3 border border-amber-200 bg-amber-50 text-amber-800">
          <Sparkles className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-semibold">Receipt Summary Dispatched</p>
            <p className="mt-0.5">{smsToast}</p>
          </div>
        </div>
      )}

      {/* DYNAMIC PIZZA SEEDING FILE LOADER PANEL */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="border-b border-slate-100 pb-4 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-100 text-indigo-700 p-1.5 rounded-lg">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-slate-900">Dynamic Pizza Availability Seeder</h2>
              <p className="text-xs text-slate-500 font-sans">Upload .txt inventories to alter Crusts, Flavors, and Toppings availability on-the-fly</p>
            </div>
          </div>
          <span className="text-[10px] font-mono bg-indigo-50 text-indigo-600 font-bold px-2.5 py-0.5 rounded border border-indigo-100 uppercase">
            STATION 2
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Base Seeder */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-indigo-600">Inventory File 1</span>
              <h4 className="font-semibold text-slate-800 text-sm mt-1">Crust Base File</h4>
              <p className="text-xs text-slate-400 mt-1">Accepts: Types_of_Base.txt</p>
            </div>
            
            <div className="space-y-3">
              <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl bg-white p-4 cursor-pointer transition">
                <Upload className="h-5 w-5 text-slate-400 hover:text-indigo-500 mb-1" />
                <span className="text-xs font-medium text-slate-600">Choose Crust File</span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={(e) => handleMenuFileUpload(e, 'base', 'Crust Base')}
                  className="hidden"
                />
              </label>

              {uploadStatus['base'] && (
                <div className={`p-2.5 rounded-lg text-xs font-medium flex gap-1.5 ${
                  uploadStatus['base'].type === 'success' ? 'bg-emerald-50 text-emerald-700' : uploadStatus['base'].type === 'loading' ? 'bg-indigo-50 text-indigo-700 animate-pulse' : 'bg-rose-50 text-rose-700'
                }`}>
                  {uploadStatus['base'].type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  <span>{uploadStatus['base'].message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pizza Flavor Seeder */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-indigo-600">Inventory File 2</span>
              <h4 className="font-semibold text-slate-800 text-sm mt-1">Pizza Flavor Styles</h4>
              <p className="text-xs text-slate-400 mt-1">Accepts: Types_of_pizza.txt</p>
            </div>
            
            <div className="space-y-3">
              <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl bg-white p-4 cursor-pointer transition">
                <Upload className="h-5 w-5 text-slate-400 hover:text-indigo-500 mb-1" />
                <span className="text-xs font-medium text-slate-600">Choose Pizza File</span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={(e) => handleMenuFileUpload(e, 'pizza', 'Pizza Flavor')}
                  className="hidden"
                />
              </label>

              {uploadStatus['pizza'] && (
                <div className={`p-2.5 rounded-lg text-xs font-medium flex gap-1.5 ${
                  uploadStatus['pizza'].type === 'success' ? 'bg-emerald-50 text-emerald-700' : uploadStatus['pizza'].type === 'loading' ? 'bg-indigo-50 text-indigo-700 animate-pulse' : 'bg-rose-50 text-rose-700'
                }`}>
                  {uploadStatus['pizza'].type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  <span>{uploadStatus['pizza'].message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Premium Topping Seeder */}
          <div className="border border-slate-100 rounded-xl p-4 bg-slate-50 flex flex-col justify-between space-y-4">
            <div>
              <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-indigo-600">Inventory File 3</span>
              <h4 className="font-semibold text-slate-800 text-sm mt-1">Premium Toppings</h4>
              <p className="text-xs text-slate-400 mt-1">Accepts: Types_of_toppings.txt</p>
            </div>
            
            <div className="space-y-3">
              <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl bg-white p-4 cursor-pointer transition">
                <Upload className="h-5 w-5 text-slate-400 hover:text-indigo-500 mb-1" />
                <span className="text-xs font-medium text-slate-600">Choose Topping File</span>
                <input
                  type="file"
                  accept=".txt"
                  onChange={(e) => handleMenuFileUpload(e, 'topping', 'Premium Topping')}
                  className="hidden"
                />
              </label>

              {uploadStatus['topping'] && (
                <div className={`p-2.5 rounded-lg text-xs font-medium flex gap-1.5 ${
                  uploadStatus['topping'].type === 'success' ? 'bg-emerald-50 text-emerald-700' : uploadStatus['topping'].type === 'loading' ? 'bg-indigo-50 text-indigo-700 animate-pulse' : 'bg-rose-50 text-rose-700'
                }`}>
                  {uploadStatus['topping'].type === 'success' ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
                  <span>{uploadStatus['topping'].message}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* NATURAL LANGUAGE ORDER ASSISTANT */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="bg-amber-100 text-amber-700 p-1.5 rounded-lg">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display font-semibold text-slate-900">AI Natural Language Assistant</h2>
              <p className="text-xs text-slate-500">Transcribe walk-in staff inputs to populate order configurations</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 flex flex-col gap-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Spoken Sentence Input</label>
            <div className="relative">
              <textarea
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/15 focus:border-amber-500 transition pr-10"
                placeholder="Example: Rajan ordered 5 Cheese Burst Pepperoni pizzas, paying with UPI. Contact is 9876543210."
                value={nlInput}
                onChange={(e) => setNlInput(e.target.value)}
              />
              {nlInput && (
                <button onClick={() => setNlInput('')} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200 transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col justify-end">
            <button
              onClick={handleAiParse}
              disabled={aiLoading || !nlInput.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 text-white disabled:text-slate-400 py-3.5 px-4 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {aiLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-400" />}
              <span>Extract Order with AI</span>
            </button>
          </div>
        </div>

        {aiResult && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400 mb-2 font-mono">Parsed Payload Structure:</p>
            {aiResult.success ? (
              <pre className="bg-slate-950 text-slate-300 p-4 rounded-xl text-xs font-mono overflow-x-auto border border-slate-850">
                {JSON.stringify(aiResult.data, null, 2)}
              </pre>
            ) : (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-xs">
                {aiResult.error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* INVENTORY CONTROL & RECIPES MAPPING STATION */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500 text-slate-950 font-mono font-bold px-2 py-0.5 text-xs rounded">STATION 3</div>
            <h3 className="font-display font-semibold text-white flex items-center gap-2">
              <Database className="h-4 w-4 text-indigo-400" />
              <span>Inventory Control & Recipe Mapping Station</span>
            </h3>
          </div>
          <div className="flex gap-2 text-[10px] text-slate-400 font-mono">
            <span className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
              Ingredients: <strong className="text-white">{inventoryList.length}</strong>
            </span>
            <span className="bg-slate-800 px-2.5 py-1 rounded border border-slate-700">
              Recipes Mapped: <strong className="text-white">{recipesList.length}</strong>
            </span>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-1.5">
            <button
              onClick={() => setActiveInventoryTab('stocks')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition flex items-center gap-1.5 cursor-pointer ${
                activeInventoryTab === 'stocks'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>Live Ingredient Stocks</span>
              {inventoryList.filter(i => Number(i.current_stock) <= Number(i.reorder_threshold)).length > 0 && (
                <span className="bg-amber-500 text-slate-950 font-mono text-[9px] font-bold px-1.5 py-0.2 rounded-full animate-pulse">
                  {inventoryList.filter(i => Number(i.current_stock) <= Number(i.reorder_threshold)).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveInventoryTab('recipes')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition flex items-center gap-1.5 cursor-pointer ${
                activeInventoryTab === 'recipes'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Menu Recipe Mappings</span>
            </button>

            <button
              onClick={() => setActiveInventoryTab('audits')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition flex items-center gap-1.5 cursor-pointer ${
                activeInventoryTab === 'audits'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Audit Trails Log</span>
            </button>
          </div>

          <button
            onClick={loadInventoryData}
            disabled={invLoading}
            className="text-xs text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3 w-3 ${invLoading ? 'animate-spin' : ''}`} />
            <span>Sync Live Levels</span>
          </button>
        </div>

        <div className="p-6">
          {/* TAB 1: STOCKS */}
          {activeInventoryTab === 'stocks' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left: Ingredients table */}
              <div className="lg:col-span-8 space-y-4">
                <div className="overflow-x-auto border border-slate-100 rounded-xl bg-slate-50">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-100 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-4">Raw Ingredient</th>
                        <th className="py-3.5 px-4 text-center">Unit</th>
                        <th className="py-3.5 px-4 text-right">Current Stock</th>
                        <th className="py-3.5 px-4 text-right">Reorder Limit</th>
                        <th className="py-3.5 px-4 text-center">Health Status</th>
                        <th className="py-3.5 px-4 text-right">Modify Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventoryList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 font-mono">
                            No ingredients found. Seed them using the file uploader or register a new one on the right.
                          </td>
                        </tr>
                      ) : (
                        inventoryList.map(item => {
                          const isLow = Number(item.current_stock) <= Number(item.reorder_threshold);
                          return (
                            <tr key={item.inventory_id} className="hover:bg-white transition">
                              <td className="py-3 px-4 font-semibold text-slate-850 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                <span>{item.ingredient_name}</span>
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-400 uppercase">
                                {item.unit}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 text-sm">
                                {Number(item.current_stock).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-400">
                                {Number(item.reorder_threshold).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isLow ? (
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-mono text-[9px] font-bold border border-amber-200 animate-pulse">
                                    ⚠️ Reorder Warn
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-mono text-[9px] font-bold border border-emerald-200">
                                    ● Healthy
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                                  <button
                                    onClick={() => handleUpdateStock(item.inventory_id, Number(item.current_stock), -5)}
                                    className="px-1.5 py-0.5 hover:bg-slate-100 text-[10px] font-bold text-slate-500 rounded transition cursor-pointer"
                                    title="Deduct 5"
                                  >
                                    -5
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStock(item.inventory_id, Number(item.current_stock), -1)}
                                    className="px-1.5 py-0.5 hover:bg-slate-100 text-[10px] font-bold text-slate-500 rounded transition cursor-pointer"
                                    title="Deduct 1"
                                  >
                                    -1
                                  </button>
                                  <span className="w-px h-3.5 bg-slate-200"></span>
                                  <button
                                    onClick={() => handleUpdateStock(item.inventory_id, Number(item.current_stock), 1)}
                                    className="px-1.5 py-0.5 hover:bg-slate-100 text-[10px] font-bold text-indigo-600 rounded transition cursor-pointer"
                                    title="Add 1"
                                  >
                                    +1
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStock(item.inventory_id, Number(item.current_stock), 5)}
                                    className="px-1.5 py-0.5 hover:bg-slate-100 text-[10px] font-bold text-indigo-600 rounded transition cursor-pointer"
                                    title="Add 5"
                                  >
                                    +5
                                  </button>
                                  <span className="w-px h-3.5 bg-slate-200"></span>
                                  <button
                                    onClick={() => handleRemoveIngredient(item.inventory_id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                    title="Trash raw item"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right: Add new ingredient Form */}
              <div className="lg:col-span-4 bg-slate-50 p-5 rounded-xl border border-slate-150 space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                    <Plus className="h-4 w-4 text-indigo-600" />
                    <span>Register New Ingredient</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Define a raw stock item to track consumption metrics</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Ingredient Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Olive Oil, Sweet Corn"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={newIngName}
                      onChange={(e) => setNewIngName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Unit Category</label>
                      <select
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                        value={newIngUnit}
                        onChange={(e) => setNewIngUnit(e.target.value as any)}
                      >
                        <option value="kg">kg (Kilogram)</option>
                        <option value="liter">liter (Liter)</option>
                        <option value="unit">unit (Count)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Initial Stock</label>
                      <input
                        type="number"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none font-mono"
                        value={newIngStock}
                        onChange={(e) => setNewIngStock(parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Reorder Warning Threshold</label>
                    <input
                      type="number"
                      placeholder="Warning level limit"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none font-mono"
                      value={newIngThreshold}
                      onChange={(e) => setNewIngThreshold(parseFloat(e.target.value) || 0)}
                    />
                  </div>

                  <button
                    onClick={handleCreateRawIngredient}
                    disabled={!newIngName.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 py-2.5 px-3 rounded-lg text-xs font-semibold tracking-wide transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Create Raw Ingredient</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RECIPE MAPPINGS */}
          {activeInventoryTab === 'recipes' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left: Recipe table */}
              <div className="lg:col-span-8 space-y-4">
                <div className="overflow-x-auto border border-slate-100 rounded-xl bg-slate-50">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-100 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-3.5 px-4">Menu Selection Item</th>
                        <th className="py-3.5 px-4">Category</th>
                        <th className="py-3.5 px-4">Consumed Raw Ingredient</th>
                        <th className="py-3.5 px-4 text-right">Deduction Qty</th>
                        <th className="py-3.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recipesList.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-mono">
                            No menu recipe connections found. Map custom consumption on the right.
                          </td>
                        </tr>
                      ) : (
                        recipesList.map((map, index) => (
                          <tr key={`${map.item_id}_${map.inventory_id}_${index}`} className="hover:bg-white transition">
                            <td className="py-3 px-4 font-semibold text-slate-800">
                              {map.item_name}
                            </td>
                            <td className="py-3 px-4 font-mono text-[10px] uppercase text-slate-400">
                              <span className="bg-slate-200/50 px-2 py-0.5 rounded text-slate-600 text-[9px] font-bold">
                                {map.item_category || 'pizza'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-medium text-slate-600">
                              {map.ingredient_name}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-semibold text-slate-800">
                              {Number(map.quantity_required).toFixed(3)} {map.unit}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={() => handleRemoveRecipeMapping(map.ingredient_map_id)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                title="Remove mapping"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right: Map form */}
              <div className="lg:col-span-4 bg-slate-50 p-5 rounded-xl border border-slate-150 space-y-4">
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                    <Activity className="h-4 w-4 text-indigo-600" />
                    <span>Map Pizza Ingredient</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Determine how much of an ingredient is deducted on order placement</p>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">1. Menu Category</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={mapSelectedCategory}
                      onChange={(e) => setMapSelectedCategory(e.target.value as any)}
                    >
                      <option value="pizza">Pizza Flavors / Styles</option>
                      <option value="base">Crust Bases</option>
                      <option value="topping">Premium Toppings</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">2. Select Specific Item</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={mapSelectedName}
                      onChange={(e) => setMapSelectedName(e.target.value)}
                    >
                      {mapSelectedCategory === 'base' && bases.map(b => (
                        <option key={b.id} value={b.name}>{b.name}</option>
                      ))}
                      {mapSelectedCategory === 'pizza' && pizzas.map(p => (
                        <option key={p.id} value={p.name}>{p.name}</option>
                      ))}
                      {mapSelectedCategory === 'topping' && toppings.map(t => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">3. Raw Ingredient to Map</label>
                    <select
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none"
                      value={mapSelectedIngredientId}
                      onChange={(e) => setMapSelectedIngredientId(parseInt(e.target.value) || 1)}
                    >
                      {inventoryList.map(item => (
                        <option key={item.inventory_id} value={item.inventory_id}>
                          {item.ingredient_name} ({item.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">4. Quantity Consumed per Pizza</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.001"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none font-mono"
                        value={mapQuantityRequired}
                        onChange={(e) => setMapQuantityRequired(parseFloat(e.target.value) || 0.1)}
                      />
                      <span className="absolute right-3 top-2 text-[10px] font-bold font-mono text-slate-400 uppercase">
                        {inventoryList.find(i => i.inventory_id === mapSelectedIngredientId)?.unit || 'unit'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleCreateRecipeMapping}
                    disabled={inventoryList.length === 0}
                    className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 text-white disabled:text-slate-400 py-2.5 px-3 rounded-lg text-xs font-semibold tracking-wide transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 text-amber-400" />
                    <span>Register Mapping Connection</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUDITS */}
          {activeInventoryTab === 'audits' && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600">
                <p className="font-semibold flex items-center gap-1.5 text-slate-800">
                  <Activity className="h-4 w-4 text-indigo-500" />
                  <span>Interactive Real-time Transaction Audits Log</span>
                </p>
                <p className="mt-1 text-slate-400">
                  Whenever walk-in customers or tablet clients confirm pizza orders, raw ingredients are automatically depleted. This historical log records those atomic stock transactions.
                </p>
              </div>

              <div className="overflow-x-auto border border-slate-100 rounded-xl bg-slate-50">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-100 text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Audit ID</th>
                      <th className="py-3.5 px-4">Timestamp</th>
                      <th className="py-3.5 px-4">Order ID Reference</th>
                      <th className="py-3.5 px-4">Raw Ingredient</th>
                      <th className="py-3.5 px-4 text-right">Depleted Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactionsList.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-mono">
                          No stock transactions logged yet. Place an order to trigger live inventory depletion!
                        </td>
                      </tr>
                    ) : (
                      transactionsList.map(tx => (
                        <tr key={tx.transaction_id} className="hover:bg-white transition">
                          <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                            TXN-{tx.transaction_id}
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(tx.transaction_time).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-700">
                            #{tx.order_id}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {tx.ingredient_name}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-600">
                            -{Number(tx.quantity_used).toFixed(3)} {tx.unit}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CORE MANAGE REGISTER AND CUSTOMIZER SCREEN */}
      {!latestOrder ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* CUSTOMIZER CARD */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-amber-500 text-slate-950 font-mono font-bold px-2 py-0.5 text-xs rounded">SCREEN 1</span>
                <h3 className="font-display font-semibold text-white">Counter Sales Intake</h3>
              </div>
              <p className="text-[10px] text-slate-400 font-mono font-bold tracking-wider">ORDER COMPOSER</p>
            </div>

            <div className="p-6 space-y-6">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter alphabet string only (2-40 characters)"
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none transition ${
                    errors.customerName ? 'border-red-300 focus:ring-red-500/10' : 'border-slate-200 focus:ring-amber-500/10'
                  }`}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                {errors.customerName && <p className="text-xs text-rose-600 font-medium">{errors.customerName}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  Phone Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  maxLength={10}
                  placeholder="Exactly 10 digits starting with 6, 7, 8 or 9"
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-2.5 text-sm focus:bg-white focus:outline-none transition ${
                    errors.customerPhone ? 'border-red-300 focus:ring-red-500/10' : 'border-slate-200 focus:ring-amber-500/10'
                  }`}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value.replace(/\D/g, ''))}
                />
                {errors.customerPhone && <p className="text-xs text-rose-600 font-medium">{errors.customerPhone}</p>}
              </div>

              <div className="border-t border-slate-100 pt-5 space-y-5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">Crust & Composition Details</h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Base */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">1. Select Pizza Crust Base</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition"
                      value={selectedBase}
                      onChange={(e) => setSelectedBase(e.target.value)}
                    >
                      {bases.map(b => (
                        <option key={b.id} value={b.id}>{b.name} (₹{b.price.toFixed(2)})</option>
                      ))}
                    </select>
                  </div>

                  {/* Flavor / Type */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">2. Select Pizza Flavor</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                    >
                      {pizzas.map(t => (
                        <option key={t.id} value={t.id}>{t.name} (₹{t.price.toFixed(2)})</option>
                      ))}
                    </select>
                  </div>

                  {/* Topping */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">3. Add Premium Topping</label>
                    <select
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none transition"
                      value={selectedTopping}
                      onChange={(e) => setSelectedTopping(e.target.value)}
                    >
                      {toppings.map(p => (
                        <option key={p.id} value={p.id}>{p.name} {p.price > 0 ? `(+₹${p.price.toFixed(2)})` : '(Free)'}</option>
                      ))}
                    </select>
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">4. Total Quantity (1-10)</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-10 w-10 rounded-xl flex items-center justify-center font-bold border border-slate-200 transition cursor-pointer"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <input
                        type="number"
                        className="w-16 bg-slate-50 border border-slate-200 rounded-xl h-10 text-center font-mono font-bold text-slate-800"
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                      />
                      <button
                        type="button"
                        onClick={() => setQuantity(prev => Math.min(10, prev + 1))}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 h-10 w-10 rounded-xl flex items-center justify-center font-bold border border-slate-200 transition cursor-pointer"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    {errors.quantity && <p className="text-xs text-rose-600 font-medium">{errors.quantity}</p>}
                    {quantity >= 5 && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1 font-medium">
                        <BadgePercent className="h-4 w-4 text-emerald-500 shrink-0" />
                        10% Bulk Discount eligible! (Qty ≥ 5)
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDEBAR: LIVE INVOICE & DIGITAL CHECKOUT */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* SCREEN 2: LIVE INVOICE */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500 text-slate-950 font-mono font-bold px-2 py-0.5 text-xs rounded">SCREEN 2</span>
                  <h3 className="font-display font-semibold text-white">Live Invoice</h3>
                </div>
              </div>

              <div className="p-5 space-y-3.5 text-xs">
                <div className="border-b border-slate-100 pb-2.5">
                  <p className="text-xs text-slate-400 font-mono font-bold uppercase">Item Description</p>
                  <p className="font-semibold text-slate-800 text-sm mt-1">{currentType?.name}</p>
                  <p className="text-slate-500 text-[11px] mt-0.5">Crust: {currentBase?.name} | Topping: {currentTopping?.name}</p>
                </div>

                <div className="flex justify-between text-slate-500">
                  <span>Base Price</span>
                  <span>₹{(currentBase?.price || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Flavor Price</span>
                  <span>₹{(currentType?.price || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>Premium Topping</span>
                  <span>+₹{(currentTopping?.price || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-700 border-t border-slate-100 pt-2 font-mono text-[11px]">
                  <span>Unit Cost</span>
                  <span>₹{financials.unitPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-700 pt-2 border-t border-slate-100">
                  <span>Subtotal ({quantity}x)</span>
                  <span>₹{financials.subtotal.toFixed(2)}</span>
                </div>

                {financials.hasDiscount && (
                  <div className="flex justify-between text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1.5 rounded-lg border border-emerald-100">
                    <span>Bulk Discount (10%)</span>
                    <span>-₹{financials.discount.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-500 pt-1 border-t border-slate-100">
                  <span>GST Tax (18%)</span>
                  <span>₹{financials.gst.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-900 border-t-2 border-dashed border-slate-200 pt-3.5 mt-3">
                  <span className="font-display font-bold text-sm">Payable Cost</span>
                  <span className="font-mono font-extrabold text-xl text-slate-900 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg">
                    ₹{financials.finalTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* SCREEN 3: PAYMENT & SUBMIT */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="bg-amber-500 text-slate-950 font-mono font-bold px-2 py-0.5 text-xs rounded">SCREEN 3</span>
                  <h3 className="font-display font-semibold text-white">Payment Checkout</h3>
                </div>
              </div>

              <div className="p-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {['Cash', 'Card', 'UPI'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode as any)}
                      className={`py-2.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        paymentMode === mode ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleOrderSubmit}
                  disabled={submitLoading || !customerName.trim() || !customerPhone.trim() || !paymentMode}
                  className="w-full bg-slate-950 hover:bg-slate-850 disabled:bg-slate-100 text-white disabled:text-slate-400 py-3 rounded-xl font-semibold text-sm transition shadow flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  <span>Submit Walk-In Checkout</span>
                </button>
              </div>
            </div>

          </div>
        </div>
      ) : (
        /* THERMAL RECEIPT DISPLAY SCREEN */
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-3xl shadow border border-slate-200 p-8 max-w-md mx-auto text-center"
        >
          <div className="inline-flex bg-emerald-100 p-3 rounded-2xl mb-4">
            <CheckCircle className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-display font-bold text-slate-900">Walk-In Checkout Successful</h2>
          <p className="text-xs text-slate-400 font-mono mt-1">Cashier Station Terminal #{latestOrder.orderId}</p>

          <div className="my-6 border-y border-dashed border-slate-200 py-5 text-left font-mono text-xs space-y-2 text-slate-600 leading-relaxed">
            <div className="flex justify-between font-bold text-slate-800 pb-2 border-b border-slate-100">
              <span>CUSTOMER</span>
              <span>{latestOrder.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span>PHONE</span>
              <span>{latestOrder.customerPhone}</span>
            </div>
            <div className="flex justify-between">
              <span>PIZZA STYLE</span>
              <span className="font-semibold text-slate-800">{latestOrder.pizzaName}</span>
            </div>
            <div className="flex justify-between">
              <span>CRUST BASE</span>
              <span className="text-slate-800">{latestOrder.baseName}</span>
            </div>
            <div className="flex justify-between">
              <span>TOPPING</span>
              <span>{latestOrder.toppingName}</span>
            </div>
            <div className="flex justify-between font-bold text-slate-800 border-t border-slate-100 pt-2">
              <span>QUANTITY</span>
              <span>{latestOrder.quantity}x</span>
            </div>
            <div className="flex justify-between">
              <span>SUBTOTAL</span>
              <span>₹{latestOrder.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-emerald-600 font-semibold">
              <span>DISCOUNT</span>
              <span>-₹{latestOrder.discount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>GST TAX (18%)</span>
              <span>₹{latestOrder.gst.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-950 font-bold border-t border-slate-200 pt-2 text-sm">
              <span>FINAL RECONCILED</span>
              <span className="text-emerald-700 bg-slate-50 px-1.5 rounded">₹{latestOrder.finalTotal.toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={() => setLatestOrder(null)}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl transition shadow cursor-pointer"
          >
            Open Register for Next Order
          </button>
        </motion.div>
      )}

      {/* WALK-IN CASHIER SALESPERSON CONFIRMATION GATE */}
      <AnimatePresence>
        {showConfirmGate && (
          <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="bg-slate-900 text-white px-6 py-4 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <h3 className="font-display font-semibold">Salesperson Checkout Confirmation</h3>
              </div>
              
              <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">Please verbally confirm the calculated invoice and payment collection with the customer before completing the cashier transaction.</p>
                
                <div className="bg-slate-50 rounded-xl p-4.5 border border-slate-100 text-xs font-mono space-y-2 text-slate-600">
                  <div className="flex justify-between">
                    <span>CUSTOMER</span>
                    <strong className="text-slate-800">{customerName}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>PHONE NUMBER</span>
                    <strong className="text-slate-800">{customerPhone}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>ORDER DESCRIPTION</span>
                    <strong className="text-slate-800 truncate max-w-[200px]">{currentType?.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>QUANTITY</span>
                    <strong className="text-slate-800">{quantity}x</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>PAYMENT MODE</span>
                    <strong className="text-indigo-600">{paymentMode}</strong>
                  </div>
                  <div className="flex justify-between text-slate-900 border-t border-slate-200 pt-2 text-sm font-bold">
                    <span>TOTAL PAYABLE</span>
                    <span className="text-emerald-700">₹{financials.finalTotal.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setShowConfirmGate(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-xs border border-slate-200 transition cursor-pointer"
                  >
                    Modify Order
                  </button>
                  <button
                    onClick={handleOrderConfirmAndSubmit}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition shadow cursor-pointer"
                  >
                    Confirm &amp; Place Order
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TRANSACTION HISTORIC LOG LIST */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="border-b border-slate-100 pb-4 mb-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-slate-500" />
            <h3 className="font-semibold text-slate-900">Historic Logs of Active Shift</h3>
          </div>
          {orderHistory.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="text-xs text-rose-500 hover:text-rose-700 font-semibold transition cursor-pointer"
            >
              Clear Local Shift History
            </button>
          )}
        </div>

        {orderHistory.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 font-mono text-slate-400 uppercase">
                  <th className="p-3">Ref ID</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Subtotal</th>
                  <th className="p-3">GST Tax</th>
                  <th className="p-3">Payable</th>
                  <th className="p-3">Payment</th>
                </tr>
              </thead>
              <tbody>
                {orderHistory.map((order, idx) => (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="p-3 font-mono font-bold text-slate-500">#{order.id}</td>
                    <td className="p-3 font-semibold text-slate-700">{order.customer_name}</td>
                    <td className="p-3 font-mono">{order.customer_phone}</td>
                    <td className="p-3 text-center font-bold">{order.quantity}</td>
                    <td className="p-3 font-mono">₹{parseFloat(order.subtotal || 0).toFixed(2)}</td>
                    <td className="p-3 font-mono">₹{parseFloat(order.gst || 0).toFixed(2)}</td>
                    <td className="p-3 font-mono font-bold text-emerald-700">₹{parseFloat(order.final_total || 0).toFixed(2)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-slate-100 border border-slate-200">
                        {order.payment_mode}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-400 text-xs">
            No transactions saved in the current cashier shift yet.
          </div>
        )}
      </div>

      {/* VISUAL UNIT TEST SUITE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-emerald-500" />
            <h3 className="font-semibold text-slate-900">Pizza Order Intake Rule Validation Tests</h3>
          </div>
          <button
            onClick={handleRunTests}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
          >
            Launch Unit Tests
          </button>
        </div>

        {showTests && (
          <div className="space-y-2">
            {testResults.map((test, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between text-xs gap-4">
                <div>
                  <p className="font-semibold text-slate-800">{test.name}</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">{test.description}</p>
                </div>
                <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                  test.passed ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  {test.passed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
