/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  UserPlus,
  Shield,
  Users,
  Activity,
  Sparkles,
  RefreshCw,
  Copy,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  AlertCircle,
  CheckCircle,
  Database,
  ArrowLeft
} from 'lucide-react';
import { addStaffUser, getStaffUsers, StaffUser } from '../lib/authService';
import { getInventory, InventoryIngredient } from '../lib/inventoryService';
import { getSupabaseClient } from '../lib/supabaseClient';
import { fetchSupabaseOrders } from '../lib/orderService';

interface AnalyticsDashboardProps {
  user: { username: string; role: 'cashier' | 'admin' };
  onNavigateToCashier: () => void;
}

export default function AnalyticsDashboard({ user, onNavigateToCashier }: AnalyticsDashboardProps) {
  // Staff registration form states
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'cashier' | 'admin'>('cashier');
  const [formLoading, setFormLoading] = useState(false);
  const [formAlert, setFormAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Registered staff state
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);

  // Live Ingredient Stocks
  const [inventory, setInventory] = useState<InventoryIngredient[]>([]);
  const [invLoading, setInvLoading] = useState(false);

  // Business Performance SQL Analyst States
  const [analystQuestion, setAnalystQuestion] = useState('');
  const [analystLoading, setAnalystLoading] = useState(false);
  const [generatedSql, setGeneratedSql] = useState('');
  const [sqlExplanation, setSqlExplanation] = useState('');
  const [sqlColumns, setSqlColumns] = useState<string[]>([]);
  const [queryResultData, setQueryResultData] = useState<any[] | null>(null);
  const [analystError, setAnalystError] = useState('');
  const [copied, setCopied] = useState(false);

  // Real database stats for analytics overview
  const [stats, setStats] = useState({
    totalSales: 0,
    orderCount: 0,
    avgOrder: 0,
    activeStaffCount: 0
  });

  // Load stats from database or local history
  const loadStats = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      const existing = localStorage.getItem('slicematic_orders_history');
      if (existing) {
        try {
          const localHistory = JSON.parse(existing);
          if (localHistory.length > 0) {
            const totalSales = localHistory.reduce((sum: number, o: any) => sum + (parseFloat(o.final_total) || 0), 0);
            const orderCount = localHistory.length;
            const avgOrder = totalSales / orderCount;
            setStats(prev => ({
              ...prev,
              totalSales,
              orderCount,
              avgOrder,
            }));
          }
        } catch (e) {
          console.warn('Error calculating local stats:', e);
        }
      }
      return;
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*');

      if (error) {
        console.warn('Error loading real database stats:', error.message);
        return;
      }

      if (data && data.length > 0) {
        const totalSales = data.reduce((sum: number, o: any) => {
          const val = o.final_total !== undefined ? o.final_total : (o.subtotal || 0);
          return sum + (parseFloat(val) || 0);
        }, 0);
        const orderCount = data.length;
        const avgOrder = totalSales / orderCount;
        setStats(prev => ({
          ...prev,
          totalSales,
          orderCount,
          avgOrder,
        }));
      } else {
        setStats(prev => ({
          ...prev,
          totalSales: 0,
          orderCount: 0,
          avgOrder: 0,
        }));
      }
    } catch (err) {
      console.error('Exception loading database stats:', err);
    }
  };

  // Load staff list
  const loadStaff = async () => {
    setStaffLoading(true);
    try {
      const list = await getStaffUsers();
      setStaffList(list);
      setStats(prev => ({ ...prev, activeStaffCount: list.length }));
    } catch (e) {
      console.error('Error loading staff list:', e);
    } finally {
      setStaffLoading(false);
    }
  };

  const loadInventory = async () => {
    setInvLoading(true);
    try {
      const list = await getInventory();
      setInventory(list);
    } catch (e) {
      console.error('Error loading inventory list for Rajan:', e);
    } finally {
      setInvLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
    loadInventory();
    loadStats();
  }, []);

  // Handle Add Staff
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormAlert(null);

    if (!newUsername.trim() || !newPassword.trim()) {
      setFormAlert({ type: 'error', message: 'All staff configuration fields are required.' });
      return;
    }

    setFormLoading(true);

    try {
      const result = await addStaffUser(newUsername, newPassword, newRole);

      if (result.success) {
        setFormAlert({
          type: 'success',
          message: `Successfully registered ${newRole} account "${newUsername}" into the database!`,
        });
        setNewUsername('');
        setNewPassword('');
        setNewRole('cashier');
        
        // Reload list
        await loadStaff();
        await loadStats();
      } else {
        setFormAlert({
          type: 'error',
          message: result.error || 'Failed to register staff account.',
        });
      }
    } catch (err: any) {
      setFormAlert({
        type: 'error',
        message: err.message || 'Error occurred while saving new staff.',
      });
    } finally {
      setFormLoading(false);
    }
  };

  // SQL Copy Handler
  const handleCopySql = () => {
    if (!generatedSql) return;
    navigator.clipboard.writeText(generatedSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Business Analyst SQL query helper
  const handleAnalyzeQuery = async () => {
    if (!analystQuestion.trim()) return;
    setAnalystLoading(true);
    setAnalystError('');
    setGeneratedSql('');
    setSqlExplanation('');
    setSqlColumns([]);
    setQueryResultData(null);

    const supabase = getSupabaseClient();
    let db_data: any = null;

    if (supabase) {
      try {
        const [ordersRes, menuItemsRes, orderItemsRes, customersRes] = await Promise.all([
          supabase.from('orders').select('*').limit(200),
          supabase.from('menu_items').select('*'),
          supabase.from('order_items').select('*').limit(300),
          supabase.from('customers').select('*').limit(200)
        ]);

        db_data = {
          orders: ordersRes.data || [],
          menu_items: menuItemsRes.data || [],
          order_items: orderItemsRes.data || [],
          customers: customersRes.data || []
        };
      } catch (dbErr) {
        console.warn('Could not pre-fetch Supabase tables for dynamic query execution:', dbErr);
      }
    }

    try {
      const response = await fetch('/api/analyze-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: analystQuestion, db_data }),
      });

      const resData = await response.json();
      if (resData.success) {
        setGeneratedSql(resData.sql);
        setSqlExplanation(resData.explanation);
        setSqlColumns(resData.columns || []);
        setQueryResultData(resData.simulated_results || []);
      } else {
        setAnalystError(resData.error || 'Failed to parse request.');
      }
    } catch (err: any) {
      setAnalystError(err.message || 'Error connecting to data analysis backend services.');
    } finally {
      setAnalystLoading(false);
    }
  };

  const applyPresetQuery = (queryText: string) => {
    setAnalystQuestion(queryText);
  };

  return (
    <div className="space-y-8 pb-16">
      {/* HEADER ACTION BAR */}
      <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-slate-800 shadow relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-3.5 z-10">
          <div className="bg-amber-500 text-slate-950 p-2.5 rounded-xl">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold">Business Intelligence Desk</h2>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Admin Operator: <span className="text-amber-400 font-bold">{user.username}</span></p>
          </div>
        </div>

        <button
          onClick={onNavigateToCashier}
          className="bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs py-2.5 px-4 rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer z-10 self-start md:self-auto"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Exit to Cashier Desk</span>
        </button>
      </div>

      {/* METRIC CARD PANELS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase font-bold tracking-wider">Gross Revenue</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">₹{stats.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
          <p className="text-[10px] text-emerald-600 font-bold font-mono mt-1">↑ 14% shift-over-shift</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase font-bold tracking-wider">Orders Audited</span>
            <ShoppingCart className="h-4 w-4 text-amber-500" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">{stats.orderCount}</p>
          <p className="text-[10px] text-slate-400 font-mono mt-1">Dine-in QR + Counter</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase font-bold tracking-wider">Average Ticket</span>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">₹{stats.avgOrder.toFixed(2)}</p>
          <p className="text-[10px] text-emerald-600 font-bold font-mono mt-1">High conversion margins</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-mono uppercase font-bold tracking-wider">Staff Registered</span>
            <Users className="h-4 w-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-display font-black text-slate-900">{stats.activeStaffCount}</p>
          <p className="text-[10px] text-indigo-600 font-bold font-mono mt-1">Database Protected</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT PANEL: STAFF MANAGEMENTS (5 Columns) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Add Staff form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3.5 border-b border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-1.5">
                <UserPlus className="h-4 w-4 text-amber-400" />
                <span className="font-display font-semibold text-sm">Register New Staff Account</span>
              </div>
            </div>

            <form onSubmit={handleAddStaff} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Staff Username</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. neha_cashier"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:bg-white focus:outline-none transition text-slate-800 font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Access Code (Password)</label>
                <input
                  type="password"
                  required
                  placeholder="At least 4 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-sm focus:bg-white focus:outline-none transition text-slate-800 font-medium"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Assign Access Level</label>
                <div className="flex gap-2">
                  {(['cashier', 'admin'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setNewRole(r)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border uppercase tracking-wider transition cursor-pointer ${
                        newRole === r ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {formAlert && (
                <div className={`p-3 rounded-xl text-xs flex gap-2 border ${
                  formAlert.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'
                }`}>
                  {formAlert.type === 'success' ? <CheckCircle className="h-4.5 w-4.5 text-emerald-600 shrink-0" /> : <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0" />}
                  <span>{formAlert.message}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={formLoading}
                className="w-full bg-slate-950 hover:bg-slate-850 disabled:bg-slate-100 text-white disabled:text-slate-400 py-2.5 rounded-xl font-bold text-xs transition uppercase tracking-wider shadow cursor-pointer mt-2"
              >
                {formLoading ? 'Registering...' : 'Write User to staff_users'}
              </button>
            </form>
          </div>

          {/* Current Staff lists */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
              <Users className="h-4 w-4 text-slate-500" />
              <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider font-mono">Enrolled System Operators</h3>
            </div>

            {staffLoading ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="h-5 w-5 text-indigo-500 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {staffList.map((operator, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{operator.username}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">DB Operator</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border ${
                      operator.role === 'admin' ? 'bg-amber-100 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {operator.role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Stock Level Indicators */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-indigo-600" />
                <h3 className="font-semibold text-slate-800 text-xs uppercase tracking-wider font-mono">Live Stock Indicators</h3>
              </div>
              <button
                onClick={loadInventory}
                disabled={invLoading}
                className="text-[10px] text-indigo-600 hover:text-indigo-800 transition flex items-center gap-1 font-semibold disabled:opacity-50 cursor-pointer font-mono"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${invLoading ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>

            {inventory.filter(i => Number(i.current_stock) <= Number(i.reorder_threshold)).length > 0 && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 text-xs flex items-start gap-2 animate-pulse">
                <span className="font-bold">⚠️ Threshold Breach Alert:</span>
                <span>
                  {inventory.filter(i => Number(i.current_stock) <= Number(i.reorder_threshold)).map(i => i.ingredient_name).join(', ')} levels are critically low!
                </span>
              </div>
            )}

            <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
              {inventory.length === 0 ? (
                <p className="text-xs text-slate-400 font-mono text-center py-4">No ingredients tracked yet.</p>
              ) : (
                inventory.map((item, idx) => {
                  const isLow = Number(item.current_stock) <= Number(item.reorder_threshold);
                  return (
                    <div
                      key={item.inventory_id || idx}
                      className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition ${
                        isLow ? 'bg-rose-50/50 border-rose-100 text-rose-900' : 'bg-slate-50 border-slate-100 text-slate-700'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-slate-850">{item.ingredient_name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Threshold Limit: {Number(item.reorder_threshold).toFixed(2)} {item.unit}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-bold text-sm text-slate-800">
                          {Number(item.current_stock).toFixed(2)} <span className="text-[10px] uppercase text-slate-400">{item.unit}</span>
                        </p>
                        {isLow ? (
                          <span className="text-[9px] font-bold text-rose-600 uppercase font-mono mt-0.5 inline-block">Refill Immediately</span>
                        ) : (
                          <span className="text-[9px] font-bold text-emerald-600 uppercase font-mono mt-0.5 inline-block">Adequate</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: AI BUSINESS INTEL RECONCILIATION ANALYST (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="bg-indigo-50 text-indigo-700 p-1.5 rounded-lg border border-indigo-100">
                  <Activity className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-slate-900">AI SQL Business Performance Analyst</h3>
                  <p className="text-xs text-slate-500 font-sans">Translate complex natural language questions into raw PostgreSQL queries</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="text"
                value={analystQuestion}
                onChange={(e) => setAnalystQuestion(e.target.value)}
                placeholder="e.g. Compare gross earnings across cash vs UPI transactions?"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm focus:bg-white focus:outline-none transition font-sans text-slate-800 font-medium"
              />

              <button
                onClick={handleAnalyzeQuery}
                disabled={analystLoading || !analystQuestion.trim()}
                className="bg-slate-950 hover:bg-slate-850 disabled:bg-slate-100 text-white disabled:text-slate-400 px-5 py-3 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {analystLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-400" />}
                <span>Audit Question</span>
              </button>
            </div>

            {/* Presets */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono font-bold shrink-0 mt-1.5 mr-1">Prompts:</span>
              {[
                "Calculate average discount amount on orders with quantity over 5?",
                "Find most popular toppings and count occurrences?",
                "Which payment mode generated the largest total sales volume?"
              ].map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPresetQuery(preset)}
                  className="text-[11px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg transition font-medium text-left truncate max-w-[240px] cursor-pointer"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {analystError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs flex gap-2">
              <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Query Translator Failure</p>
                <p className="mt-0.5">{analystError}</p>
              </div>
            </div>
          )}

          {/* QUERY TRANSLATION BINDINGS */}
          {(generatedSql || queryResultData) && (
            <div className="space-y-6">
              {/* Generated SQL terminal box */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 border-b border-slate-800 px-5 py-3 flex items-center justify-between text-white text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-pink-500 text-slate-950 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold">SQL COMPILER</span>
                    <span className="font-mono text-slate-300">Generated Query</span>
                  </div>

                  <button
                    onClick={handleCopySql}
                    className="text-slate-400 hover:text-white transition flex items-center gap-1 text-[11px] bg-slate-800 px-2.5 py-1 rounded border border-slate-700 cursor-pointer"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copied ? 'Copied' : 'Copy SQL'}</span>
                  </button>
                </div>

                <div className="bg-slate-950 p-5">
                  <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap max-h-[220px] overflow-y-auto leading-relaxed">
                    <code>{generatedSql}</code>
                  </pre>
                </div>

                {sqlExplanation && (
                  <div className="bg-slate-50 border-t border-slate-100 p-4">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Business Objective Explanation</h4>
                    <p className="text-xs text-slate-600 leading-relaxed font-medium mt-0.5">{sqlExplanation}</p>
                  </div>
                )}
              </div>

              {/* Data Visualization simulation */}
              {queryResultData && queryResultData.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="border-b border-slate-100 pb-2.5 flex justify-between items-center text-xs">
                    <h4 className="font-mono font-bold text-slate-400 uppercase">Compiled Return Dataset</h4>
                    <span className="bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded border border-emerald-100 text-[10px]">SIMULATED EXECUTION</span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 font-mono text-slate-400 uppercase">
                          {sqlColumns.map((col) => (
                            <th key={col} className="p-2.5 font-semibold text-[10px]">{col.replace(/_/g, ' ')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {queryResultData.map((row, i) => (
                          <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50">
                            {sqlColumns.map((col) => {
                              const val = row[col];
                              let showVal = val != null ? String(val) : '-';
                              if (typeof val === 'number') {
                                if (col.includes('total') || col.includes('discount') || col.includes('gst') || col.includes('subtotal') || col.includes('revenue') || col.includes('price')) {
                                  showVal = `₹${val.toFixed(2)}`;
                                }
                              }
                              return <td key={col} className="p-2.5 font-mono text-slate-700 font-medium">{showVal}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Stat Report bar chart fallback */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-3">Auditing Visualization Bar</h5>
                    <div className="space-y-2.5">
                      {queryResultData.slice(0, 3).map((row, idx) => {
                        const numericCol = sqlColumns.find(c => typeof row[c] === 'number');
                        const labelCol = sqlColumns[0];
                        const label = row[labelCol] != null ? String(row[labelCol]) : `Row ${idx + 1}`;
                        const val = numericCol ? row[numericCol] : 1;
                        
                        const maxVal = Math.max(...queryResultData.map(r => {
                          const nc = sqlColumns.find(c => typeof r[c] === 'number');
                          return nc ? r[nc] : 1;
                        }), 1);
                        
                        const percentage = Math.min(100, Math.max(15, (val / maxVal) * 100));

                        return (
                          <div key={idx} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-slate-600">
                              <span className="truncate max-w-[70%]">{label}</span>
                              <span className="font-mono text-slate-900">
                                {numericCol && (numericCol.includes('total') || numericCol.includes('subtotal') || numericCol.includes('price')) ? `₹${val.toFixed(2)}` : val}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                              <div className="bg-amber-400 h-full rounded-full" style={{ width: `${percentage}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
