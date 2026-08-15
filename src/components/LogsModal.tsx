import React, { useEffect, useState } from 'react';
import {
  X,
  Terminal,
  RefreshCw,
  Trash2,
  Filter,
} from 'lucide-react';
import { LogEntry } from '../types.js';
import { fetchLogs } from '../services/api.js';

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LogsModal: React.FC<LogsModalProps> = ({ isOpen, onClose }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>('ALL');
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen]);

  useEffect(() => {
    let interval: any;
    if (isOpen && autoRefresh) {
      interval = setInterval(loadLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [isOpen, autoRefresh]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchLogs(150);
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const filteredLogs = logs.filter((l) => {
    if (levelFilter === 'ALL') return true;
    return l.level === levelFilter;
  });

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="system-logs-modal"
        className="bg-slate-950 text-slate-100 rounded-2xl border border-slate-800 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-sm font-bold text-white">System & News Retrieval Logs</h2>
              <p className="text-[11px] text-slate-400">
                Live backend activity stream (Yahoo Finance RSS, SQLite queries, Deduplication)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-6 py-2.5 border-b border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-[11px]">Level:</span>
            {(['ALL', 'INFO', 'WARN', 'ERROR', 'DEBUG'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition cursor-pointer ${
                  levelFilter === lvl
                    ? 'bg-emerald-600 text-white font-bold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded bg-slate-800 text-emerald-500"
              />
              <span>Auto-refresh (3s)</span>
            </label>

            <button
              onClick={loadLogs}
              disabled={loading}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Logs Console Stream */}
        <div className="p-4 overflow-y-auto flex-1 font-mono text-xs space-y-1 bg-slate-950/90 select-text">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-slate-600">No logs captured yet.</div>
          ) : (
            filteredLogs.map((log, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 py-0.5 leading-relaxed hover:bg-slate-900/50 rounded px-1"
              >
                <span className="text-slate-500 shrink-0 select-none text-[11px]">
                  {log.timestamp}
                </span>
                <span
                  className={`shrink-0 font-bold text-[11px] uppercase ${
                    log.level === 'ERROR'
                      ? 'text-rose-400'
                      : log.level === 'WARN'
                      ? 'text-amber-400'
                      : log.level === 'DEBUG'
                      ? 'text-purple-400'
                      : 'text-emerald-400'
                  }`}
                >
                  [{log.level.padEnd(5)}]
                </span>
                <span className="text-slate-200 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>{filteredLogs.length} log entries rendered</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
