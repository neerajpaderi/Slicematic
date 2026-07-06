/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pizza, 
  User, 
  Lock, 
  Unlock, 
  AlertCircle, 
  Database, 
  Laptop, 
  QrCode, 
  ChevronRight,
  Sparkles,
  HelpCircle,
  X,
  RefreshCw
} from 'lucide-react';
import { authenticateStaff } from './lib/authService';
import { getSupabaseStatus, saveSupabaseConfig } from './lib/supabaseClient';

// Import our newly created modular subcomponents
import TableOrdering from './components/TableOrdering';
import CashierDashboard from './components/CashierDashboard';
import AnalyticsDashboard from './components/AnalyticsDashboard';

export default function App() {
  // Client-side router states
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username: string; role: 'cashier' | 'admin' } | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Supabase Visual configuration panel states
  const [supabaseStatus, setSupabaseStatus] = useState(getSupabaseStatus());
  const [dbUrl, setDbUrl] = useState('');
  const [dbKey, setDbKey] = useState('');
  const [showDbConfig, setShowDbConfig] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Table selector state on Landing
  const [inputTableId, setInputTableId] = useState('1');

  // Listen to popstate changes to update router state
  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Safe navigation helper
  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Restore authenticated session & fill DB configuration inputs
  useEffect(() => {
    const savedSession = localStorage.getItem('slicematic_logged_in') === 'true';
    const savedUserStr = localStorage.getItem('slicematic_logged_user');
    
    if (savedSession && savedUserStr) {
      try {
        const userObj = JSON.parse(savedUserStr);
        setIsLoggedIn(true);
        setCurrentUser(userObj);
      } catch (e) {
        // Clear corrupt session
        localStorage.removeItem('slicematic_logged_in');
        localStorage.removeItem('slicematic_logged_user');
      }
    }

    const status = getSupabaseStatus();
    if (status.configured) {
      setDbUrl(status.url);
      setDbKey(status.rawKey || '');
    }
  }, []);

  // Login handler
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setLoginError('Please enter both your staff username and access code.');
      return;
    }

    setLoginLoading(true);

    try {
      const result = await authenticateStaff(trimmedUser, trimmedPass);

      if (result.success && result.role) {
        const staffObj = { username: trimmedUser, role: result.role };
        setIsLoggedIn(true);
        setCurrentUser(staffObj);

        localStorage.setItem('slicematic_logged_in', 'true');
        localStorage.setItem('slicematic_logged_user', JSON.stringify(staffObj));

        // Redirect to cashier route upon successful auth
        navigateTo('/cashier');
        
        // Reset login forms
        setUsername('');
        setPassword('');
      } else {
        setLoginError(result.error || 'Authentication denied. Verify credentials.');
      }
    } catch (err: any) {
      setLoginError(err.message || 'Service authentication communication error.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    localStorage.removeItem('slicematic_logged_in');
    localStorage.removeItem('slicematic_logged_user');
    navigateTo('/');
  };

  // Save Supabase customized keys visual panel
  const handleSaveSupabaseCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveMessage('');

    saveSupabaseConfig(dbUrl, dbKey);
    const newStatus = getSupabaseStatus();
    setSupabaseStatus(newStatus);

    setSaveMessage(
      newStatus.configured
        ? 'Custom database parameters successfully loaded and cached!'
        : 'Parameters cleared. Reverted to Simulation Mode.'
    );

    setTimeout(() => {
      setSaveMessage('');
      setShowDbConfig(false);
    }, 3000);
  };

  // ---------------------------------------------------------------------------
  // ROUTER CONTROLLER (Route parser)
  // ---------------------------------------------------------------------------
  const renderRouteView = () => {
    const path = currentPath;

    // 1. Table QR ordering: matches /table/[id]
    const tableMatch = path.match(/^\/table\/(\d+)/i);
    if (tableMatch) {
      const tableId = tableMatch[1];
      return <TableOrdering tableId={tableId} />;
    }

    // 2. Cashier Dashboard: matches /cashier
    if (path === '/cashier') {
      if (!isLoggedIn || !currentUser) {
        return renderLoginScreen('Staff Terminal Access Required');
      }
      
      // Validate roles 'cashier' or 'admin'
      if (currentUser.role !== 'cashier' && currentUser.role !== 'admin') {
        return renderLoginScreen('Unauthorized access levels.');
      }

      return (
        <CashierDashboard 
          user={currentUser} 
          onLogout={handleLogout} 
          onNavigateToAnalytics={() => navigateTo('/analytics')} 
        />
      );
    }

    // 3. Business Analytics Dashboard: matches /analytics
    if (path === '/analytics') {
      if (!isLoggedIn || !currentUser) {
        return renderLoginScreen('Admin Authentication Required');
      }

      // Enforces strict admin check
      if (currentUser.role !== 'admin') {
        // Cashiers get redirected to /cashier safely
        setTimeout(() => navigateTo('/cashier'), 100);
        return (
          <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
            <span className="ml-3 font-mono text-sm">Access denied. Redirecting cashiers back to /cashier...</span>
          </div>
        );
      }

      return (
        <AnalyticsDashboard 
          user={currentUser} 
          onNavigateToCashier={() => navigateTo('/cashier')} 
        />
      );
    }

    // 4. Default: LandingChoice / (Table selection scan & Login selection)
    return renderLandingChoices();
  };

  // Beautiful choices landing view
  const renderLandingChoices = () => {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden text-white font-sans">
        <div className="absolute top-[-25%] left-[-20%] w-[60%] h-[60%] rounded-full bg-amber-500/10 blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[55%] h-[55%] rounded-full bg-indigo-500/5 blur-[130px] pointer-events-none" />

        <div className="max-w-xl w-full space-y-8 relative z-10 text-center">
          <div>
            <div className="inline-flex bg-gradient-to-br from-amber-400 to-orange-500 p-4 rounded-3xl shadow-xl mb-5">
              <Pizza className="h-9 w-9 text-slate-950" />
            </div>
            <h1 className="text-4xl font-display font-black tracking-tight text-white">
              SliceMatic <span className="text-amber-400">Pro</span>
            </h1>
            <p className="text-sm text-slate-400 mt-2">Dine-In Tablet & staff register system</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
            {/* Dine-In Tablet Simulator */}
            <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between items-center text-center space-y-4 shadow-lg backdrop-blur-md">
              <div className="bg-amber-500/10 text-amber-400 p-3 rounded-xl">
                <QrCode className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-white">Dine-In Customer</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Simulate a dine-in client scanning a table-specific QR Code</p>
              </div>

              <div className="w-full space-y-3">
                <div className="flex gap-2">
                  <span className="text-xs text-slate-400 font-mono self-center">Table:</span>
                  <select
                    className="flex-1 bg-slate-850 border border-slate-700 text-white rounded-lg py-1.5 px-2 text-xs focus:outline-none cursor-pointer"
                    value={inputTableId}
                    onChange={(e) => setInputTableId(e.target.value)}
                  >
                    {['1', '2', '3', '4', '5'].map(num => (
                      <option key={num} value={num}>Table #{num}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => navigateTo(`/table/${inputTableId}`)}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <span>Dine-In Menu</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Staff Register Access */}
            <div className="bg-slate-900/60 border border-slate-800 p-6 rounded-2xl flex flex-col justify-between items-center text-center space-y-4 shadow-lg backdrop-blur-md">
              <div className="bg-indigo-500/10 text-indigo-400 p-3 rounded-xl">
                <Laptop className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-white">Staff Terminal</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">Login to check in orders manually or analyze performance metrics</p>
              </div>

              <button
                onClick={() => navigateTo('/cashier')}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1 border border-slate-700 transition cursor-pointer"
              >
                <span>Staff Portal</span>
                <ChevronRight className="h-3.5 w-3.5 text-indigo-400" />
              </button>
            </div>
          </div>

          <div className="pt-4 text-center">
            <button
              onClick={() => setShowDbConfig(true)}
              className="inline-flex items-center gap-2 text-xs font-mono text-slate-500 hover:text-indigo-400 transition cursor-pointer"
            >
              <Database className="h-3.5 w-3.5" />
              <span>{supabaseStatus.configured ? 'Supabase: Configured' : 'Supabase Setup / Local Mode'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Unified login screen
  const renderLoginScreen = (heading: string) => {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden text-white font-sans">
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/5 blur-[120px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-900/80 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10"
        >
          <div className="text-center mb-6">
            <div className="inline-flex bg-gradient-to-br from-amber-400 to-orange-500 p-3.5 rounded-2xl shadow-lg mb-4">
              <Pizza className="h-7 w-7 text-slate-950 animate-bounce" />
            </div>
            <h2 className="text-2xl font-display font-black tracking-tight text-white">
              SliceMatic Terminal
            </h2>
            <p className="text-xs text-slate-400 font-mono mt-1.5 uppercase tracking-wider">{heading}</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-mono tracking-wider uppercase text-slate-400 mb-1.5">Staff Username</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500"><User className="h-4 w-4" /></span>
                <input
                  type="text"
                  placeholder="e.g. Rajan"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700/80 rounded-xl py-2 pl-9 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono tracking-wider uppercase text-slate-400 mb-1.5">Access Code</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-slate-500"><Lock className="h-4 w-4" /></span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700/80 rounded-xl py-2 pl-9 pr-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
            </div>

            {loginError && (
              <div className="bg-rose-950/40 border border-rose-900/50 text-rose-300 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="h-4.5 w-4.5 text-rose-500 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs transition uppercase tracking-wider shadow cursor-pointer flex items-center justify-center gap-1.5"
            >
              {loginLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
              <span>Verify Access Credentials</span>
            </button>
          </form>

          {/* Quick Fills */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <p className="text-[10px] text-slate-500">Quick fill demo staff accounts:</p>
            <div className="flex gap-2 justify-center mt-2.5">
              <button
                onClick={() => {
                  setUsername('Rajan');
                  setPassword('rajan123');
                }}
                className="bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] border border-slate-800 font-mono cursor-pointer transition"
              >
                Rajan (Admin)
              </button>
              <button
                onClick={() => {
                  setUsername('admin');
                  setPassword('slicematic');
                }}
                className="bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg text-[10px] border border-slate-800 font-mono cursor-pointer transition"
              >
                admin (Admin)
              </button>
            </div>
            
            <button
              onClick={() => navigateTo('/')}
              className="text-xs text-slate-500 hover:text-slate-300 transition mt-4 inline-block font-medium cursor-pointer"
            >
              ← Back to Main Menu
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      
      {/* Route Render Core */}
      {renderRouteView()}

      {/* FIXED SUPABASE CREDENTIALS MODAL */}
      <AnimatePresence>
        {showDbConfig && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl text-white overflow-hidden"
            >
              <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Database className="h-4.5 w-4.5 text-indigo-400" />
                  <span className="font-display font-semibold text-sm">Supabase Integration Panel</span>
                </div>
                <button
                  onClick={() => setShowDbConfig(false)}
                  className="text-slate-500 hover:text-white p-1 rounded-full hover:bg-slate-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSaveSupabaseCredentials} className="p-6 space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide custom database keys below to sync real cloud queries. If fields are empty, the app compiles in simulated local offline mode.
                </p>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">SUPABASE_URL</label>
                  <input
                    type="text"
                    placeholder="https://xyz.supabase.co"
                    value={dbUrl}
                    onChange={(e) => setDbUrl(e.target.value)}
                    className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-slate-400">SUPABASE_ANON_KEY</label>
                  <input
                    type="password"
                    placeholder="Your anonymous public access API key"
                    value={dbKey}
                    onChange={(e) => setDbKey(e.target.value)}
                    className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2 text-xs focus:outline-none font-mono"
                  />
                </div>

                {saveMessage && (
                  <div className="p-2.5 bg-indigo-950 border border-indigo-800 text-indigo-300 text-xs rounded-lg flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 shrink-0 text-indigo-400" />
                    <span>{saveMessage}</span>
                  </div>
                )}

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDbUrl('');
                      setDbKey('');
                      saveSupabaseConfig('', '');
                      setSupabaseStatus(getSupabaseStatus());
                      setSaveMessage('Credentials cleared. Running local fallback.');
                      setTimeout(() => {
                        setSaveMessage('');
                        setShowDbConfig(false);
                      }, 2000);
                    }}
                    className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Clear Credentials
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 py-2 rounded-xl text-xs font-bold shadow cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
