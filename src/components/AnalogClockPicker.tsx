import React, { useRef, useState } from 'react';
import { Check, Keyboard, X } from 'lucide-react';
import { tr } from '../i18n/translations';
import type { Language } from '../types';

interface AnalogClockPickerProps {
  value: string; // e.g. "9:15 AM" or ""
  title?: string;
  lang?: Language;
  onChange: (formattedTime: string) => void;
  onClose: () => void;
}

export const AnalogClockPicker: React.FC<AnalogClockPickerProps> = ({
  value,
  title,
  lang = 'en',
  onChange,
  onClose,
}) => {
  const parseTime = (val: string) => {
    let raw = (val || '').trim();
    if (!raw) {
      return { hour: 9, minute: 0, ampm: 'AM' as const };
    }
    let ampm: 'AM' | 'PM' = 'AM';
    if (raw.toUpperCase().includes('PM')) {
      ampm = 'PM';
      raw = raw.replace(/PM/i, '').trim();
    } else if (raw.toUpperCase().includes('AM')) {
      ampm = 'AM';
      raw = raw.replace(/AM/i, '').trim();
    }

    const parts = raw.split(':').map((p) => Number.parseInt(p, 10));
    let hour = !Number.isNaN(parts[0]) ? parts[0] : 9;
    const minute = !Number.isNaN(parts[1]) ? Math.min(59, Math.max(0, parts[1])) : 0;

    if (hour > 12) {
      hour = hour - 12;
      ampm = 'PM';
    } else if (hour === 0) {
      hour = 12;
    }

    return { hour: Math.min(12, Math.max(1, hour)), minute, ampm };
  };

  const parsed = parseTime(value);
  const [selectedHour, setSelectedHour] = useState<number>(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState<number>(parsed.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.ampm);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [manualMode, setManualMode] = useState(false);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const handleSet = () => {
    const formattedMinute = String(selectedMinute).padStart(2, '0');
    onChange(`${selectedHour}:${formattedMinute} ${period}`);
    onClose();
  };

  const handleClear = () => {
    setSelectedHour(9);
    setSelectedMinute(0);
    setPeriod('AM');
    setMode('hour');
  };

  // Dial geometry: 256x256
  const dialSize = 256;
  const center = dialSize / 2;
  const radius = 92;

  const getPosition = (index: number, total: number, r = radius) => {
    const angle = ((index * (360 / total) - 90) * Math.PI) / 180;
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    };
  };

  const currentSelectionAngle = () => {
    if (mode === 'hour') {
      const hIndex = selectedHour === 12 ? 0 : selectedHour;
      return ((hIndex * 30 - 90) * Math.PI) / 180;
    }
    return ((selectedMinute * 6 - 90) * Math.PI) / 180;
  };

  const pointerAngle = currentSelectionAngle();
  const pointerX = center + radius * Math.cos(pointerAngle);
  const pointerY = center + radius * Math.sin(pointerAngle);

  const updateFromPointer = (clientX: number, clientY: number, commitHourAdvance: boolean) => {
    const rect = dialRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    // Angle where 12 o'clock is 0 deg, clockwise 0..360
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;

    if (mode === 'hour') {
      const idx = Math.round(deg / 30) % 12;
      const h = idx === 0 ? 12 : idx;
      setSelectedHour(h);
      if (commitHourAdvance) {
        setMode('minute');
      }
    } else {
      const m = Math.round(deg / 6) % 60;
      setSelectedMinute(m);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9995] bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="pr-preserve-light w-full max-w-[340px] rounded-3xl shadow-2xl overflow-hidden border-2 border-[#D4A017]/60"
        style={{ backgroundColor: '#FFFFFF', color: '#0D0D10' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Obsidian & Gold Header */}
        <div
          className="px-5 py-4 flex flex-col gap-3"
          style={{ backgroundColor: '#0D0D10', color: '#FFFFFF' }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: '#F4C430' }}>
              {title || tr(lang, 'Select Time', 'وقت منتخب کریں')}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr(lang, 'Close clock', 'گھڑی بند کریں')}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
              style={{ color: '#D4D4D8', backgroundColor: 'rgba(255,255,255,0.08)' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-1 font-mono tabular-nums">
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setMode('hour');
                }}
                className="px-2.5 py-1 rounded-xl text-4xl font-extrabold transition-all"
                style={{
                  backgroundColor: !manualMode && mode === 'hour' ? 'rgba(244, 196, 48, 0.18)' : 'transparent',
                  color: !manualMode && mode === 'hour' ? '#F4C430' : '#E4E4E7',
                  border: !manualMode && mode === 'hour' ? '1px solid rgba(244, 196, 48, 0.5)' : '1px solid transparent',
                }}
              >
                {selectedHour}
              </button>
              <span className="text-3xl font-bold" style={{ color: '#A1A1AA' }}>
                :
              </span>
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setMode('minute');
                }}
                className="px-2.5 py-1 rounded-xl text-4xl font-extrabold transition-all"
                style={{
                  backgroundColor: !manualMode && mode === 'minute' ? 'rgba(244, 196, 48, 0.18)' : 'transparent',
                  color: !manualMode && mode === 'minute' ? '#F4C430' : '#E4E4E7',
                  border: !manualMode && mode === 'minute' ? '1px solid rgba(244, 196, 48, 0.5)' : '1px solid transparent',
                }}
              >
                {String(selectedMinute).padStart(2, '0')}
              </button>
            </div>

            {/* AM / PM Toggle */}
            <div
              className="flex flex-col gap-1 p-1 rounded-xl font-mono text-xs font-extrabold"
              style={{ backgroundColor: '#18181D', border: '1px solid rgba(212, 160, 23, 0.35)' }}
            >
              {(['AM', 'PM'] as const).map((p) => {
                const active = period === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className="px-3 py-1 rounded-lg transition-all"
                    style={{
                      backgroundColor: active ? '#F4C430' : 'transparent',
                      color: active ? '#0D0D10' : '#D4D4D8',
                    }}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {!manualMode && (
            <div className="flex items-center justify-between text-[11px]" style={{ color: '#A1A1AA' }}>
              <span>
                {mode === 'hour'
                  ? tr(lang, 'Step 1: Tap hour on dial', 'مرحلہ 1: گھنٹہ منتخب کریں')
                  : tr(lang, 'Step 2: Tap or drag minutes', 'مرحلہ 2: منٹ منتخب کریں')}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode('hour')}
                  className="px-2 py-0.5 rounded-md font-semibold"
                  style={{
                    backgroundColor: mode === 'hour' ? '#F4C430' : 'rgba(255,255,255,0.08)',
                    color: mode === 'hour' ? '#0D0D10' : '#D4D4D8',
                  }}
                >
                  {tr(lang, 'Hr', 'گھنٹہ')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('minute')}
                  className="px-2 py-0.5 rounded-md font-semibold"
                  style={{
                    backgroundColor: mode === 'minute' ? '#F4C430' : 'rgba(255,255,255,0.08)',
                    color: mode === 'minute' ? '#0D0D10' : '#D4D4D8',
                  }}
                >
                  {tr(lang, 'Min', 'منٹ')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Clock Dial Face (High-contrast light ivory dial immune to dark mode overrides) */}
        <div className="p-5 flex flex-col items-center justify-center" style={{ backgroundColor: '#FFFFFF' }}>
          {!manualMode ? (
            <div
              ref={dialRef}
              onPointerDown={(e) => {
                isDraggingRef.current = true;
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                updateFromPointer(e.clientX, e.clientY, false);
              }}
              onPointerMove={(e) => {
                if (!isDraggingRef.current) return;
                updateFromPointer(e.clientX, e.clientY, false);
              }}
              onPointerUp={(e) => {
                if (!isDraggingRef.current) return;
                isDraggingRef.current = false;
                updateFromPointer(e.clientX, e.clientY, mode === 'hour');
              }}
              className="relative w-[256px] h-[256px] rounded-full flex items-center justify-center select-none touch-none cursor-pointer"
              style={{
                backgroundColor: '#F3F4F6',
                border: '2px solid #E4E4E7',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.06)',
              }}
            >
              {/* Tick marks + Pointer SVG */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${dialSize} ${dialSize}`}>
                {/* Subtle outer 12-hour tick marks */}
                {hours.map((_, i) => {
                  const p1 = getPosition(i, 12, 118);
                  const p2 = getPosition(i, 12, 123);
                  return (
                    <line
                      key={i}
                      x1={p1.x}
                      y1={p1.y}
                      x2={p2.x}
                      y2={p2.y}
                      stroke="#A1A1AA"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  );
                })}
                {/* Pointer Line */}
                <line
                  x1={center}
                  y1={center}
                  x2={pointerX}
                  y2={pointerY}
                  stroke="#D4A017"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Center Pivot */}
                <circle cx={center} cy={center} r={5} fill="#0D0D10" stroke="#F4C430" strokeWidth="2" />
                {/* Selected Value Node */}
                <circle cx={pointerX} cy={pointerY} r={19} fill="#0D0D10" stroke="#F4C430" strokeWidth="2.5" />
              </svg>

              {/* High-Contrast Dial Numerals */}
              {mode === 'hour'
                ? hours.map((h, i) => {
                    const pos = getPosition(i, 12);
                    const isSelected = selectedHour === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedHour(h);
                          setMode('minute');
                        }}
                        style={{
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          transform: 'translate(-50%, -50%)',
                          color: isSelected ? '#F4C430' : '#0D0D10',
                        }}
                        className="absolute w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold font-mono transition-transform hover:scale-110"
                      >
                        {h}
                      </button>
                    );
                  })
                : minutes.map((m, i) => {
                    const pos = getPosition(i, 12);
                    const isSelected = Math.abs(selectedMinute - m) < 2.5 || (m === 0 && selectedMinute >= 58);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMinute(m);
                        }}
                        style={{
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          transform: 'translate(-50%, -50%)',
                          color: isSelected ? '#F4C430' : '#0D0D10',
                        }}
                        className="absolute w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold font-mono transition-transform hover:scale-110"
                      >
                        {String(m).padStart(2, '0')}
                      </button>
                    );
                  })}
            </div>
          ) : (
            <div className="py-6 space-y-4 w-full">
              <div className="text-center">
                <label className="block text-xs font-bold mb-3" style={{ color: '#3F3F46' }}>
                  {tr(lang, 'Enter Exact Time', 'صحیح وقت درج کریں')}
                </label>
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={selectedHour}
                    onChange={(e) => setSelectedHour(Math.min(12, Math.max(1, Number(e.target.value) || 1)))}
                    className="pr-preserve-light w-18 p-2.5 text-center text-2xl font-mono font-bold rounded-xl border-2 focus:outline-none"
                    style={{ backgroundColor: '#F4F4F6', color: '#0D0D10', borderColor: '#D4A017' }}
                  />
                  <span className="text-2xl font-bold" style={{ color: '#0D0D10' }}>
                    :
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={selectedMinute}
                    onChange={(e) => setSelectedMinute(Math.min(59, Math.max(0, Number(e.target.value) || 0)))}
                    className="pr-preserve-light w-18 p-2.5 text-center text-2xl font-mono font-bold rounded-xl border-2 focus:outline-none"
                    style={{ backgroundColor: '#F4F4F6', color: '#0D0D10', borderColor: '#D4A017' }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions Bar */}
        <div
          className="px-4 py-3.5 flex items-center justify-between text-xs font-bold"
          style={{ backgroundColor: '#FAFAFA', borderTop: '1px solid #E4E4E7' }}
        >
          <button
            type="button"
            onClick={() => setManualMode(!manualMode)}
            className="p-2 rounded-xl transition-colors"
            style={{ color: manualMode ? '#0D0D10' : '#52525B', backgroundColor: manualMode ? '#F4C430' : '#F4F4F6' }}
            title={tr(lang, 'Toggle keyboard input', 'کی بورڈ سے وقت درج کریں')}
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-2 rounded-xl transition-colors"
              style={{ color: '#52525B', backgroundColor: '#F4F4F6' }}
            >
              {tr(lang, 'Reset', 'ری سیٹ')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl transition-colors"
              style={{ color: '#27272A', backgroundColor: '#E4E4E7' }}
            >
              {tr(lang, 'Cancel', 'منسوخ')}
            </button>
            <button
              type="button"
              onClick={handleSet}
              className="px-4 py-2 rounded-xl font-extrabold inline-flex items-center gap-1.5 shadow-sm transition-transform active:scale-95"
              style={{ backgroundColor: '#F4C430', color: '#0D0D10' }}
            >
              <Check className="w-3.5 h-3.5" />
              {tr(lang, 'Set Time', 'وقت طے کریں')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
