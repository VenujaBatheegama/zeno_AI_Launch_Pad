import React from 'react';
import { getDebugLogs } from '@/lib/debug-logger';

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const logs = await getDebugLogs();

  return (
    <div className="p-8 max-w-7xl mx-auto font-mono text-sm space-y-8">
      <h1 className="text-2xl font-bold text-slate-100">AI Debug Logs</h1>
      <p className="text-slate-400">Showing the last 50 LLM interactions.</p>

      {logs.length === 0 ? (
        <div className="p-8 rounded-lg border border-white/10 text-slate-500 text-center">
          No logs found yet. Try interacting with the bot in Telegram.
        </div>
      ) : (
        <div className="space-y-4">
          {logs.map((log, idx) => (
            <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-slate-950 flex justify-between items-center border-b border-slate-800">
                <span className="font-semibold text-emerald-400">[{log.type}]</span>
                <span className="text-slate-500 text-xs">{new Date(log.timestamp).toLocaleString()}</span>
              </div>
              <div className="p-4 overflow-x-auto text-slate-300">
                <pre>{JSON.stringify(log.data, null, 2)}</pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
