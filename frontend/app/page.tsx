'use client';

import { useState, useEffect } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface SyncData {
  sheet: { headers: string[]; rows: Record<string, any>[] } | null;
  mysql: { headers: string[]; rows: Record<string, any>[] } | null;
  lastSync: string | null;
  isRunning: boolean;
  stats: { sheetToDb: number; dbToSheet: number };
}

export default function Home() {
  const [authenticated, setAuthenticated] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [tableName, setTableName] = useState('sync_table');
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<SyncData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      setAuthenticated(true);
      window.history.replaceState({}, '', '/');
    } else if (params.get('error')) {
      setError(params.get('error') || 'Auth failed');
      window.history.replaceState({}, '', '/');
    }

    fetch(`${API}/auth/status`)
      .then(r => r.json())
      .then(d => setAuthenticated(d.authenticated))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!connected) return;
    
    const poll = () => {
      fetch(`${API}/sync/data`)
        .then(r => r.json())
        .then(d => {
          setData(d);
          setSyncing(d.isRunning);
        })
        .catch(() => {});
    };
    
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [connected]);

  const handleGoogleAuth = () => {
    fetch(`${API}/auth/google`)
      .then(r => r.json())
      .then(d => {
        if (d.url) window.location.href = d.url;
      })
      .catch(() => setError('Failed to get auth URL'));
  };

  const fetchSheets = async () => {
    if (!sheetUrl) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/sheets/${encodeURIComponent(sheetUrl)}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setAvailableSheets(d.sheets);
      if (d.sheets.length > 0) setSheetName(d.sheets[0]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!sheetUrl || !sheetName || !tableName) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/sync/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetUrl, sheetName, tableName }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setConnected(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSync = async () => {
    const endpoint = syncing ? '/sync/stop' : '/sync/start';
    await fetch(`${API}${endpoint}`, { method: 'POST' });
    setSyncing(!syncing);
  };

  const triggerSync = async () => {
    await fetch(`${API}/sync/trigger`, { method: 'POST' });
    const res = await fetch(`${API}/sync/data`);
    setData(await res.json());
  };

  const addTestRow = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/sync/test-row`, { method: 'POST' });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      await triggerSync();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6 text-gray-800">
          Google Sheets - MySQL Sync
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={() => setError('')} className="float-right text-sm underline">
              dismiss
            </button>
          </div>
        )}

        {!authenticated ? (
          <div className="bg-white border rounded-lg p-6">
            <p className="mb-4 text-gray-600">Connect your Google account to get started</p>
            <button
              onClick={handleGoogleAuth}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Sign in with Google
            </button>
          </div>
        ) : !connected ? (
          <div className="bg-white border rounded-lg p-6">
            <p className="text-green-600 text-sm mb-4">Google account connected</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Sheet URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={sheetUrl}
                    onChange={e => setSheetUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 border rounded px-3 py-2 text-sm"
                  />
                  <button
                    onClick={fetchSheets}
                    disabled={loading || !sheetUrl}
                    className="bg-gray-100 border px-4 py-2 rounded text-sm hover:bg-gray-200 disabled:opacity-50"
                  >
                    Load
                  </button>
                </div>
              </div>

              {availableSheets.length > 0 && (
                <>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Sheet</label>
                    <select
                      value={sheetName}
                      onChange={e => setSheetName(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    >
                      {availableSheets.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">MySQL Table Name</label>
                    <input
                      type="text"
                      value={tableName}
                      onChange={e => setTableName(e.target.value)}
                      className="w-full border rounded px-3 py-2 text-sm"
                    />
                  </div>

                  <button
                    onClick={handleConnect}
                    disabled={loading}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Connecting...' : 'Connect'}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-white border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <span className="text-sm text-gray-600">
                  {syncing ? 'Syncing every 5s' : 'Sync paused'}
                </span>
                {data?.lastSync && (
                  <span className="text-xs text-gray-400">
                    Last: {new Date(data.lastSync).toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={triggerSync}
                  className="text-sm border px-3 py-1 rounded hover:bg-gray-50"
                >
                  Sync Now
                </button>
                <button
                  onClick={addTestRow}
                  disabled={loading}
                  className="text-sm border px-3 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Add Test Row
                </button>
                <button
                  onClick={toggleSync}
                  className={`text-sm px-3 py-1 rounded ${
                    syncing 
                      ? 'bg-red-50 text-red-600 border border-red-200' 
                      : 'bg-green-50 text-green-600 border border-green-200'
                  }`}
                >
                  {syncing ? 'Stop' : 'Start'}
                </button>
              </div>
            </div>

            {data?.stats && (
              <div className="flex gap-4 text-sm">
                <span className="text-gray-600">Sheet → MySQL: <b>{data.stats.sheetToDb}</b></span>
                <span className="text-gray-600">MySQL → Sheet: <b>{data.stats.dbToSheet}</b></span>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b text-sm font-medium text-gray-700">
                  Google Sheet
                </div>
                <div className="p-4 overflow-x-auto">
                  {data?.sheet?.rows?.length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {data.sheet.headers.map(h => (
                            <th key={h} className="text-left py-1 px-2 border-b text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.sheet.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            {data.sheet!.headers.map(h => (
                              <td key={h} className="py-1 px-2 border-b border-gray-100">{String(row[h] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-400 text-sm">No data</p>
                  )}
                </div>
              </div>

              <div className="bg-white border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b text-sm font-medium text-gray-700">
                  MySQL
                </div>
                <div className="p-4 overflow-x-auto">
                  {data?.mysql?.rows?.length ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          {data.mysql.headers.map(h => (
                            <th key={h} className="text-left py-1 px-2 border-b text-gray-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.mysql.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            {data.mysql!.headers.map(h => (
                              <td key={h} className="py-1 px-2 border-b border-gray-100">{String(row[h] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-gray-400 text-sm">No data</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
