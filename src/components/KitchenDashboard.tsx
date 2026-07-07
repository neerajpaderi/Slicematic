/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Pizza,
  Clock,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  LogOut,
  ArrowLeft,
  ChevronRight,
  Check,
  ShoppingCart,
  Play,
  CheckSquare,
  Activity
} from 'lucide-react';
import { fetchSupabaseOrders, getOrdersHistory } from '../lib/orderService';
import { getSupabaseStatus } from '../lib/supabaseClient';
import { 
  getKitchenStateForOrder, 
  approveOrderInKitchen, 
  updateKitchenOrderStatus, 
  KitchenState 
} from '../lib/kitchenService';

interface KitchenDashboardProps {
  user: { username: string; role: 'cashier' | 'admin' | 'kitchen' };
  onLogout: () => void;
  onNavigateToCashier: () => void;
}

// Countdown Sub-component
interface TimerCountdownProps {
  approvedAt: string;
}

function TimerCountdown({ approvedAt }: TimerCountdownProps) {
  const [timeLeft, setTimeLeft] = useState<string>('5:00');
  const [isOvertime, setIsOvertime] = useState<boolean>(false);

  useEffect(() => {
    const calculateTime = () => {
      if (!approvedAt) return;
      const approvedTime = new Date(approvedAt).getTime();
      const fiveMinutesInMs = 5 * 60 * 1000;
      const targetTime = approvedTime + fiveMinutesInMs;
      const now = Date.now();
      const diff = targetTime - now;

      if (diff <= 0) {
        setIsOvertime(true);
        const positiveDiff = Math.abs(diff);
        const mins = Math.floor(positiveDiff / 60000);
        const secs = Math.floor((positiveDiff % 60000) / 1000);
        setTimeLeft(`+${mins}:${secs < 10 ? '0' : ''}${secs}`);
      } else {
        setIsOvertime(false);
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs < 10 ? '0' : ''}${secs}`);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [approvedAt]);

  return (
    <span className={`inline-flex items-center gap-1 font-mono font-bold text-xs px-2 py-1 rounded-lg border shadow-sm ${
      isOvertime 
        ? 'bg-rose-50 border-rose-200 text-rose-700 animate-pulse' 
        : 'bg-amber-50 border-amber-200 text-amber-700'
    }`}>
      <Clock className="h-3 w-3 shrink-0" />
      <span>{timeLeft}</span>
    </span>
  );
}

export default function KitchenDashboard({ user, onLogout, onNavigateToCashier }: KitchenDashboardProps) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kitchenStates, setKitchenStates] = useState<{ [orderId: string]: KitchenState }>({});

  const supabaseStatus = getSupabaseStatus();

  // Load all orders and corresponding kitchen statuses
  const loadOrdersAndStates = async () => {
    setRefreshing(true);
    try {
      let ordersList: any[] = [];
      if (supabaseStatus.configured) {
        ordersList = await fetchSupabaseOrders();
      } else {
        ordersList = getOrdersHistory();
      }
      setOrders(ordersList);

      // Load kitchen states for all orders
      const states: { [orderId: string]: KitchenState } = {};
      ordersList.forEach((order) => {
        const id = order.id;
        states[id] = getKitchenStateForOrder(id);
      });
      setKitchenStates(states);
    } catch (e) {
      console.error('Error loading kitchen orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadOrdersAndStates();

    // Listen to storage changes to keep multi-frame views synchronized
    const handleStorageChange = () => {
      loadOrdersAndStates();
    };
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Handle Kitchen Approval & Token Allocation
  const handleApprove = (orderId: string) => {
    const newState = approveOrderInKitchen(orderId);
    setKitchenStates(prev => ({ ...prev, [orderId]: newState }));
    // Force immediate local storage synchrony event
    window.dispatchEvent(new Event('storage'));
  };

  // Handle Status Transitions
  const handleStatusTransition = (orderId: string, nextStatus: 'Pending' | 'Preparing' | 'Ready' | 'Completed') => {
    const newState = updateKitchenOrderStatus(orderId, nextStatus);
    setKitchenStates(prev => ({ ...prev, [orderId]: newState }));
    window.dispatchEvent(new Event('storage'));
  };

  // Grouping orders by state
  const pendingOrders = orders.filter(o => {
    const state = kitchenStates[o.id] || { status: 'Pending' };
    return state.status === 'Pending';
  });

  const preparingOrders = orders.filter(o => {
    const state = kitchenStates[o.id] || { status: 'Pending' };
    return state.status === 'Preparing';
  });

  const readyOrders = orders.filter(o => {
    const state = kitchenStates[o.id] || { status: 'Pending' };
    return state.status === 'Ready';
  });

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-12">
      {/* HEADER SECTION */}
      <div className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 rounded-2xl shadow-md">
              <Pizza className="h-6 w-6 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-xl font-display font-black tracking-tight text-white flex items-center gap-2">
                SliceMatic Kitchen <span className="text-amber-400 bg-amber-500/10 text-xs px-2 py-0.5 rounded border border-amber-400/20">DESK</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                Operator: <span className="text-amber-400 font-bold">{user.username}</span> | Role: <span className="uppercase text-slate-300">{user.role}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            {refreshing ? (
              <RefreshCw className="h-4 w-4 animate-spin text-amber-400" />
            ) : (
              <button
                onClick={loadOrdersAndStates}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="Refresh Orders"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            )}

            {(user.role === 'admin' || user.role === 'cashier') && (
              <button
                onClick={onNavigateToCashier}
                className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs py-2 px-3.5 rounded-xl border border-slate-700 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Cashier Desk</span>
              </button>
            )}

            <button
              onClick={onLogout}
              className="bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 font-semibold text-xs py-2 px-3.5 rounded-xl border border-slate-700 hover:border-rose-900/60 shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* WORKSPACE PANELS */}
      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 bg-white rounded-3xl border border-slate-200">
            <RefreshCw className="h-8 w-8 text-amber-500 animate-spin" />
            <p className="mt-4 text-sm text-slate-500 font-mono">Gathering active tickets for the kitchen...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* COLUMN 1: PENDING TICKETS */}
            <div className="bg-slate-100/80 rounded-2xl border border-slate-200/60 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                  <h3 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">
                    Incoming Orders
                  </h3>
                </div>
                <span className="bg-amber-100 text-amber-800 font-mono font-black text-xs px-2 py-0.5 rounded-full">
                  {pendingOrders.length}
                </span>
              </div>

              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {pendingOrders.length > 0 ? (
                    pendingOrders.map((order) => (
                      <motion.div
                        key={order.id}
                        layout
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -50 }}
                        className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3.5 hover:border-amber-300 transition"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] text-slate-400 font-mono font-bold block">
                              REF ID: #{order.id}
                            </span>
                            <span className="font-semibold text-slate-800 text-sm block mt-0.5">
                              {order.customer_name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block">
                              Phone: {order.customer_phone}
                            </span>
                          </div>
                          <span className="bg-slate-100 border border-slate-200 text-slate-500 font-mono text-[9px] px-1.5 py-0.5 rounded-md">
                            {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Order Items List */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                          {order.items && order.items.length > 0 ? (
                            <div className="space-y-2">
                              {order.items.map((item: any, idx: number) => (
                                <div key={idx} className="text-xs text-slate-700 border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                                  <div className="flex justify-between font-semibold">
                                    <span>{item.pizzaName || item.pizza_name}</span>
                                    <span className="font-mono text-slate-500 bg-slate-200 px-1.5 rounded text-[10px]">{item.quantity}x</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                    Crust: {item.baseName || item.base_name} | Topping: {item.toppingName || item.topping_name}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-700">
                              <div className="flex justify-between font-semibold">
                                <span>{order.pizza?.pizzaName || order.pizza?.pizza_name || 'Custom Pizza'}</span>
                                <span className="font-mono text-slate-500 bg-slate-200 px-1.5 rounded text-[10px]">{order.quantity}x</span>
                              </div>
                              <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                Crust: {order.pizza?.baseName || order.pizza?.base_name || 'Thin Crust'} | Topping: {order.pizza?.toppingName || order.pizza?.topping_name || 'None'}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <button
                          onClick={() => handleApprove(order.id)}
                          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                          <Play className="h-3.5 w-3.5 shrink-0" />
                          <span>Approve & Start 5m Timer</span>
                        </button>
                      </motion.div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-100">
                      No incoming pizza orders at the moment.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* COLUMN 2: COOKING TICKETS */}
            <div className="bg-orange-50/50 rounded-2xl border border-orange-200/60 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-orange-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-orange-500 animate-pulse" />
                  <h3 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">
                    In the Oven / Preparing
                  </h3>
                </div>
                <span className="bg-orange-100 text-orange-800 font-mono font-black text-xs px-2 py-0.5 rounded-full">
                  {preparingOrders.length}
                </span>
              </div>

              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {preparingOrders.length > 0 ? (
                    preparingOrders.map((order) => {
                      const kitchenState = kitchenStates[order.id];
                      return (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white rounded-xl border border-orange-100 p-4 shadow-sm space-y-3 hover:border-orange-200 transition"
                        >
                          <div className="flex justify-between items-start gap-2">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="bg-slate-900 text-amber-400 font-mono font-black text-xs px-2 py-0.5 rounded shadow-sm">
                                  {kitchenState?.tokenNumber}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Ref #{order.id}
                                </span>
                              </div>
                              <span className="font-semibold text-slate-800 text-sm block mt-1.5">
                                {order.customer_name}
                              </span>
                            </div>
                            
                            {kitchenState?.approvedAt && (
                              <TimerCountdown approvedAt={kitchenState.approvedAt} />
                            )}
                          </div>

                          {/* Order Items List */}
                          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            {order.items && order.items.length > 0 ? (
                              <div className="space-y-2">
                                {order.items.map((item: any, idx: number) => (
                                  <div key={idx} className="text-xs text-slate-700 border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                                    <div className="flex justify-between font-semibold">
                                      <span>{item.pizzaName || item.pizza_name}</span>
                                      <span className="font-mono text-slate-500 bg-slate-200 px-1.5 rounded text-[10px]">{item.quantity}x</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                      Crust: {item.baseName || item.base_name} | Topping: {item.toppingName || item.topping_name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-700">
                                <div className="flex justify-between font-semibold">
                                  <span>{order.pizza?.pizzaName || order.pizza?.pizza_name || 'Custom Pizza'}</span>
                                  <span className="font-mono text-slate-500 bg-slate-200 px-1.5 rounded text-[10px]">{order.quantity}x</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                  Crust: {order.pizza?.baseName || order.pizza?.base_name || 'Thin Crust'} | Topping: {order.pizza?.toppingName || order.pizza?.topping_name || 'None'}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <button
                            onClick={() => handleStatusTransition(order.id, 'Ready')}
                            className="w-full bg-orange-500 hover:bg-orange-400 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                          >
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span>Mark as Ready</span>
                          </button>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-100">
                      Oven is currently empty. Start baking!
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* COLUMN 3: READY TICKETS */}
            <div className="bg-emerald-50/50 rounded-2xl border border-emerald-200/60 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <h3 className="font-bold text-slate-800 text-sm font-display uppercase tracking-wider">
                    Ready for Dispatch
                  </h3>
                </div>
                <span className="bg-emerald-100 text-emerald-800 font-mono font-black text-xs px-2 py-0.5 rounded-full">
                  {readyOrders.length}
                </span>
              </div>

              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                <AnimatePresence initial={false}>
                  {readyOrders.length > 0 ? (
                    readyOrders.map((order) => {
                      const kitchenState = kitchenStates[order.id];
                      return (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="bg-white rounded-xl border border-emerald-100 p-4 shadow-sm space-y-3 hover:border-emerald-200 transition"
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1.5">
                              <span className="bg-emerald-600 text-white font-mono font-black text-xs px-2 py-0.5 rounded shadow-sm animate-pulse">
                                {kitchenState?.tokenNumber}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Ref #{order.id}
                              </span>
                            </div>
                            <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 font-bold uppercase tracking-wider">
                              Ready
                            </span>
                          </div>

                          {/* Order Items List */}
                          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                            {order.items && order.items.length > 0 ? (
                              <div className="space-y-2">
                                {order.items.map((item: any, idx: number) => (
                                  <div key={idx} className="text-xs text-slate-700 border-b border-slate-100 last:border-0 pb-1.5 last:pb-0">
                                    <div className="flex justify-between font-semibold">
                                      <span>{item.pizzaName || item.pizza_name}</span>
                                      <span className="font-mono text-slate-500 bg-slate-200 px-1.5 rounded text-[10px]">{item.quantity}x</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                      Crust: {item.baseName || item.base_name} | Topping: {item.toppingName || item.topping_name}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-700">
                                <div className="flex justify-between font-semibold">
                                  <span>{order.pizza?.pizzaName || order.pizza?.pizza_name || 'Custom Pizza'}</span>
                                  <span className="font-mono text-slate-500 bg-slate-200 px-1.5 rounded text-[10px]">{order.quantity}x</span>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                                  Crust: {order.pizza?.baseName || order.pizza?.base_name || 'Thin Crust'} | Topping: {order.pizza?.toppingName || order.pizza?.topping_name || 'None'}
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Actions */}
                          <button
                            onClick={() => handleStatusTransition(order.id, 'Completed')}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer"
                          >
                            <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                            <span>Dispatch / Deliver</span>
                          </button>
                        </motion.div>
                      );
                    })
                  ) : (
                    <div className="py-12 text-center text-slate-400 text-xs bg-white rounded-xl border border-slate-100">
                      No ready orders waiting to be served.
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
