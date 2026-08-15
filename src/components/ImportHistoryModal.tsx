import React, { useEffect, useState } from 'react';
import {
  X,
  History,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Eye,
  Calendar,
} from 'lucide-react';
import { ImportJobSummary } from '../types.js';
import { fetchImportHistory } from '../services/api.js';

interface ImportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportHistoryModal: React.FC<ImportHistoryModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [history, setHistory] = useState<ImportJobSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<ImportJobSummary | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await fetchImportHistory();
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="import-history-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">News Import History & Logs</h2>
              <p className="text-xs text-slate-500">
                Audit trail of past Yahoo Finance and Mock news ingestions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto mb-2" />
              <p className="text-xs text-slate-500">Loading import history from SQLite...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              No news imports recorded yet. Click "Fetch News" to trigger your first import!
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="py-2.5 px-4 w-16">ID</th>
                    <th className="py-2.5 px-4 w-32">Timestamp</th>
                    <th className="py-2.5 px-4 w-24">Provider</th>
                    <th className="py-2.5 px-4 w-20">Tickers</th>
                    <th className="py-2.5 px-4">Articles (New / Dups)</th>
                    <th className="py-2.5 px-4 w-20">Status</th>
                    <th className="py-2.5 px-4 text-right w-16">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {history.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2 px-4 text-slate-400 font-bold">#{job.id}</td>
                      <td className="py-2 px-4 text-slate-600 font-sans whitespace-nowrap">
                        {new Date(job.started_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-semibold ${
                            job.provider === 'yahoo'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {job.provider}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-slate-800 font-bold">{job.tickers_count}</td>
                      <td className="py-2 px-4 text-slate-700 font-sans">
                        <span className="font-bold text-slate-900">{job.articles_retrieved}</span> total{' '}
                        <span className="text-slate-400">
                          (<strong className="text-emerald-600">{job.new_articles}</strong> new,{' '}
                          <strong className="text-amber-600">{job.duplicates_skipped}</strong> dups)
                        </span>
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold font-sans ${
                            job.status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : job.status === 'running'
                              ? 'bg-sky-50 text-sky-700 border border-sky-200 animate-pulse'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {job.status}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right font-sans">
                        <button
                          onClick={() => setSelectedJob(job)}
                          className="p-1 text-slate-400 hover:text-slate-800 rounded transition"
                          title="View job breakdown"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Selected Job Details Modal Drawer */}
          {selectedJob && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 animate-in fade-in">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-900">
                  Import #{selectedJob.id} Details ({selectedJob.provider.toUpperCase()})
                </h4>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Close Details
                </button>
              </div>

              {selectedJob.details?.tickerResults && (
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-100 uppercase text-[10px] text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-1.5 px-3">Ticker</th>
                        <th className="p-1.5 px-3">Status</th>
                        <th className="p-1.5 px-3">Retrieved</th>
                        <th className="p-1.5 px-3">New</th>
                        <th className="p-1.5 px-3">Duplicates</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedJob.details.tickerResults.map((r, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="p-1.5 px-3 font-bold">${r.symbol}</td>
                          <td className="p-1.5 px-3 uppercase text-[10px] font-semibold">{r.status}</td>
                          <td className="p-1.5 px-3">{r.retrieved}</td>
                          <td className="p-1.5 px-3 text-emerald-600 font-bold">{r.newInserted}</td>
                          <td className="p-1.5 px-3 text-amber-600">{r.duplicates}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
