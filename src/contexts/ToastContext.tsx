import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import { useTheme } from './ThemeContext';
import type { Language } from '../types';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  type?: ToastType;
  title?: string;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  durationMs: number;
  createdAt: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  show: (message: string, options?: ToastOptions) => string;
  success: (message: string, titleOrOpts?: string | Omit<ToastOptions, 'type'>) => string;
  error: (message: string, titleOrOpts?: string | Omit<ToastOptions, 'type'>) => string;
  info: (message: string, titleOrOpts?: string | Omit<ToastOptions, 'type'>) => string;
  warning: (message: string, titleOrOpts?: string | Omit<ToastOptions, 'type'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

type BusListener = (message: string, options?: ToastOptions) => void;
const busListeners = new Set<BusListener>();

export function notifyToast(message: string, options?: ToastOptions): void {
  if (!message?.trim()) return;
  busListeners.forEach((fn) => fn(message, options));
}

export function inferToastType(message: string): ToastType {
  const lower = String(message || '').toLowerCase();
  if (
    /\b(error|failed|fail|cannot|unable|invalid|rejected|denied|missing|expired)\b/.test(lower) ||
    /(خرابی|ناکام|نہیں ہو سکا|نہیں ہو سکی|غلط|مسترد)/.test(message)
  ) {
    return 'error';
  }
  if (
    /\b(warning|quota|limit|min rs|required|pending|paused|unavailable)\b/.test(lower) ||
    /(تنبیہ|کوٹہ|درکار|پینڈنگ|دستیاب نہیں)/.test(message)
  ) {
    return 'warning';
  }
  if (
    /\b(success|saved|updated|approved|confirmed|uploaded|removed|credited|applied|copied|shared|submitted|accepted|active|completed)\b/.test(
      lower
    ) ||
    /(کامیاب|کامیابی|محفوظ|اپڈیٹ|اپلوڈ|منظور|تصدیق|شامل|مکمل|قبول|لاگو)/.test(message)
  ) {
    return 'success';
  }
  return 'info';
}

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 4200,
  info: 4500,
  warning: 5500,
  error: 6500,
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{
  lang?: Language;
  children: React.ReactNode;
}> = ({ lang = 'en', children }) => {
  const { isDark } = useTheme();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clear = useCallback(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const scheduleDismiss = useCallback(
    (id: string, durationMs: number) => {
      if (durationMs <= 0) return;
      const existing = timersRef.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timerId = window.setTimeout(() => {
        dismiss(id);
      }, durationMs);
      timersRef.current.set(id, timerId);
    },
    [dismiss]
  );

  const pauseTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing) {
      window.clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (message: string, options: ToastOptions = {}): string => {
      const cleanMessage = String(message || '').trim();
      if (!cleanMessage) return '';
      const type = options.type ?? inferToastType(cleanMessage);
      const durationMs = options.durationMs ?? DEFAULT_DURATIONS[type];
      const now = Date.now();

      // Deduplicate identical messages raised within 1.2s
      let dedupedId: string | null = null;
      setToasts((prev) => {
        const duplicate = prev.find(
          (item) => item.type === type && item.message === cleanMessage && now - item.createdAt < 1200
        );
        if (duplicate) {
          dedupedId = duplicate.id;
          return prev;
        }
        const id = `toast-${now}-${Math.random().toString(36).slice(2, 7)}`;
        dedupedId = id;
        const nextItem: ToastItem = {
          id,
          type,
          title: options.title,
          message: cleanMessage,
          durationMs,
          createdAt: now,
          actionLabel: options.actionLabel,
          onAction: options.onAction,
        };
        const updated = [nextItem, ...prev];
        // Cap visible stack to 4 notifications cleanly
        if (updated.length > 4) {
          const removed = updated.slice(4);
          removed.forEach((r) => {
            const tId = timersRef.current.get(r.id);
            if (tId) {
              window.clearTimeout(tId);
              timersRef.current.delete(r.id);
            }
          });
          return updated.slice(0, 4);
        }
        return updated;
      });

      const targetId = dedupedId || `toast-${now}`;
      scheduleDismiss(targetId, durationMs);
      return targetId;
    },
    [scheduleDismiss]
  );

  useEffect(() => {
    const listener: BusListener = (msg, opts) => {
      show(msg, opts);
    };
    busListeners.add(listener);
    return () => {
      busListeners.delete(listener);
    };
  }, [show]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, []);

  const normalizeHelperArgs = (
    type: ToastType,
    titleOrOpts?: string | Omit<ToastOptions, 'type'>
  ): ToastOptions => {
    if (typeof titleOrOpts === 'string') {
      return { type, title: titleOrOpts };
    }
    return { ...(titleOrOpts || {}), type };
  };

  const value = useMemo<ToastContextValue>(
    () => ({
      toasts,
      show,
      success: (message, titleOrOpts) => show(message, normalizeHelperArgs('success', titleOrOpts)),
      error: (message, titleOrOpts) => show(message, normalizeHelperArgs('error', titleOrOpts)),
      info: (message, titleOrOpts) => show(message, normalizeHelperArgs('info', titleOrOpts)),
      warning: (message, titleOrOpts) => show(message, normalizeHelperArgs('warning', titleOrOpts)),
      dismiss,
      clear,
    }),
    [toasts, show, dismiss, clear]
  );

  const variantMeta: Record<
    ToastType,
    {
      defaultTitleEn: string;
      defaultTitleUr: string;
      Icon: React.FC<{ className?: string }>;
      containerLight: string;
      containerDark: string;
      iconWellLight: string;
      iconWellDark: string;
      titleLight: string;
      titleDark: string;
      progressClass: string;
    }
  > = {
    success: {
      defaultTitleEn: 'Success',
      defaultTitleUr: 'کامیابی',
      Icon: CheckCircle2,
      containerLight: 'bg-white border-emerald-300 text-[#0D0D10]',
      containerDark: 'bg-[#131419] border-emerald-500/45 text-zinc-100',
      iconWellLight: 'bg-emerald-100 text-emerald-700',
      iconWellDark: 'bg-emerald-500/20 text-emerald-400',
      titleLight: 'text-emerald-800',
      titleDark: 'text-emerald-400',
      progressClass: 'bg-emerald-500',
    },
    error: {
      defaultTitleEn: 'Action Failed',
      defaultTitleUr: 'خرابی',
      Icon: AlertCircle,
      containerLight: 'bg-white border-red-300 text-[#0D0D10]',
      containerDark: 'bg-[#131419] border-red-500/45 text-zinc-100',
      iconWellLight: 'bg-red-100 text-red-700',
      iconWellDark: 'bg-red-500/20 text-red-400',
      titleLight: 'text-red-800',
      titleDark: 'text-red-400',
      progressClass: 'bg-red-500',
    },
    warning: {
      defaultTitleEn: 'Notice',
      defaultTitleUr: 'توجہ',
      Icon: AlertTriangle,
      containerLight: 'bg-white border-[#D4A017]/65 text-[#0D0D10]',
      containerDark: 'bg-[#131419] border-[#D4A017]/55 text-zinc-100',
      iconWellLight: 'bg-amber-100 text-amber-800',
      iconWellDark: 'bg-amber-500/20 text-[#F4C430]',
      titleLight: 'text-[#8F6400]',
      titleDark: 'text-[#F4C430]',
      progressClass: 'bg-[#D4A017]',
    },
    info: {
      defaultTitleEn: 'Information',
      defaultTitleUr: 'اطلاع',
      Icon: Info,
      containerLight: 'bg-white border-blue-300 text-[#0D0D10]',
      containerDark: 'bg-[#131419] border-blue-400/45 text-zinc-100',
      iconWellLight: 'bg-blue-100 text-blue-700',
      iconWellDark: 'bg-blue-500/20 text-blue-300',
      titleLight: 'text-blue-800',
      titleDark: 'text-blue-300',
      progressClass: 'bg-blue-500',
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Centralized Toast Viewport */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          aria-label={lang === 'ur' ? 'اطلاعات' : 'Notifications'}
          className="pr-no-print fixed top-3 inset-x-3 sm:inset-x-auto sm:top-5 sm:end-5 z-[100] flex flex-col gap-2.5 sm:w-[390px] pointer-events-none"
        >
          {toasts.map((item) => {
            const meta = variantMeta[item.type];
            const Icon = meta.Icon;
            const resolvedTitle =
              item.title || (lang === 'ur' ? meta.defaultTitleUr : meta.defaultTitleEn);
            const isUrgent = item.type === 'error' || item.type === 'warning';

            return (
              <div
                key={item.id}
                role={isUrgent ? 'alert' : 'status'}
                onMouseEnter={() => pauseTimer(item.id)}
                onMouseLeave={() => scheduleDismiss(item.id, 2200)}
                onFocus={() => pauseTimer(item.id)}
                className={`pointer-events-auto relative overflow-hidden rounded-2xl border shadow-[0_14px_34px_-10px_rgba(0,0,0,0.32)] p-3.5 transition-all duration-200 animate-in fade-in slide-in-from-top-2 ${
                  isDark ? meta.containerDark : meta.containerLight
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      isDark ? meta.iconWellDark : meta.iconWellLight
                    }`}
                  >
                    <Icon className="w-4.5 h-4.5" />
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5">
                    <div
                      className={`text-[11px] font-extrabold uppercase tracking-wider leading-none ${
                        isDark ? meta.titleDark : meta.titleLight
                      }`}
                    >
                      {resolvedTitle}
                    </div>
                    <p
                      dir="auto"
                      className={`text-xs font-semibold leading-snug mt-1 break-words ${
                        isDark ? 'text-zinc-100' : 'text-[#0D0D10]'
                      }`}
                    >
                      {item.message}
                    </p>
                    {item.actionLabel && item.onAction && (
                      <button
                        type="button"
                        onClick={() => {
                          item.onAction?.();
                          dismiss(item.id);
                        }}
                        className="mt-2 inline-flex items-center px-2.5 py-1 rounded-lg bg-[#D4A017] text-[#0D0D10] text-[11px] font-bold hover:bg-[#EAB308]"
                      >
                        {item.actionLabel}
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    aria-label={lang === 'ur' ? 'اطلاع بند کریں' : 'Dismiss notification'}
                    className={`p-1 rounded-lg shrink-0 transition-colors ${
                      isDark
                        ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        : 'text-zinc-500 hover:text-[#0D0D10] hover:bg-zinc-100'
                    }`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Subtle bottom accent progress rule */}
                <div className={`absolute inset-x-0 bottom-0 h-[3px] opacity-85 ${meta.progressClass}`} />
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Graceful fallback if rendered outside ToastProvider (e.g. standalone error boundary)
    return {
      toasts: [],
      show: (message, options) => {
        notifyToast(message, options);
        return '';
      },
      success: (message, titleOrOpts) => {
        const opts = typeof titleOrOpts === 'string' ? { title: titleOrOpts } : titleOrOpts;
        notifyToast(message, { ...opts, type: 'success' });
        return '';
      },
      error: (message, titleOrOpts) => {
        const opts = typeof titleOrOpts === 'string' ? { title: titleOrOpts } : titleOrOpts;
        notifyToast(message, { ...opts, type: 'error' });
        return '';
      },
      info: (message, titleOrOpts) => {
        const opts = typeof titleOrOpts === 'string' ? { title: titleOrOpts } : titleOrOpts;
        notifyToast(message, { ...opts, type: 'info' });
        return '';
      },
      warning: (message, titleOrOpts) => {
        const opts = typeof titleOrOpts === 'string' ? { title: titleOrOpts } : titleOrOpts;
        notifyToast(message, { ...opts, type: 'warning' });
        return '';
      },
      dismiss: () => {},
      clear: () => {},
    };
  }
  return ctx;
}
