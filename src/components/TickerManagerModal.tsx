import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Check,
  Upload,
  Download,
  Search,
  Building2,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  MinusSquare,
  AlertTriangle,
  Info,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import Papa from 'papaparse';
import { Ticker, TickerPortfolioStats } from '../types.js';
import { fetchTickerPortfolioStats } from '../services/api.js';

interface TickerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  tickers: Ticker[];
  onAddTicker: (data: { symbol: string; company_name?: string; exchange?: string; enabled?: boolean }) => Promise<void>;
  onUpdateTicker: (id: number, data: { symbol?: string; company_name?: string; exchange?: string; enabled?: boolean }) => Promise<void>;
  onDeleteTicker: (id: number) => Promise<void>;
  onToggleAll: (enabled: boolean) => Promise<void>;
  onBulkToggle: (ids: number[], enabled: boolean) => Promise<void>;
  onBulkImport: (
    tickers: Array<{ symbol: string; company_name?: string; exchange?: string; enabled?: boolean }>,
    options?: { updateExisting?: boolean; defaultEnabled?: boolean }
  ) => Promise<{ added: number; updated: number; existingSkipped?: number; errors: Array<{ symbol: string; error: string }> }>;
  onRefresh: () => void;
}

export interface CsvValidationRow {
  rawSymbol: string;
  symbol: string;
  company_name: string;
  exchange: string;
  status: 'New' | 'Existing' | 'Invalid';
  errorReason?: string;
}

type SortField = 'symbol' | 'company_name' | 'exchange' | 'enabled' | 'article_count' | 'last_successful_fetch_at';
type SortOrder = 'asc' | 'desc';

