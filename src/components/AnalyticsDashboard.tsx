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
  ArrowLeft,
  MessageSquare,
  Trash2
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
  const [newRole, setNewRole] = useState<'cashier' | 'admin' | 'kitchen'>('cashier');
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
  const [isLiveResult, setIsLiveResult] = useState(false);

  interface ChatMessage {
    id: string;
    sender: 'admin' | 'dough_assistant';
    text: string;
    timestamp: Date;
    sql?: string | null;
    explanation?: string | null;
    columns?: string[];
    simulated_results?: any[];
  }

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'dough_assistant',
      text: "Hi Admin! I'm Dough Assistant, your AI pizza outlet analyst. Ask me anything about our sales, inventory, low stock, staff attendance, or peak times, and I'll break it down for you in plain, simple language!",
      timestamp: new Date()
    }
  ]);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Record<string, boolean>>({});

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

  // Business Analyst conversational query helper
  const handleAnalyzeQuery = async (customText?: string) => {
    const questionText = customText || analystQuestion;
    if (!questionText.trim()) return;

    // Clear input box
    if (!customText) {
      setAnalystQuestion('');
    }

    const userMessageId = Math.random().toString(36).substring(7);
    const userMsg: ChatMessage = {
      id: userMessageId,
      sender: 'admin',
      text: questionText,
      timestamp: new Date()
    };

    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);

    setAnalystLoading(true);
    setAnalystError('');

    const supabase = getSupabaseClient();
    let db_data: any = null;

    if (supabase) {
      try {
        const fetchTable = async (tableName: string, limit?: number) => {
          try {
            let query = supabase.from(tableName).select('*');
            if (limit) {
              query = query.limit(limit);
            }
            const { data, error } = await query;
            if (error) {
              console.warn(`Table ${tableName} fetch error:`, error.message);
              return [];
            }
            return data || [];
          } catch (err) {
            console.warn(`Exception fetching table ${tableName}:`, err);
            return [];
          }
        };

        const [
          orders,
          menu_items,
          order_items,
          customers,
          payments,
          order_status,
          inventory,
          menu_item_ingredients,
          staff_users
        ] = await Promise.all([
          fetchTable('orders', 300),
          fetchTable('menu_items'),
          fetchTable('order_items', 500),
          fetchTable('customers', 300),
          fetchTable('payments', 300),
          fetchTable('order_status', 300),
          fetchTable('inventory'),
          fetchTable('menu_item_ingredients', 300),
          fetchTable('staff_users', 100)
        ]);

        db_data = {
          orders,
          menu_items,
          order_items,
          customers,
          payments,
          order_status,
          inventory,
          menu_item_ingredients,
          staff_users
        };
        setIsLiveResult(true);
      } catch (dbErr) {
        console.warn('Could not pre-fetch Supabase tables for dynamic query execution:', dbErr);
      }
    }

    try {
      const messagesPayload = updatedMessages.map(m => ({
        sender: m.sender,
        text: m.text
      }));

      const response = await fetch('/api/analyze-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, messages: messagesPayload, db_data }),
      });

      const resData = await response.json();
      if (resData.success) {
        const botMsg: ChatMessage = {
          id: Math.random().toString(36).substring(7),
          sender: 'dough_assistant',
          text: resData.reply || "I've analyzed the request, but didn't produce a verbal summary.",
          timestamp: new Date(),
          sql: resData.sql,
          explanation: resData.explanation,
          columns: resData.columns || [],
          simulated_results: resData.simulated_results || []
        };
        setChatMessages(prev => [...prev, botMsg]);

        if (resData.sql) {
          setGeneratedSql(resData.sql);
          setSqlExplanation(resData.explanation || '');
          setSqlColumns(resData.columns || []);
          setQueryResultData(resData.simulated_results || []);
        }
      } else {
        setAnalystError(resData.error || 'Failed to retrieve response from Dough Assistant.');
      }
    } catch (err: any) {
      setAnalystError(err.message || 'Error connecting to Dough Assistant backend services.');
    } finally {
      setAnalystLoading(false);
    }
  };

  const applyPresetQuery = (queryText: string) => {
    handleAnalyzeQuery(queryText);
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
                  {(['cashier', 'admin', 'kitchen'] as const).map((r) => (
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

        {/* RIGHT PANEL: CONVERSATIONAL DOUGH ASSISTANT ANALYST (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-[650px] overflow-hidden">
            {/* Chatbot Header */}
            <div className="bg-slate-900 text-white px-5 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="bg-amber-500 text-slate-950 p-2 rounded-lg shrink-0">
                  <MessageSquare className="h-4.5 w-4.5 font-bold" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm tracking-tight">Dough Assistant</h3>
                  <p className="text-[10px] text-slate-400 font-sans mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    AI Outlet Business Analyst
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setChatMessages([
                    {
                      id: 'welcome',
                      sender: 'dough_assistant',
                      text: "Hi Admin! I'm Dough Assistant, your AI pizza outlet analyst. Ask me anything about our sales, inventory, low stock, staff attendance, or peak times, and I'll break it down for you in plain, simple language!",
                      timestamp: new Date()
                    }
                  ]);
                  setGeneratedSql('');
                  setQueryResultData(null);
                }}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-700 transition flex items-center gap-1 cursor-pointer font-mono"
                title="Clear Chat Logs"
              >
                <Trash2 className="h-3 w-3 text-rose-400" />
                <span>Clear Chat</span>
              </button>
            </div>

            {/* Chat Message Window */}
            <div className="flex-1 p-5 overflow-y-auto bg-slate-50/50 space-y-4">
              {chatMessages.map((msg) => {
                const isAdmin = msg.sender === 'admin';
                const hasDetails = !!msg.sql;
                const isExpanded = !!expandedMessageIds[msg.id];

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'} space-y-1`}
                  >
                    <div className="text-[9px] font-bold text-slate-400 px-1 font-mono">
                      {isAdmin ? 'Owner (Admin)' : 'Dough Assistant'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>

                    <div
                      className={`px-4 py-3 rounded-2xl text-xs max-w-[90%] shadow-sm leading-relaxed ${
                        isAdmin
                          ? 'bg-amber-500 text-slate-950 font-semibold rounded-tr-none'
                          : 'bg-white border border-slate-200/80 text-slate-800 rounded-tl-none'
                      }`}
                    >
                      {/* Message Content */}
                      <p className="whitespace-pre-wrap font-sans font-medium">{msg.text}</p>

                      {/* Expandable Technical details if generated SQL query exists */}
                      {!isAdmin && hasDetails && (
                        <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedMessageIds(prev => ({ ...prev, [msg.id]: !prev[msg.id] }));
                            }}
                            className="flex items-center gap-1.5 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold font-mono transition"
                          >
                            <Activity className="h-3.5 w-3.5" />
                            <span>{isExpanded ? 'Hide SQL & Database Audit Details' : 'Show SQL & Database Audit Details'}</span>
                          </button>

                          {isExpanded && (
                            <div className="bg-slate-50 rounded-xl p-3 border border-slate-150 space-y-3 mt-2 animate-fadeIn text-slate-800">
                              {/* SQL Code Block */}
                              <div className="space-y-1">
                                <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 font-mono">
                                  <span>POSTGRESQL SELECT QUERY:</span>
                                  <button
                                    onClick={() => {
                                      if (msg.sql) {
                                        navigator.clipboard.writeText(msg.sql);
                                        alert('SQL copied successfully!');
                                      }
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                                  >
                                    <Copy className="h-3 w-3" />
                                    <span>Copy</span>
                                  </button>
                                </div>
                                <pre className="font-mono text-[10px] bg-slate-950 text-slate-300 p-2.5 rounded-lg overflow-x-auto whitespace-pre leading-normal">
                                  <code>{msg.sql}</code>
                                </pre>
                              </div>

                              {/* Explanation */}
                              {msg.explanation && (
                                <div className="bg-indigo-50/50 border border-indigo-100/60 rounded-lg p-2 text-[10px] text-indigo-950">
                                  <span className="font-bold">Objective:</span> {msg.explanation}
                                </div>
                              )}

                              {/* Live/Simulated result columns and data table */}
                              {msg.columns && msg.columns.length > 0 && msg.simulated_results && msg.simulated_results.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center text-[9px] font-bold text-slate-400 font-mono border-b border-slate-200 pb-1">
                                    <span>DATABASE RETURNSET:</span>
                                    <span className="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded border border-emerald-100 text-[8px]">
                                      {isLiveResult ? 'REAL-TIME DB SYNC' : 'SIMULATED DATA'}
                                    </span>
                                  </div>

                                  <div className="overflow-x-auto rounded-lg border border-slate-100 max-h-48">
                                    <table className="w-full text-left border-collapse text-[10px]">
                                      <thead>
                                        <tr className="bg-slate-100 border-b border-slate-250 font-mono text-slate-500 uppercase">
                                          {msg.columns.map((col) => (
                                            <th key={col} className="p-2 font-bold">{col.replace(/_/g, ' ')}</th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {msg.simulated_results.map((row, i) => (
                                          <tr key={i} className="border-b border-slate-50 last:border-0 bg-white hover:bg-slate-50/50">
                                            {msg.columns!.map((col) => {
                                              const val = row[col];
                                              let showVal = val != null ? String(val) : '-';
                                              if (typeof val === 'number') {
                                                if (col.includes('total') || col.includes('discount') || col.includes('gst') || col.includes('subtotal') || col.includes('revenue') || col.includes('price')) {
                                                  showVal = `₹${val.toFixed(2)}`;
                                                }
                                              }
                                              return <td key={col} className="p-2 font-mono text-slate-700 font-medium">{showVal}</td>;
                                            })}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {/* Micro visualizer chart */}
                                  <div className="bg-white border border-slate-100 rounded-lg p-2 space-y-1.5">
                                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono">Micro Bar chart</p>
                                    <div className="space-y-1.5">
                                      {msg.simulated_results.slice(0, 3).map((row, idx) => {
                                        const numericCol = msg.columns!.find(c => typeof row[c] === 'number');
                                        const labelCol = msg.columns![0];
                                        const label = row[labelCol] != null ? String(row[labelCol]) : `Row ${idx + 1}`;
                                        const val = numericCol ? row[numericCol] : 1;

                                        const maxVal = Math.max(...msg.simulated_results!.map(r => {
                                          const nc = msg.columns!.find(c => typeof r[c] === 'number');
                                          return nc ? r[nc] : 1;
                                        }), 1);

                                        const percentage = Math.min(100, Math.max(15, (val / maxVal) * 100));

                                        return (
                                          <div key={idx} className="space-y-0.5">
                                            <div className="flex justify-between text-[9px] text-slate-500 font-medium">
                                              <span className="truncate max-w-[70%]">{label}</span>
                                              <span className="font-mono text-slate-800">
                                                {numericCol && (numericCol.includes('total') || numericCol.includes('subtotal') || numericCol.includes('price')) ? `₹${val.toFixed(2)}` : val}
                                              </span>
                                            </div>
                                            <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden">
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
                      )}
                    </div>
                  </div>
                );
              })}

              {analystError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs flex gap-2">
                  <AlertCircle className="h-4.5 w-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Query Translator Failure</p>
                    <p className="mt-0.5 text-slate-600">{analystError}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Chatbot Footer Input */}
            <div className="p-4 border-t border-slate-200 bg-white shrink-0 space-y-3">
              {/* Prompt Presets */}
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto py-0.5">
                <span className="text-[9px] text-slate-400 uppercase font-mono font-bold shrink-0 mt-1.5 mr-1">Suggestions:</span>
                {[
                  "Calculate average discount amount on orders?",
                  "Which toppings are most popular?",
                  "List ingredients with low stock?"
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => applyPresetQuery(preset)}
                    className="text-[10px] bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg transition font-medium text-left truncate max-w-[200px] cursor-pointer"
                  >
                    {preset}
                  </button>
                ))}
              </div>

              {/* Message input bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAnalyzeQuery();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={analystQuestion}
                  onChange={(e) => setAnalystQuestion(e.target.value)}
                  placeholder="Ask Dough Assistant about low stock, peak times, sales, etc..."
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 transition text-slate-800 font-medium"
                />

                <button
                  type="submit"
                  disabled={analystLoading || !analystQuestion.trim()}
                  className="bg-slate-950 hover:bg-slate-850 disabled:bg-slate-100 text-white disabled:text-slate-400 px-4 py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {analystLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-amber-400" />}
                  <span>Ask</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
