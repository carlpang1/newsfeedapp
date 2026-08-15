import React, { useState } from 'react';
import {
  X,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode,
  Sparkles,
  RefreshCw,
  Layers,
  Database,
  Globe,
  Filter,
  FileSpreadsheet,
} from 'lucide-react';
import { TestSuiteSummary, TestResultItem } from '../types.js';
import { runTestSuite } from '../services/api.js';

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestRunnerModal: React.FC<TestRunnerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<TestSuiteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleRunTests = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runTestSuite();
      setSummary(result);
    } catch (err: any) {
      setError(err.message || 'Failed to run test suite');
    } finally {
      setIsRunning(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    if (category.includes('Database')) return <Database className="w-3.5 h-3.5 text-emerald-600" />;
    if (category.includes('Parser')) return <Globe className="w-3.5 h-3.5 text-purple-600" />;
    if (category.includes('Deduplication')) return <Layers className="w-3.5 h-3.5 text-amber-600" />;
    if (category.includes('Ticker') || category.includes('CSV')) return <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />;
    return <Filter className="w-3.5 h-3.5 text-blue-600" />;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="test-runner-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-emerald-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">Automated Test Runner</h2>
              <p className="text-xs text-slate-500">
                Verify SQLite persistence, Yahoo Finance parser, deduplication, and filters
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

        {/* Action Toolbar */}
        <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunTests}
              disabled={isRunning}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-lg transition shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isRunning ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isRunning ? 'Running Test Suites...' : 'Run All Automated Tests'}</span>
            </button>

            {summary && (
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-semibold ${
                    summary.failed === 0
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {summary.failed === 0 ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <span>
                    {summary.passed}/{summary.total} Tests Passed ({summary.durationMs}ms)
                  </span>
                </span>
              </div>
            )}
          </div>

          <span className="text-xs text-slate-400 font-mono">
            {summary ? `Ran at ${new Date(summary.timestamp).toLocaleTimeString()}` : 'Ready'}
          </span>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200">
              {error}
            </div>
          )}

          {!summary && !isRunning && !error && (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <FileCode className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Ready to execute automated test suites</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Click "Run All Automated Tests" to execute the 12 comprehensive unit and integration test suites covering SQLite schema, XML parsing, canonical deduplication, and edge cases.
              </p>
            </div>
          )}

          {isRunning && (
            <div className="text-center py-12 space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
              <p className="text-xs text-slate-600 font-medium">
                Executing SQLite, Yahoo Finance XML Parser & Deduplication tests...
              </p>
            </div>
          )}

          {summary && (
            <div className="space-y-4">
              {/* Summary Scoreboard Box (Matching PDF Section 17) */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-4 font-mono text-xs space-y-2">
                <div className="text-emerald-400 font-bold font-sans flex items-center justify-between">
                  <span>Browser & API Test Execution Results</span>
                  <span>
                    Score: {summary.passed}/{summary.total} ({((summary.passed / summary.total) * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-300 pt-1">
                  {summary.results.map((r) => (
                    <div key={r.id} className="flex items-center justify-between pr-2">
                      <span className="flex items-center gap-1.5 truncate">
                        {r.status === 'passed' ? (
                          <span className="text-emerald-400 font-bold">✓</span>
                        ) : (
                          <span className="text-rose-400 font-bold">✗</span>
                        )}
                        <span className="truncate">{r.name}</span>
                      </span>
                      <span className="text-slate-500 shrink-0 ml-1">{r.durationMs}ms</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Detailed Test Cards List */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Detailed Test Assertions
                </h4>

                <div className="space-y-2">
                  {summary.results.map((r) => (
                    <div
                      key={r.id}
                      className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                        r.status === 'passed'
                          ? 'bg-white border-slate-200'
                          : 'bg-rose-50/70 border-rose-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {getCategoryIcon(r.category)}
                            <span>{r.category}</span>
                          </span>
                          <span className="font-semibold text-slate-900">{r.name}</span>
                        </div>
                        {r.message && (
                          <p className="text-[11px] text-rose-600 font-mono pl-1">
                            Error: {r.message}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] text-slate-400 font-mono">
                          {r.durationMs}ms
                        </span>
                        {r.status === 'passed' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            PASSED
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            FAILED
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
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
