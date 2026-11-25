import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FolderOpen,
  LogOut,
  Plus,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';
import { useToast } from '../contexts/ToastContext';
import { tr } from '../i18n/translations';
import type { Booking, Language, WalletTransaction } from '../types';
import {
  createSpreadsheetWithRows,
  getSpreadsheetMetadata,
  getWorkspaceAccessToken,
  initGoogleWorkspaceAuth,
  listUserSpreadsheets,
  readSheetTabValues,
  replaceSheetTabRows,
  signInForGoogleSheets,
  signOutGoogleWorkspace,
  type DriveSpreadsheetFile,
  type SpreadsheetMetadata,
} from '../utils/googleSheets';

type DatasetKey = 'bookings' | 'finance' | 'partners';

interface PendingSheetMutation {
  kind: 'create' | 'update';
  dataset: DatasetKey;
  title: string;
  tabName: string;
  spreadsheetId?: string;
  rows: Array<Array<string | number>>;
}

export const GoogleSheetsSyncPanel: React.FC<{
  lang?: Language;
  bookings: Booking[];
  transactions: WalletTransaction[];
  partners: any[];
}> = ({ lang = 'en', bookings, transactions, partners }) => {
  const toast = useToast();
  const [needsAuth, setNeedsAuth] = useState<boolean>(() => !getWorkspaceAccessToken());
  const [accessToken, setAccessToken] = useState<string | null>(() => getWorkspaceAccessToken());
  const [wsUser, setWsUser] = useState<FirebaseUser | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [files, setFiles] = useState<DriveSpreadsheetFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [metadata, setMetadata] = useState<SpreadsheetMetadata | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<string[][]>([]);

  const [dataset, setDataset] = useState<DatasetKey>('bookings');
  const [newSheetTitle, setNewSheetTitle] = useState(
    `PRO RIDER AI — Operations (${new Date().toISOString().slice(0, 10)})`
  );
  const [pendingConfirm, setPendingConfirm] = useState<PendingSheetMutation | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ message: string; url?: string } | null>(null);

  useEffect(() => {
    const unsub = initGoogleWorkspaceAuth(
      (u, tk) => {
        setWsUser(u);
        setAccessToken(tk);
        setNeedsAuth(false);
      },
      () => {
        setAccessToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsub();
  }, []);

  const loadFiles = async (tk: string) => {
    setBusy(true);
    setError(null);
    try {
      const list = await listUserSpreadsheets(tk);
      setFiles(list);
      if (list.length > 0 && !selectedFileId) {
        setSelectedFileId(list[0].id);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Unable to load spreadsheets';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (accessToken) {
      void loadFiles(accessToken);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !selectedFileId) {
      setMetadata(null);
      setSelectedTab('');
      setPreviewRows([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    getSpreadsheetMetadata(accessToken, selectedFileId)
      .then((meta) => {
        if (cancelled) return;
        setMetadata(meta);
        const firstTab = meta.sheetTitles[0] || '';
        setSelectedTab(firstTab);
      })
      .catch((err: any) => {
        if (!cancelled) {
          const errMsg = err?.message || 'Failed to load spreadsheet tabs';
          setError(errMsg);
          toast.error(errMsg);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedFileId]);

  useEffect(() => {
    if (!accessToken || !selectedFileId || !selectedTab) {
      setPreviewRows([]);
      return;
    }
    let cancelled = false;
    readSheetTabValues(accessToken, selectedFileId, selectedTab, 25)
      .then((vals) => {
        if (!cancelled) setPreviewRows(vals);
      })
      .catch((err: any) => {
        if (!cancelled) {
          const errMsg = err?.message || 'Failed to read tab rows';
          setError(errMsg);
          toast.error(errMsg);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, selectedFileId, selectedTab]);

  const buildRowsForDataset = (key: DatasetKey): Array<Array<string | number>> => {
    if (key === 'bookings') {
      return [
        ['Booking ID', 'Mode', 'Service', 'Status', 'Passenger', 'Pickup', 'Dropoff', 'Distance (km)', 'Fare (PKR)', 'Date', 'Time'],
        ...bookings.map((b) => [
          b.id,
          b.booking_mode,
          b.service_type,
          b.status,
          b.passenger_name || b.passenger_display || '',
          b.pickup_address,
          b.dropoff_address,
          Number(b.distance_km || 0),
          Number(b.total_bill_pkr || b.proposed_fare_pkr || 0),
          b.pickup_date || '',
          b.pickup_time || '',
        ]),
      ];
    }
    if (key === 'finance') {
      return [
        ['Txn ID', 'User ID', 'Role', 'Type', 'Amount (PKR)', 'Method', 'Status', 'Reference', 'Description', 'Created At'],
        ...transactions.map((t) => [
          t.id,
          t.user_id || '',
          t.role || '',
          t.type,
          Number(t.amount_pkr || 0),
          t.payment_method || '',
          t.status,
          t.tx_ref || '',
          t.description || '',
          t.created_at || '',
        ]),
      ];
    }
    return [
      ['Partner ID', 'Full Name', 'Phone', 'City', 'Vehicle', 'Plate', 'Status', 'Wallet (PKR)'],
      ...partners.map((p) => [
        p.user_id,
        p.full_name || '',
        p.phone || '',
        p.operating_city || '',
        p.vehicle_name || '',
        p.vehicle_number || '',
        p.verification_status || '',
        Number(p.wallet_balance_pkr || 0),
      ]),
    ];
  };

  const handleGoogleLogin = async () => {
    setAuthBusy(true);
    setError(null);
    try {
      const { user, accessToken: tk } = await signInForGoogleSheets();
      setWsUser(user);
      setAccessToken(tk);
      setNeedsAuth(false);
      toast.success(tr(lang, 'Connected to Google Sheets.', 'گوگل شیٹس کامیابی سے منسلک ہو گیا۔'));
    } catch (err: any) {
      const errMsg = err?.message || 'Google sign-in failed.';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setAuthBusy(false);
    }
  };

  const requestCreateSpreadsheet = () => {
    const rows = buildRowsForDataset(dataset);
    const tabName =
      dataset === 'bookings' ? 'Bookings' : dataset === 'finance' ? 'Finance_Ledger' : 'Pro_Partners';
    setPendingConfirm({
      kind: 'create',
      dataset,
      title: newSheetTitle.trim() || `PRO RIDER AI Export (${new Date().toISOString().slice(0, 10)})`,
      tabName,
      rows,
    });
  };

  const requestUpdateSelectedTab = () => {
    if (!selectedFileId || !selectedTab || !metadata) return;
    const rows = buildRowsForDataset(dataset);
    setPendingConfirm({
      kind: 'update',
      dataset,
      title: metadata.title,
      tabName: selectedTab,
      spreadsheetId: selectedFileId,
      rows,
    });
  };

  const executeConfirmedMutation = async () => {
    if (!pendingConfirm || !accessToken) {
      setNeedsAuth(true);
      setPendingConfirm(null);
      return;
    }
    const action = pendingConfirm;
    setPendingConfirm(null);
    setBusy(true);
    setError(null);
    setSuccessInfo(null);
    try {
      if (action.kind === 'create') {
        const res = await createSpreadsheetWithRows(
          accessToken,
          action.title,
          action.tabName,
          action.rows
        );
        const successMsg = tr(
          lang,
          `Created "${action.title}" with ${Math.max(0, action.rows.length - 1)} data row(s).`,
          `گوگل شیٹ "${action.title}" ${Math.max(0, action.rows.length - 1)} ریکارڈز کے ساتھ بنا دی گئی۔`
        );
        setSuccessInfo({
          message: successMsg,
          url: res.spreadsheetUrl,
        });
        toast.success(successMsg);
        await loadFiles(accessToken);
        setSelectedFileId(res.spreadsheetId);
      } else if (action.spreadsheetId) {
        await replaceSheetTabRows(
          accessToken,
          action.spreadsheetId,
          action.tabName,
          action.rows
        );
        const successMsg = tr(
          lang,
          `Updated tab "${action.tabName}" in "${action.title}" with ${Math.max(0, action.rows.length - 1)} data row(s).`,
          `"${action.title}" کے ٹیب "${action.tabName}" کو ${Math.max(0, action.rows.length - 1)} ریکارڈز سے اپ ڈیٹ کر دیا گیا۔`
        );
        setSuccessInfo({
          message: successMsg,
          url: `https://docs.google.com/spreadsheets/d/${action.spreadsheetId}/edit`,
        });
        toast.success(successMsg);
        const refreshed = await readSheetTabValues(accessToken, action.spreadsheetId, action.tabName, 25);
        setPreviewRows(refreshed);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Google Sheets sync failed';
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0D0D10] flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-[#D4A017]" />
            {tr(lang, 'Google Sheets Live Sync', 'گوگل شیٹس لائیو سنک')}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {tr(
              lang,
              'Read existing spreadsheets or export Bookings, Finance Ledger, and Pro Partners directly to Google Sheets.',
              'موجودہ گوگل شیٹس دیکھیں یا بکنگز، فنانس اور پارٹنر ڈیٹا براہ راست گوگل شیٹ میں محفوظ کریں۔'
            )}
          </p>
        </div>

        {!needsAuth && accessToken && (
          <div className="flex items-center gap-2">
            {wsUser?.email && (
              <span className="px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
                {wsUser.email}
              </span>
            )}
            <button
              type="button"
              onClick={() => signOutGoogleWorkspace()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-300 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              {tr(lang, 'Disconnect Google', 'گوگل منقطع کریں')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      {successInfo && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs font-semibold text-emerald-900 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            {successInfo.message}
          </span>
          {successInfo.url && (
            <a
              href={successInfo.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-bold hover:bg-emerald-800"
            >
              <span>{tr(lang, 'Open Sheet', 'شیٹ کھولیں')}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      )}

      {needsAuth || !accessToken ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#FAF6EC] border border-[#D4A017]/60 flex items-center justify-center mx-auto">
            <FileSpreadsheet className="w-7 h-7 text-[#9E730B]" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="font-display text-lg font-bold text-[#0D0D10]">
              {tr(lang, 'Connect Google Account for Sheets', 'گوگل شیٹس کے لیے گوگل اکاؤنٹ جوڑیں')}
            </h2>
            <p className="text-xs text-zinc-600">
              {tr(
                lang,
                'Sign in with Google to browse your Drive spreadsheets, inspect sheet tabs, and export operations reports with your permission.',
                'اپنی ڈرائیو کی اسپریڈ شیٹس دیکھنے اور ڈیٹا ایکسپورٹ کرنے کے لیے گوگل سے سائن ان کریں۔'
              )}
            </p>
          </div>
          <div className="flex justify-center">
            <button
              type="button"
              disabled={authBusy}
              onClick={handleGoogleLogin}
              className="gsi-material-button"
            >
              <div className="gsi-material-button-state" />
              <div className="gsi-material-button-content-wrapper">
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    <path fill="none" d="M0 0h48v48H0z" />
                  </svg>
                </div>
                <span className="gsi-material-button-contents">
                  {authBusy ? tr(lang, 'Connecting...', 'منسلک ہو رہا ہے...') : 'Sign in with Google'}
                </span>
              </div>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Export / Sync Controls */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-[#0D0D10]">
              {tr(lang, 'Export Operations Data', 'آپریشنز ڈیٹا ایکسپورٹ کریں')}
            </h2>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700 block">
                {tr(lang, 'Select Dataset', 'ڈیٹا سیٹ منتخب کریں')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'bookings' as DatasetKey, en: `Bookings (${bookings.length})`, ur: `بکنگز (${bookings.length})` },
                  { id: 'finance' as DatasetKey, en: `Finance (${transactions.length})`, ur: `فنانس (${transactions.length})` },
                  { id: 'partners' as DatasetKey, en: `Partners (${partners.length})`, ur: `پارٹنرز (${partners.length})` },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDataset(opt.id)}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition-all ${
                      dataset === opt.id
                        ? 'bg-[#0D0D10] border-[#D4A017] text-[#F4C430]'
                        : 'bg-zinc-50 border-zinc-200 text-[#0D0D10] hover:bg-zinc-100'
                    }`}
                  >
                    {tr(lang, opt.en, opt.ur)}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-100">
              <label className="text-xs font-semibold text-zinc-700 block">
                {tr(lang, 'Create New Google Sheet', 'نئی گوگل شیٹ بنائیں')}
              </label>
              <div className="flex gap-2">
                <input
                  value={newSheetTitle}
                  onChange={(e) => setNewSheetTitle(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-zinc-200 text-xs"
                  placeholder="Spreadsheet title..."
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={requestCreateSpreadsheet}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4A017] text-[#0D0D10] text-xs font-bold hover:bg-[#EAB308] shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {tr(lang, 'Create & Export', 'بنائیں')}
                </button>
              </div>
            </div>

            {selectedFileId && metadata && selectedTab && (
              <div className="space-y-2 pt-3 border-t border-zinc-100">
                <label className="text-xs font-semibold text-zinc-700 block">
                  {tr(lang, 'Sync Into Selected Existing Sheet Tab', 'موجودہ منتخب ٹیب میں اپ ڈیٹ کریں')}
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={requestUpdateSelectedTab}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0D0D10] text-[#F4C430] border border-[#D4A017]/60 text-xs font-bold flex items-center justify-center gap-2 hover:bg-zinc-900"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>
                    {tr(
                      lang,
                      `Overwrite "${metadata.title}" → "${selectedTab}"`,
                      `"${metadata.title}" → "${selectedTab}" اپ ڈیٹ کریں`
                    )}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Drive Spreadsheets Browser & Tab Preview */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-[#0D0D10] flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#9E730B]" />
                {tr(lang, 'Your Google Spreadsheets', 'آپ کی گوگل اسپریڈ شیٹس')}
              </h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => accessToken && loadFiles(accessToken)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                {tr(lang, 'Refresh', 'ریفریش')}
              </button>
            </div>

            {files.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                {tr(lang, 'No Google Spreadsheets found in your Drive.', 'آپ کی گوگل ڈرائیو میں کوئی شیٹ موجود نہیں۔')}
              </p>
            ) : (
              <div className="space-y-3">
                <select
                  value={selectedFileId}
                  onChange={(e) => setSelectedFileId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold bg-white"
                >
                  {files.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>

                {metadata && metadata.sheetTitles.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {metadata.sheetTitles.map((tabName) => (
                      <button
                        key={tabName}
                        type="button"
                        onClick={() => setSelectedTab(tabName)}
                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                          selectedTab === tabName
                            ? 'bg-[#0D0D10] text-[#F4C430] border-[#D4A017]'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                        }`}
                      >
                        {tabName}
                      </button>
                    ))}
                  </div>
                )}

                {previewRows.length > 0 && (
                  <div className="rounded-xl border border-zinc-200 overflow-x-auto max-h-60">
                    <table className="w-full text-left text-[11px]">
                      <tbody>
                        {previewRows.slice(0, 12).map((row, idx) => (
                          <tr
                            key={idx}
                            className={idx === 0 ? 'bg-zinc-100 font-bold text-[#0D0D10]' : 'border-t border-zinc-100'}
                          >
                            {row.slice(0, 8).map((cell, cIdx) => (
                              <td key={cIdx} className="px-2.5 py-1.5 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mandatory User Confirmation Dialog before Creating/Updating Google Sheets */}
      {pendingConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-300 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="font-display text-base font-bold text-[#0D0D10]">
                    {pendingConfirm.kind === 'create'
                      ? tr(lang, 'Confirm New Google Sheet', 'نئی گوگل شیٹ کی تصدیق کریں')
                      : tr(lang, 'Confirm Google Sheet Update', 'گوگل شیٹ اپ ڈیٹ کی تصدیق کریں')}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    {tr(lang, 'Review changes before writing to Google Sheets', 'گوگل شیٹ میں لکھنے سے پہلے تفصیل چیک کریں')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-3.5 text-xs space-y-1.5">
              <div>
                <span className="text-zinc-500">{tr(lang, 'Spreadsheet:', 'شیٹ کا نام:')}</span>{' '}
                <strong className="text-[#0D0D10]">{pendingConfirm.title}</strong>
              </div>
              <div>
                <span className="text-zinc-500">{tr(lang, 'Tab Name:', 'ٹیب کا نام:')}</span>{' '}
                <strong className="text-[#0D0D10]">{pendingConfirm.tabName}</strong>
              </div>
              <div>
                <span className="text-zinc-500">{tr(lang, 'Rows Affected:', 'کل ریکارڈز:')}</span>{' '}
                <strong className="text-[#0D0D10]">
                  {Math.max(0, pendingConfirm.rows.length - 1)} data row(s) (+1 header row)
                </strong>
              </div>
              {pendingConfirm.kind === 'update' && (
                <p className="text-[11px] text-amber-800 font-semibold pt-1">
                  {tr(
                    lang,
                    'This will replace existing contents in the selected sheet tab.',
                    'اس سے منتخب کردہ ٹیب کا موجودہ ڈیٹا تبدیل ہو جائے گا۔'
                  )}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                className="py-2.5 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {tr(lang, 'Cancel', 'منسوخ کریں')}
              </button>
              <button
                type="button"
                onClick={executeConfirmedMutation}
                className="py-2.5 rounded-xl bg-[#0D0D10] text-[#F4C430] border border-[#D4A017] text-xs font-bold hover:bg-zinc-900"
              >
                {tr(lang, 'Confirm & Sync', 'تصدیق کریں')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
