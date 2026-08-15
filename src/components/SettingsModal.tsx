import React, { useState } from 'react';
import {
  X,
  Settings,
  Database,
  Globe,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { AppConfig } from '../types.js';
import { updateConfig, resetDatabase } from '../services/api.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AppConfig | null;
  onConfigUpdated: () => void;
  onRefreshFeed: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  config,
  onConfigUpdated,
  onRefreshFeed,
}) => {
  const [provider, setProvider] = useState<'yahoo' | 'mock'>(config?.provider || 'yahoo');
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg('');
    try {
      await updateConfig({ provider });
      setStatusMsg('Configuration saved successfully.');
      onConfigUpdated();
    } catch (err: any) {
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDb = async () => {
    if (
      confirm(
        'Are you sure you want to clear all news articles and import jobs? Tickers will be preserved.'
      )
    ) {
      setIsResetting(true);
      try {
        await resetDatabase();
        setStatusMsg('Database news articles cleared.');
        onRefreshFeed();
      } catch (err: any) {
        setStatusMsg(`Error: ${err.message}`);
      } finally {
        setIsResetting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="app-settings-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Application Configuration</h2>
              <p className="text-xs text-slate-500">Provider settings, environment, and storage</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 text-xs">
          {statusMsg && (
            <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {/* Active News Provider Selection */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-900">
              Active News Provider (NEWS_PROVIDER)
            </label>
            <p className="text-slate-500">
              Switch between real-time live Yahoo Finance RSS feeds and offline mock fixture generation.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <label
                className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition ${
                  provider === 'yahoo'
                    ? 'border-blue-600 bg-blue-50/50 text-blue-950 font-bold'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span>Yahoo Finance</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-blue-100 text-blue-800 border border-blue-200">
                      LIVE
                    </span>
                  </div>
                  <input
                    type="radio"
                    name="provider_radio"
                    checked={provider === 'yahoo'}
                    onChange={() => setProvider('yahoo')}
                    className="text-blue-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-normal">
                  Live RSS headline endpoint with HTTP retries.
                </p>
              </label>

              <label
                className={`p-3 rounded-xl border flex flex-col justify-between cursor-pointer transition ${
                  provider === 'mock'
                    ? 'border-amber-600 bg-amber-50/50 text-amber-950 font-bold'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span>Mock Provider</span>
                    <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      TEST DATA
                    </span>
                  </div>
                  <input
                    type="radio"
                    name="provider_radio"
                    checked={provider === 'mock'}
                    onChange={() => setProvider('mock')}
                    className="text-amber-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500 font-normal">
                  Deterministic offline news with multi-ticker links.
                </p>
              </label>
            </div>
          </div>

          {/* Environment Values Inspection */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 font-mono text-[11px]">
            <div className="text-slate-700 font-sans font-bold text-xs mb-1">
              System Environment Parameters:
            </div>
            <div className="flex justify-between text-slate-600">
              <span>DATABASE_PATH:</span>
              <span className="text-slate-900 font-bold">{config?.dbPath || './data/news.db'}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>REQUEST_TIMEOUT:</span>
              <span className="text-slate-900 font-bold">{config?.timeoutMs || 20000}ms</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>MAX_CONCURRENT_REQUESTS:</span>
              <span className="text-slate-900 font-bold">{config?.maxConcurrent || 5}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>LOG_LEVEL:</span>
              <span className="text-slate-900 font-bold">{config?.logLevel || 'INFO'}</span>
            </div>
          </div>

          {/* Danger Zone: Database Reset */}
          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900">Reset News Database</h4>
                <p className="text-[11px] text-slate-500">
                  Clears all stored news articles and import jobs.
                </p>
              </div>
              <button
                type="button"
                onClick={handleResetDb}
                disabled={isResetting}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition"
              >
                {isResetting ? 'Resetting...' : 'Clear News'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </div>
  );
};