export const TickerManagerModal: React.FC<TickerManagerModalProps> = ({
  isOpen,
  onClose,
  tickers,
  onAddTicker,
  onUpdateTicker,
  onDeleteTicker,
  onToggleAll,
  onBulkToggle,
  onBulkImport,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'add' | 'csv'>('list');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [exchangeFilter, setExchangeFilter] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('symbol');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

  // Multi-selection for bulk operations
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [confirmBulkAction, setConfirmBulkAction] = useState<{
    action: 'enable' | 'disable';
    count: number;
    ids: number[];
  } | null>(null);

  // Portfolio Statistics
  const [stats, setStats] = useState<TickerPortfolioStats>({
    total: 0,
    enabled: 0,
    disabled: 0,
    neverFetched: 0,
    fetchedToday: 0,
    fetchErrors: 0,
  });

  // Single Add / Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formSymbol, setFormSymbol] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formExchange, setFormExchange] = useState('NASDAQ');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // CSV Import State
  const [csvText, setCsvText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<CsvValidationRow[]>([]);
  const [enableNewTickers, setEnableNewTickers] = useState(true);
  const [csvStatusMessage, setCsvStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Load / Reload Portfolio Stats whenever modal opens or tickers change
  useEffect(() => {
    if (isOpen) {
      loadStats();
    }
  }, [isOpen, tickers]);

  const loadStats = async () => {
    try {
      const s = await fetchTickerPortfolioStats();
      setStats(s);
    } catch {
      // Fallback compute locally from tickers array if needed
      const total = tickers.length;
      const enabled = tickers.filter((t) => t.enabled).length;
      const disabled = total - enabled;
      const neverFetched = tickers.filter((t) => !t.last_successful_fetch_at).length;
      const todayStr = new Date().toISOString().slice(0, 10);
      const fetchedToday = tickers.filter(
        (t) => t.last_successful_fetch_at && t.last_successful_fetch_at.startsWith(todayStr)
      ).length;
      setStats({
        total,
        enabled,
        disabled,
        neverFetched,
        fetchedToday,
        fetchErrors: 0,
      });
    }
  };

  // Distinct exchanges in portfolio
  const availableExchanges = useMemo(() => {
    const set = new Set<string>();
    tickers.forEach((t) => {
      if (t.exchange) set.add(t.exchange.toUpperCase());
    });
    return Array.from(set).sort();
  }, [tickers]);

  // Existing symbols set for quick lookup
  const existingSymbolsSet = useMemo(() => {
    return new Set(tickers.map((t) => t.symbol.toUpperCase()));
  }, [tickers]);

  // Filtered & Sorted Tickers
  const filteredAndSortedTickers = useMemo(() => {
    let result = tickers.filter((t) => {
      // Search matches symbol or company name
      const matchesSearch =
        !search.trim() ||
        t.symbol.toLowerCase().includes(search.toLowerCase()) ||
        (t.company_name && t.company_name.toLowerCase().includes(search.toLowerCase()));

      // Status filter
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' && t.enabled) ||
        (statusFilter === 'disabled' && !t.enabled);

      // Exchange filter
      const matchesExchange =
        exchangeFilter === 'all' || (t.exchange && t.exchange.toUpperCase() === exchangeFilter.toUpperCase());

      return matchesSearch && matchesStatus && matchesExchange;
    });

    // Sorting
    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      if (sortField === 'symbol' || sortField === 'company_name' || sortField === 'exchange') {
        valA = (valA || '').toString().toLowerCase();
        valB = (valB || '').toString().toLowerCase();
      } else if (sortField === 'enabled') {
        valA = a.enabled ? 1 : 0;
        valB = b.enabled ? 1 : 0;
      } else if (sortField === 'article_count') {
        valA = a.article_count || 0;
        valB = b.article_count || 0;
      } else if (sortField === 'last_successful_fetch_at') {
        valA = a.last_successful_fetch_at ? new Date(a.last_successful_fetch_at).getTime() : 0;
        valB = b.last_successful_fetch_at ? new Date(b.last_successful_fetch_at).getTime() : 0;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [tickers, search, statusFilter, exchangeFilter, sortField, sortOrder]);

  if (!isOpen) return null;

  // Sorting Handler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // Selection Handlers
  const handleToggleSelectRow = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSelectAllVisible = () => {
    const visibleIds = filteredAndSortedTickers.map((t) => t.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      // Unselect visible
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      // Add all visible
      const newSet = new Set([...selectedIds, ...visibleIds]);
      setSelectedIds(Array.from(newSet));
    }
  };

  const isAllVisibleSelected =
    filteredAndSortedTickers.length > 0 &&
    filteredAndSortedTickers.every((t) => selectedIds.includes(t.id));
  const isSomeVisibleSelected =
    filteredAndSortedTickers.some((t) => selectedIds.includes(t.id)) && !isAllVisibleSelected;

  // Bulk Operations Execution
  const handleInitiateBulkAction = (action: 'enable' | 'disable') => {
    if (selectedIds.length === 0) return;
    setConfirmBulkAction({
      action,
      count: selectedIds.length,
      ids: [...selectedIds],
    });
  };

  const handleExecuteBulkConfirmed = async () => {
    if (!confirmBulkAction) return;
    setIsSubmitting(true);
    try {
      await onBulkToggle(confirmBulkAction.ids, confirmBulkAction.action === 'enable');
      setConfirmBulkAction(null);
      setSelectedIds([]);
      await loadStats();
      onRefresh();
    } catch (err: any) {
      alert(`Bulk update failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Edit / Add Handlers
  const startEdit = (t: Ticker) => {
    setEditingId(t.id);
    setFormSymbol(t.symbol);
    setFormCompany(t.company_name || '');
    setFormExchange(t.exchange || 'NASDAQ');
    setFormEnabled(t.enabled);
    setActiveTab('add');
  };

  const handleSaveTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedSymbol = formSymbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      setFormError('Ticker symbol is required');
      return;
    }
    if (!/^[A-Z0-9.-]+$/.test(normalizedSymbol)) {
      setFormError('Ticker symbol contains invalid characters (only A-Z, 0-9, ., - allowed)');
      return;
    }
    if (normalizedSymbol.length > 10) {
      setFormError('Ticker symbol is too long (maximum 10 characters)');
      return;
    }

    setFormError('');
    setIsSubmitting(true);
    try {
      if (editingId) {
        await onUpdateTicker(editingId, {
          symbol: normalizedSymbol,
          company_name: formCompany.trim(),
          exchange: formExchange.trim(),
          enabled: formEnabled,
        });
      } else {
        await onAddTicker({
          symbol: normalizedSymbol,
          company_name: formCompany.trim(),
          exchange: formExchange.trim(),
          enabled: formEnabled,
        });
      }
      setEditingId(null);
      setFormSymbol('');
      setFormCompany('');
      setFormExchange('NASDAQ');
      setFormEnabled(true);
      setActiveTab('list');
      await loadStats();
      onRefresh();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save ticker');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSingleTicker = async (t: Ticker) => {
    try {
      await onUpdateTicker(t.id, { enabled: !t.enabled });
      await loadStats();
      onRefresh();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number, symbol: string) => {
    if (
      confirm(
        `Are you sure you want to remove ticker $${symbol}?\nHistorical news articles will remain in the database.`
      )
    ) {
      try {
        await onDeleteTicker(id);
        setSelectedIds((prev) => prev.filter((item) => item !== id));
        await loadStats();
        onRefresh();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  // =========================================================================
  // CSV PARSING & VALIDATION ENGINE (Section 1, 2, 3, 4, 10)
  // =========================================================================
  const validateAndProcessRawData = (rows: any[], fileName?: string) => {
    const results: CsvValidationRow[] = [];
    const seenInThisCsv = new Set<string>();

    for (const row of rows) {
      const rawSym =
        row.symbol ||
        row.Symbol ||
        row.ticker ||
        row.Ticker ||
        row.SYMBOL ||
        row.TICKER ||
        (typeof row === 'string' ? row : Object.values(row)[0] || '');

      const rawComp = row.company_name || row.company || row.Company || row.Name || row.name || '';
      const rawExch = row.exchange || row.Exchange || row.EXCHANGE || 'US';

      const rawSymStr = String(rawSym || '').trim();
      const normalizedSym = rawSymStr.toUpperCase();
      const compStr = String(rawComp || '').trim();
      const exchStr = String(rawExch || 'US').trim().toUpperCase();

      // Check 1: Empty symbol
      if (!rawSymStr) {
        results.push({
          rawSymbol: '(empty)',
          symbol: '',
          company_name: compStr,
          exchange: exchStr,
          status: 'Invalid',
          errorReason: 'Empty symbol',
        });
        continue;
      }

      // Check 2: Invalid characters
      if (!/^[A-Z0-9.-]+$/.test(normalizedSym)) {
        results.push({
          rawSymbol: rawSymStr,
          symbol: normalizedSym,
          company_name: compStr,
          exchange: exchStr,
          status: 'Invalid',
          errorReason: 'Invalid characters in symbol',
        });
        continue;
      }

      // Check 3: Excessively long symbol (> 10 chars)
      if (normalizedSym.length > 10) {
        results.push({
          rawSymbol: rawSymStr,
          symbol: normalizedSym,
          company_name: compStr,
          exchange: exchStr,
          status: 'Invalid',
          errorReason: 'Excessively long symbol (> 10 chars)',
        });
        continue;
      }

      // Check 4: Duplicate within this CSV batch
      if (seenInThisCsv.has(normalizedSym)) {
        results.push({
          rawSymbol: rawSymStr,
          symbol: normalizedSym,
          company_name: compStr,
          exchange: exchStr,
          status: 'Invalid',
          errorReason: 'Duplicate symbol inside CSV',
        });
        continue;
      }
      seenInThisCsv.add(normalizedSym);

      // Check 5: Duplicate already in SQLite
      if (existingSymbolsSet.has(normalizedSym)) {
        results.push({
          rawSymbol: rawSymStr,
          symbol: normalizedSym,
          company_name: compStr,
          exchange: exchStr,
          status: 'Existing',
          errorReason: 'Already exists in portfolio (fetch state preserved)',
        });
        continue;
      }

      // Valid New Ticker
      results.push({
        rawSymbol: rawSymStr,
        symbol: normalizedSym,
        company_name: compStr,
        exchange: exchStr,
        status: 'New',
      });
    }

    setParsedRows(results);
    if (fileName) setCsvFileName(fileName);
    setCsvStatusMessage({
      type: 'info',
      message: `Parsed ${results.length} rows from CSV. Review preview below before committing.`,
    });
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          validateAndProcessRawData(results.data as any[], file.name);
        } else {
          setCsvStatusMessage({ type: 'error', message: 'The uploaded CSV file is empty.' });
        }
      },
      error: (err) => {
        setCsvStatusMessage({ type: 'error', message: `CSV Parse error: ${err.message}` });
      },
    });
  };

  const handleCsvPasteParse = () => {
    if (!csvText.trim()) {
      setCsvStatusMessage({ type: 'error', message: 'Please paste CSV content or a list of tickers first.' });
      return;
    }

    Papa.parse(csvText.trim(), {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        let rows: any[] = [];
        const hasSymbolHeader =
          results.meta.fields &&
          results.meta.fields.some((f) => ['symbol', 'Symbol', 'ticker', 'Ticker'].includes(f));

        if (hasSymbolHeader && results.data && results.data.length > 0) {
          rows = results.data;
        } else {
          // Parse plain comma or newline-separated tickers list
          const lines = csvText.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);
          rows = lines.map((line) => {
            const parts = line.split(',').map((p) => p.trim());
            return {
              symbol: parts[0] || '',
              company_name: parts[1] || '',
              exchange: parts[2] || 'US',
            };
          });
        }
        validateAndProcessRawData(rows, 'Pasted Text');
      },
    });
  };

  // Preview Counts
  const csvNewCount = parsedRows.filter((r) => r.status === 'New').length;
  const csvExistingCount = parsedRows.filter((r) => r.status === 'Existing').length;
  const csvInvalidCount = parsedRows.filter((r) => r.status === 'Invalid').length;

  // Execute CSV Import (Idempotent, Safe)
  const handleCommitCsvImport = async () => {
    const validNewRows = parsedRows.filter((r) => r.status === 'New');
    if (validNewRows.length === 0 && csvExistingCount === 0) {
      alert('No valid tickers to import.');
      return;
    }

    setIsSubmitting(true);
    try {
      const itemsToImport = validNewRows.map((r) => ({
        symbol: r.symbol,
        company_name: r.company_name,
        exchange: r.exchange,
        enabled: enableNewTickers,
      }));

      const res = await onBulkImport(itemsToImport, {
        defaultEnabled: enableNewTickers,
        updateExisting: false, // strictly preserve existing ticker fetch state and enabled state
      });

      setCsvStatusMessage({
        type: 'success',
        message: `Import committed: ${res.added} new tickers added. ${csvExistingCount} existing tickers safely preserved.`,
      });

      // Clear preview after short delay and switch to list
      setTimeout(async () => {
        setParsedRows([]);
        setCsvText('');
        setCsvFileName('');
        setActiveTab('list');
        await loadStats();
        onRefresh();
      }, 1200);
    } catch (err: any) {
      setCsvStatusMessage({ type: 'error', message: `Import failed: ${err.message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  // =========================================================================
  // CSV EXPORT (Section 9: symbol,company_name,exchange,enabled,last_successful_fetch_at)
  // =========================================================================
  const handleExportCsv = () => {
    const exportData = tickers.map((t) => ({
      symbol: t.symbol,
      company_name: t.company_name || '',
      exchange: t.exchange || 'US',
      enabled: t.enabled ? 'true' : 'false',
      last_successful_fetch_at: t.last_successful_fetch_at || '',
    }));

    const csv = Papa.unparse(exportData, {
      columns: ['symbol', 'company_name', 'exchange', 'enabled', 'last_successful_fetch_at'],
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `tickers_export_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Seed 100 S&P Tickers for instant testing
  const handleSeed100Tickers = async () => {
    const sample100 = [
      { symbol: 'AAPL', company_name: 'Apple Inc.', exchange: 'NASDAQ' },
      { symbol: 'MSFT', company_name: 'Microsoft Corp.', exchange: 'NASDAQ' },
      { symbol: 'NVDA', company_name: 'NVIDIA Corp.', exchange: 'NASDAQ' },
      { symbol: 'AMZN', company_name: 'Amazon.com Inc.', exchange: 'NASDAQ' },
      { symbol: 'GOOGL', company_name: 'Alphabet Inc.', exchange: 'NASDAQ' },
      { symbol: 'META', company_name: 'Meta Platforms Inc.', exchange: 'NASDAQ' },
      { symbol: 'TSLA', company_name: 'Tesla Inc.', exchange: 'NASDAQ' },
      { symbol: 'BRK-B', company_name: 'Berkshire Hathaway Inc.', exchange: 'NYSE' },
      { symbol: 'LLY', company_name: 'Eli Lilly and Company', exchange: 'NYSE' },
      { symbol: 'JPM', company_name: 'JPMorgan Chase & Co.', exchange: 'NYSE' },
      { symbol: 'V', company_name: 'Visa Inc.', exchange: 'NYSE' },
      { symbol: 'UNH', company_name: 'UnitedHealth Group Inc.', exchange: 'NYSE' },
      { symbol: 'XOM', company_name: 'Exxon Mobil Corp.', exchange: 'NYSE' },
      { symbol: 'WMT', company_name: 'Walmart Inc.', exchange: 'NYSE' },
      { symbol: 'MA', company_name: 'Mastercard Inc.', exchange: 'NYSE' },
      { symbol: 'PG', company_name: 'Procter & Gamble Co.', exchange: 'NYSE' },
      { symbol: 'JNJ', company_name: 'Johnson & Johnson', exchange: 'NYSE' },
      { symbol: 'HD', company_name: 'Home Depot Inc.', exchange: 'NYSE' },
      { symbol: 'COST', company_name: 'Costco Wholesale Corp.', exchange: 'NASDAQ' },
      { symbol: 'ABBV', company_name: 'AbbVie Inc.', exchange: 'NYSE' },
      { symbol: 'ORCL', company_name: 'Oracle Corp.', exchange: 'NYSE' },
      { symbol: 'CRM', company_name: 'Salesforce Inc.', exchange: 'NYSE' },
      { symbol: 'BAC', company_name: 'Bank of America Corp.', exchange: 'NYSE' },
      { symbol: 'CVX', company_name: 'Chevron Corp.', exchange: 'NYSE' },
      { symbol: 'KO', company_name: 'Coca-Cola Co.', exchange: 'NYSE' },
      { symbol: 'NFLX', company_name: 'Netflix Inc.', exchange: 'NASDAQ' },
      { symbol: 'MRK', company_name: 'Merck & Co. Inc.', exchange: 'NYSE' },
      { symbol: 'AMD', company_name: 'Advanced Micro Devices Inc.', exchange: 'NASDAQ' },
      { symbol: 'PEP', company_name: 'PepsiCo Inc.', exchange: 'NASDAQ' },
      { symbol: 'TMO', company_name: 'Thermo Fisher Scientific', exchange: 'NYSE' },
      { symbol: 'LIN', company_name: 'Linde plc', exchange: 'NASDAQ' },
      { symbol: 'WFC', company_name: 'Wells Fargo & Co.', exchange: 'NYSE' },
      { symbol: 'ADBE', company_name: 'Adobe Inc.', exchange: 'NASDAQ' },
      { symbol: 'ACN', company_name: 'Accenture plc', exchange: 'NYSE' },
      { symbol: 'MCD', company_name: "McDonald's Corp.", exchange: 'NYSE' },
      { symbol: 'CSCO', company_name: 'Cisco Systems Inc.', exchange: 'NASDAQ' },
      { symbol: 'ABT', company_name: 'Abbott Laboratories', exchange: 'NYSE' },
      { symbol: 'IBM', company_name: 'International Business Machines', exchange: 'NYSE' },
      { symbol: 'GE', company_name: 'General Electric Co.', exchange: 'NYSE' },
      { symbol: 'QCOM', company_name: 'QUALCOMM Inc.', exchange: 'NASDAQ' },
      { symbol: 'CAT', company_name: 'Caterpillar Inc.', exchange: 'NYSE' },
      { symbol: 'INTU', company_name: 'Intuit Inc.', exchange: 'NASDAQ' },
      { symbol: 'VZ', company_name: 'Verizon Communications Inc.', exchange: 'NYSE' },
      { symbol: 'DIS', company_name: 'Walt Disney Co.', exchange: 'NYSE' },
      { symbol: 'TXN', company_name: 'Texas Instruments Inc.', exchange: 'NASDAQ' },
      { symbol: 'AMAT', company_name: 'Applied Materials Inc.', exchange: 'NASDAQ' },
      { symbol: 'NOW', company_name: 'ServiceNow Inc.', exchange: 'NYSE' },
      { symbol: 'PM', company_name: 'Philip Morris International', exchange: 'NYSE' },
      { symbol: 'ISRG', company_name: 'Intuitive Surgical Inc.', exchange: 'NASDAQ' },
      { symbol: 'PFE', company_name: 'Pfizer Inc.', exchange: 'NYSE' },
      { symbol: 'UBER', company_name: 'Uber Technologies Inc.', exchange: 'NYSE' },
      { symbol: 'CMG', company_name: 'Chipotle Mexican Grill', exchange: 'NYSE' },
      { symbol: 'AMGN', company_name: 'Amgen Inc.', exchange: 'NASDAQ' },
      { symbol: 'SPGI', company_name: 'S&P Global Inc.', exchange: 'NYSE' },
      { symbol: 'HON', company_name: 'Honeywell International', exchange: 'NASDAQ' },
      { symbol: 'LOW', company_name: "Lowe's Companies Inc.", exchange: 'NYSE' },
      { symbol: 'UNP', company_name: 'Union Pacific Corp.', exchange: 'NYSE' },
      { symbol: 'GS', company_name: 'Goldman Sachs Group Inc.', exchange: 'NYSE' },
      { symbol: 'MS', company_name: 'Morgan Stanley', exchange: 'NYSE' },
      { symbol: 'BKNG', company_name: 'Booking Holdings Inc.', exchange: 'NASDAQ' },
      { symbol: 'RTX', company_name: 'RTX Corp.', exchange: 'NYSE' },
      { symbol: 'LRCX', company_name: 'Lam Research Corp.', exchange: 'NASDAQ' },
      { symbol: 'COP', company_name: 'ConocoPhillips', exchange: 'NYSE' },
      { symbol: 'INTC', company_name: 'Intel Corp.', exchange: 'NASDAQ' },
      { symbol: 'PLTR', company_name: 'Palantir Technologies', exchange: 'NYSE' },
      { symbol: 'BLK', company_name: 'BlackRock Inc.', exchange: 'NYSE' },
      { symbol: 'SYK', company_name: 'Stryker Corp.', exchange: 'NYSE' },
      { symbol: 'PGR', company_name: 'Progressive Corp.', exchange: 'NYSE' },
      { symbol: 'MDLZ', company_name: 'Mondelez International', exchange: 'NASDAQ' },
      { symbol: 'T', company_name: 'AT&T Inc.', exchange: 'NYSE' },
      { symbol: 'SCHW', company_name: 'Charles Schwab Corp.', exchange: 'NYSE' },
      { symbol: 'ADI', company_name: 'Analog Devices Inc.', exchange: 'NASDAQ' },
      { symbol: 'TJX', company_name: 'TJX Companies Inc.', exchange: 'NYSE' },
      { symbol: 'BA', company_name: 'Boeing Co.', exchange: 'NYSE' },
      { symbol: 'VRTX', company_name: 'Vertex Pharmaceuticals', exchange: 'NASDAQ' },
      { symbol: 'REGN', company_name: 'Regeneron Pharmaceuticals', exchange: 'NASDAQ' },
      { symbol: 'PANW', company_name: 'Palo Alto Networks', exchange: 'NASDAQ' },
      { symbol: 'MMC', company_name: 'Marsh & McLennan Companies', exchange: 'NYSE' },
      { symbol: 'CB', company_name: 'Chubb Ltd.', exchange: 'NYSE' },
      { symbol: 'C', company_name: 'Citigroup Inc.', exchange: 'NYSE' },
      { symbol: 'ETN', company_name: 'Eaton Corp plc', exchange: 'NYSE' },
      { symbol: 'BSX', company_name: 'Boston Scientific Corp.', exchange: 'NYSE' },
      { symbol: 'KLAC', company_name: 'KLA Corp.', exchange: 'NASDAQ' },
      { symbol: 'SNPS', company_name: 'Synopsys Inc.', exchange: 'NASDAQ' },
      { symbol: 'CDNS', company_name: 'Cadence Design Systems', exchange: 'NASDAQ' },
      { symbol: 'MU', company_name: 'Micron Technology Inc.', exchange: 'NASDAQ' },
      { symbol: 'WM', company_name: 'Waste Management Inc.', exchange: 'NYSE' },
      { symbol: 'ICE', company_name: 'Intercontinental Exchange', exchange: 'NYSE' },
      { symbol: 'SHW', company_name: 'Sherwin-Williams Co.', exchange: 'NYSE' },
      { symbol: 'MCO', company_name: "Moody's Corp.", exchange: 'NYSE' },
      { symbol: 'CME', company_name: 'CME Group Inc.', exchange: 'NASDAQ' },
      { symbol: 'DE', company_name: 'Deere & Company', exchange: 'NYSE' },
      { symbol: 'SO', company_name: 'Southern Co.', exchange: 'NYSE' },
      { symbol: 'DUK', company_name: 'Duke Energy Corp.', exchange: 'NYSE' },
      { symbol: 'CL', company_name: 'Colgate-Palmolive Co.', exchange: 'NYSE' },
      { symbol: 'PH', company_name: 'Parker-Hannifin Corp.', exchange: 'NYSE' },
      { symbol: 'GD', company_name: 'General Dynamics Corp.', exchange: 'NYSE' },
      { symbol: 'ZTS', company_name: 'Zoetis Inc.', exchange: 'NYSE' },
      { symbol: 'CRWD', company_name: 'CrowdStrike Holdings', exchange: 'NASDAQ' },
      { symbol: 'COF', company_name: 'Capital One Financial', exchange: 'NYSE' },
    ];

    setIsSubmitting(true);
    try {
      await onBulkImport(sample100, { defaultEnabled: true, updateExisting: false });
      await loadStats();
      onRefresh();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        id="ticker-manager-modal"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* MODAL HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Stock Ticker Portfolio</h2>
              <p className="text-xs text-slate-500">
                Manage your watchlist of ~100 tickers with bulk CSV import, filters, and safety validation.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              title="Export all tickers configuration as CSV"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 transition shadow-2xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* SECTION 8: TICKER STATISTICS DASHBOARD */}
        <div className="px-6 py-3 bg-slate-100/70 border-b border-slate-200 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs shrink-0">
          <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Total</span>
            <span className="text-base font-extrabold text-slate-900">{stats.total}</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-emerald-200/60 shadow-2xs">
            <span className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider block">Enabled</span>
            <span className="text-base font-extrabold text-emerald-700">{stats.enabled}</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block">Disabled</span>
            <span className="text-base font-extrabold text-slate-600">{stats.disabled}</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-amber-200/60 shadow-2xs">
            <span className="text-[10px] text-amber-600 font-semibold uppercase tracking-wider block">Never Fetched</span>
            <span className="text-base font-extrabold text-amber-700">{stats.neverFetched}</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-blue-200/60 shadow-2xs">
            <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider block">Fetched Today</span>
            <span className="text-base font-extrabold text-blue-700">{stats.fetchedToday}</span>
          </div>
          <div className="bg-white p-2 rounded-lg border border-rose-200/60 shadow-2xs">
            <span className="text-[10px] text-rose-500 font-semibold uppercase tracking-wider block">Fetch Errors</span>
            <span className="text-base font-extrabold text-rose-600">{stats.fetchErrors}</span>
          </div>
        </div>

        {/* TAB SELECTOR */}
        <div className="px-6 border-b border-slate-200 flex items-center justify-between bg-white text-xs shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setActiveTab('list');
                setEditingId(null);
              }}
              className={`py-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'list'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <span>Portfolio List</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold">
                {tickers.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('csv')}
              className={`py-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'csv'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>CSV Import & Preview</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('add');
                if (!editingId) {
                  setFormSymbol('');
                  setFormCompany('');
                }
              }}
              className={`py-3 border-b-2 font-medium transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'add'
                  ? 'border-emerald-600 text-emerald-700 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingId ? `Edit Ticker` : 'Add Single'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSeed100Tickers}
              title="Populate or merge Top 100 S&P 500 Tickers"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-emerald-700 hover:bg-emerald-50 rounded-md border border-emerald-200 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Seed 100 Tickers</span>
            </button>
          </div>
        </div>

        {/* TAB BODY */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: TICKER LIST WITH BULK ACTIONS, FILTERING & SORTING */}
          {activeTab === 'list' && (
            <div className="space-y-4">
              {/* FILTER BAR: Search, Status, Exchange (Section 7) */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                {/* Search box */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search symbol (NVDA) or company name..."
                    className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400 px-1.5 uppercase">Status:</span>
                  {(['all', 'enabled', 'disabled'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2 py-1 rounded text-xs font-medium capitalize transition ${
                        statusFilter === s
                          ? 'bg-emerald-600 text-white font-semibold shadow-2xs'
                          : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Exchange Filter */}
                <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
                  <span className="text-[11px] font-semibold text-slate-400 px-1.5 uppercase">Exchange:</span>
                  <select
                    value={exchangeFilter}
                    onChange={(e) => setExchangeFilter(e.target.value)}
                    className="bg-transparent text-xs font-medium text-slate-700 pr-2 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Exchanges</option>
                    {availableExchanges.map((ex) => (
                      <option key={ex} value={ex}>
                        {ex}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* SECTION 6: BULK ACTION BAR (When tickers are selected) */}
              {selectedIds.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs animate-in fade-in duration-100">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                    <span className="font-bold text-emerald-900">{selectedIds.length} tickers selected</span>
                    <button
                      onClick={() => setSelectedIds([])}
                      className="text-emerald-700 hover:underline text-[11px] ml-2"
                    >
                      Clear selection
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleInitiateBulkAction('enable')}
                      disabled={isSubmitting}
                      className="px-3 py-1.5 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-2xs"
                    >
                      Enable Selected ({selectedIds.length})
                    </button>
                    <button
                      onClick={() => handleInitiateBulkAction('disable')}
                      disabled={isSubmitting}
                      className="px-3 py-1.5 font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition shadow-2xs"
                    >
                      Disable Selected ({selectedIds.length})
                    </button>
                  </div>
                </div>
              )}

              {/* CONFIRMATION MODAL FOR BULK CHANGES (Section 6) */}
              {confirmBulkAction && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs space-y-2.5 animate-in fade-in duration-100">
                  <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>
                      {confirmBulkAction.action === 'disable'
                        ? `Disable ${confirmBulkAction.count} selected tickers?`
                        : `Enable ${confirmBulkAction.count} selected tickers?`}
                    </span>
                  </div>
                  <p className="text-amber-800">
                    {confirmBulkAction.action === 'disable'
                      ? 'This will stop future news imports for these tickers. Historical news will NOT be deleted.'
                      : 'These tickers will be actively included in all future news import jobs.'}
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setConfirmBulkAction(null)}
                      className="px-3 py-1.5 text-slate-600 hover:bg-slate-200/60 rounded-lg transition font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleExecuteBulkConfirmed}
                      disabled={isSubmitting}
                      className={`px-4 py-1.5 font-bold rounded-lg transition shadow-2xs text-white ${
                        confirmBulkAction.action === 'disable'
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-emerald-600 hover:bg-emerald-700'
                      }`}
                    >
                      {confirmBulkAction.action === 'disable'
                        ? `Disable ${confirmBulkAction.count}`
                        : `Enable ${confirmBulkAction.count}`}
                    </button>
                  </div>
                </div>
              )}

              {/* TICKERS TABLE WITH SORTING & SELECTION */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-left text-xs text-slate-700 border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider sticky top-0 z-10 select-none">
                      <tr>
                        {/* Select All Checkbox */}
                        <th className="py-2.5 px-3 w-10 text-center">
                          <button
                            onClick={handleSelectAllVisible}
                            className="text-slate-400 hover:text-slate-700 cursor-pointer"
                            title={isAllVisibleSelected ? 'Deselect visible' : 'Select all visible'}
                          >
                            {isAllVisibleSelected ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : isSomeVisibleSelected ? (
                              <MinusSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                        </th>
                        <th
                          className="py-2.5 px-3 w-16 cursor-pointer hover:bg-slate-100 transition"
                          onClick={() => handleSort('enabled')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Status</span>
                            {sortField === 'enabled' && (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                            )}
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-4 w-28 cursor-pointer hover:bg-slate-100 transition"
                          onClick={() => handleSort('symbol')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Symbol</span>
                            {sortField === 'symbol' && (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                            )}
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-4 cursor-pointer hover:bg-slate-100 transition"
                          onClick={() => handleSort('company_name')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Company</span>
                            {sortField === 'company_name' && (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                            )}
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-4 w-24 cursor-pointer hover:bg-slate-100 transition"
                          onClick={() => handleSort('exchange')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Exchange</span>
                            {sortField === 'exchange' && (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                            )}
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-4 w-20 cursor-pointer hover:bg-slate-100 transition"
                          onClick={() => handleSort('article_count')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Articles</span>
                            {sortField === 'article_count' && (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                            )}
                          </div>
                        </th>
                        <th
                          className="py-2.5 px-4 w-32 cursor-pointer hover:bg-slate-100 transition"
                          onClick={() => handleSort('last_successful_fetch_at')}
                        >
                          <div className="flex items-center gap-1">
                            <span>Last Fetch</span>
                            {sortField === 'last_successful_fetch_at' && (
                              sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-600" /> : <ArrowDown className="w-3 h-3 text-emerald-600" />
                            )}
                          </div>
                        </th>
                        <th className="py-2.5 px-4 text-right w-20">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-sans">
                      {filteredAndSortedTickers.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-slate-400">
                            No tickers found matching your criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedTickers.map((t) => {
                          const isSelected = selectedIds.includes(t.id);
                          const hasLastFetch = Boolean(t.last_successful_fetch_at);
                          const localTime = hasLastFetch
                            ? new Date(t.last_successful_fetch_at!).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: false,
                              })
                            : null;

                          return (
                            <tr
                              key={t.id}
                              className={`hover:bg-slate-50/80 transition ${
                                isSelected ? 'bg-emerald-50/40' : ''
                              }`}
                            >
                              {/* Row selection checkbox */}
                              <td className="py-2.5 px-3 text-center">
                                <button
                                  onClick={() => handleToggleSelectRow(t.id)}
                                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                                  ) : (
                                    <Square className="w-4 h-4" />
                                  )}
                                </button>
                              </td>

                              {/* Toggle Status */}
                              <td className="py-2.5 px-3">
                                <button
                                  onClick={() => handleToggleSingleTicker(t)}
                                  title={t.enabled ? 'Enabled (Click to Disable)' : 'Disabled (Click to Enable)'}
                                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                                >
                                  {t.enabled ? (
                                    <ToggleRight className="w-5 h-5 text-emerald-600" />
                                  ) : (
                                    <ToggleLeft className="w-5 h-5 text-slate-300" />
                                  )}
                                </button>
                              </td>

                              {/* Symbol */}
                              <td className="py-2.5 px-4 font-bold font-mono text-slate-900">
                                ${t.symbol}
                              </td>

                              {/* Company Name */}
                              <td className="py-2.5 px-4 text-slate-700 truncate max-w-[200px]" title={t.company_name}>
                                {t.company_name || <span className="text-slate-400 italic">None</span>}
                              </td>

                              {/* Exchange */}
                              <td className="py-2.5 px-4 text-slate-500 font-mono text-xs">
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                  {t.exchange || 'US'}
                                </span>
                              </td>

                              {/* Articles Count */}
                              <td className="py-2.5 px-4 font-mono text-slate-600">
                                <span className="px-2 py-0.5 rounded-full bg-slate-100 font-bold text-[11px]">
                                  {t.article_count || 0}
                                </span>
                              </td>

                              {/* Last Fetch */}
                              <td className="py-2.5 px-4">
                                {hasLastFetch ? (
                                  <span
                                    className="inline-flex items-center gap-1 font-mono text-xs text-slate-700 bg-slate-100/90 px-2 py-0.5 rounded border border-slate-200/70"
                                    title={`UTC: ${t.last_successful_fetch_at}\nLocal: ${new Date(
                                      t.last_successful_fetch_at!
                                    ).toLocaleString()}`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    {localTime}
                                  </span>
                                ) : (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 font-normal italic"
                                    title="No previous fetch recorded"
                                  >
                                    Initial
                                  </span>
                                )}
                              </td>

                              {/* Action Buttons */}
                              <td className="py-2.5 px-4 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => startEdit(t)}
                                    title="Edit Ticker"
                                    className="p-1 text-slate-400 hover:text-slate-700 rounded transition"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(t.id, t.symbol)}
                                    title="Delete Ticker"
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CSV BULK IMPORT & VALIDATED PREVIEW (Section 1, 2, 3, 4, 5, 10) */}
          {activeTab === 'csv' && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">Upload & Preview CSV Ticker List</h3>
                <p className="text-xs text-slate-500">
                  Upload a <code>.csv</code> file with columns: <code>symbol</code>, <code>company_name</code> (optional), <code>exchange</code> (optional).
                  Only <code>symbol</code> is strictly required. Symbols will be validated and normalized.
                </p>
              </div>

              {/* Upload Dropzone */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-5 text-center hover:border-emerald-500 transition bg-slate-50/50 flex flex-col items-center justify-center">
                  <Upload className="w-8 h-8 text-emerald-600 mb-2" />
                  <label className="text-xs font-semibold text-emerald-700 hover:underline cursor-pointer block mb-1">
                    Select CSV File
                    <input
                      type="file"
                      accept=".csv,.txt"
                      onChange={handleCsvFileUpload}
                      className="hidden"
                    />
                  </label>
                  <p className="text-[11px] text-slate-400">or drag and drop your file here</p>
                  {csvFileName && (
                    <span className="mt-2 text-xs font-mono font-medium text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {csvFileName}
                    </span>
                  )}
                </div>

                {/* Or Paste Raw Text */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Or Paste CSV Content / Ticker List:
                  </label>
                  <textarea
                    rows={4}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder="symbol,company_name,exchange&#10;AAPL,Apple Inc.,NASDAQ&#10;MSFT,Microsoft Corporation,NASDAQ&#10;NVDA,NVIDIA Corporation,NASDAQ&#10;AMZN,Amazon.com Inc.,NASDAQ&#10;GOOGL,Alphabet Inc.,NASDAQ"
                    className="w-full p-2.5 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={handleCsvPasteParse}
                    className="px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition"
                  >
                    Parse Text
                  </button>
                </div>
              </div>

              {/* Status Message */}
              {csvStatusMessage && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                    csvStatusMessage.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : csvStatusMessage.type === 'error'
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-blue-50 text-blue-800 border-blue-200'
                  }`}
                >
                  {csvStatusMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : csvStatusMessage.type === 'error' ? (
                    <XCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  ) : (
                    <Info className="w-4 h-4 shrink-0 text-blue-600" />
                  )}
                  <span>{csvStatusMessage.message}</span>
                </div>
              )}

              {/* SECTION 2: CSV IMPORT PREVIEW CARD & TABLE */}
              {parsedRows.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        CSV Import Preview
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Review validation results before committing changes to SQLite.
                      </p>
                    </div>

                    {/* Import Options (Section 5) */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        id="enable-new-tickers-check"
                        checked={enableNewTickers}
                        onChange={(e) => setEnableNewTickers(e.target.checked)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                      <label htmlFor="enable-new-tickers-check" className="text-xs font-medium text-slate-700 cursor-pointer">
                        Enable newly imported tickers
                      </label>
                    </div>
                  </div>

                  {/* Summary Breakdown Cards (Section 2) */}
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase block">Rows Found</span>
                      <span className="text-sm font-bold text-slate-900">{parsedRows.length}</span>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg border border-emerald-200">
                      <span className="text-[10px] text-emerald-700 font-semibold uppercase block">New Tickers</span>
                      <span className="text-sm font-bold text-emerald-800">{csvNewCount}</span>
                    </div>
                    <div className="p-2 bg-amber-50 rounded-lg border border-amber-200">
                      <span className="text-[10px] text-amber-700 font-semibold uppercase block">Already Existing</span>
                      <span className="text-sm font-bold text-amber-800">{csvExistingCount}</span>
                    </div>
                    <div className="p-2 bg-rose-50 rounded-lg border border-rose-200">
                      <span className="text-[10px] text-rose-700 font-semibold uppercase block">Invalid</span>
                      <span className="text-sm font-bold text-rose-800">{csvInvalidCount}</span>
                    </div>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-slate-50 sticky top-0 font-semibold text-slate-500 uppercase tracking-wider text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Symbol</th>
                          <th className="py-2 px-3">Company</th>
                          <th className="py-2 px-3">Exchange</th>
                          <th className="py-2 px-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-sans">
                        {parsedRows.map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="py-1.5 px-3 font-mono font-bold text-slate-900">
                              {r.symbol ? `$${r.symbol}` : <span className="text-rose-500 italic font-normal">{r.rawSymbol}</span>}
                            </td>
                            <td className="py-1.5 px-3 text-slate-600 truncate max-w-[180px]">
                              {r.company_name || <span className="text-slate-400 italic">None</span>}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-slate-500 text-[11px]">
                              {r.exchange || 'US'}
                            </td>
                            <td className="py-1.5 px-3">
                              {r.status === 'New' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  New
                                </span>
                              )}
                              {r.status === 'Existing' && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800"
                                  title={r.errorReason}
                                >
                                  Existing
                                </span>
                              )}
                              {r.status === 'Invalid' && (
                                <span
                                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 inline-flex items-center gap-1"
                                  title={r.errorReason}
                                >
                                  <span>Invalid: {r.errorReason}</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Commit Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setParsedRows([]);
                        setCsvText('');
                        setCsvFileName('');
                        setCsvStatusMessage(null);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCommitCsvImport}
                      disabled={isSubmitting || csvNewCount === 0}
                      className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <span>Importing...</span>
                      ) : (
                        <span>Import {csvNewCount} New Tickers</span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ADD / EDIT SINGLE TICKER */}
          {activeTab === 'add' && (
            <form onSubmit={handleSaveTicker} className="max-w-md mx-auto space-y-4 py-2">
              <h3 className="text-sm font-bold text-slate-900">
                {editingId ? `Edit Ticker #${editingId}` : 'Add Single Stock Ticker'}
              </h3>

              {formError && (
                <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-lg border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ticker Symbol <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. AAPL, NVDA, MSFT"
                  value={formSymbol}
                  onChange={(e) => setFormSymbol(e.target.value.toUpperCase())}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg uppercase font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apple Inc."
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Exchange
                </label>
                <select
                  value={formExchange}
                  onChange={(e) => setFormExchange(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                >
                  <option value="NASDAQ">NASDAQ</option>
                  <option value="NYSE">NYSE</option>
                  <option value="AMEX">AMEX</option>
                  <option value="US">US Generic</option>
                  <option value="LSE">LSE (London)</option>
                  <option value="TSX">TSX (Toronto)</option>
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="ticker-enabled-check"
                  checked={formEnabled}
                  onChange={(e) => setFormEnabled(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="ticker-enabled-check" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Enable ticker for automatic news fetching
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setActiveTab('list');
                  }}
                  className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingId ? 'Update Ticker' : 'Add Ticker'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            {filteredAndSortedTickers.length} of {tickers.length} tickers shown
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition shadow-2xs bg-white border border-slate-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
