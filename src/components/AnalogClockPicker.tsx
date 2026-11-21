import React, { useState } from 'react';
import { Keyboard, X } from 'lucide-react';

interface AnalogClockPickerProps {
  value: string; // e.g. "09:15 AM" or "18:00" or "1:58 PM"
  onChange: (formattedTime: string) => void;
  onClose: () => void;
}

export const AnalogClockPicker: React.FC<AnalogClockPickerProps> = ({ value, onChange, onClose }) => {
  // Parse initial value
  const parseTime = (val: string) => {
    let raw = val.trim();
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
    const minute = !Number.isNaN(parts[1]) ? parts[1] : 15;

    // Normalize 24h format if present
    if (hour > 12) {
      hour = hour - 12;
      ampm = 'PM';
    } else if (hour === 0) {
      hour = 12;
    }

    return { hour, minute, ampm };
  };

  const parsed = parseTime(value || '9:15 AM');
  const [selectedHour, setSelectedHour] = useState<number>(parsed.hour);
  const [selectedMinute, setSelectedMinute] = useState<number>(parsed.minute);
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed.ampm);
  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [manualMode, setManualMode] = useState(false);

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const handleSet = () => {
    const formattedHour = selectedHour;
    const formattedMinute = String(selectedMinute).padStart(2, '0');
    const result = `${formattedHour}:${formattedMinute} ${period}`;
    onChange(result);
    onClose();
  };

  const handleClear = () => {
    setSelectedHour(9);
    setSelectedMinute(0);
    setPeriod('AM');
  };

  // Center is (125, 125) in 250x250 circle
  const radius = 86;
  const center = 125;

  const getPosition = (index: number, total: number) => {
    // index 0 is 12 o'clock, which is -90 degrees
    const angle = ((index * (360 / total) - 90) * Math.PI) / 180;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { x, y, angle };
  };

  const currentSelectionAngle = () => {
    if (mode === 'hour') {
      const hIndex = selectedHour === 12 ? 0 : selectedHour;
      return ((hIndex * 30 - 90) * Math.PI) / 180;
    } else {
      return ((selectedMinute * 6 - 90) * Math.PI) / 180;
    }
  };

  const pointerAngle = currentSelectionAngle();
  const pointerX = center + radius * Math.cos(pointerAngle);
  const pointerY = center + radius * Math.sin(pointerAngle);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xs rounded-3xl bg-white shadow-2xl overflow-hidden border border-zinc-200 animate-in fade-in zoom-in-95">
        {/* Top Purple Banner (exact match to screenshot 4) */}
        <div className="bg-[#5E35B1] text-white p-6 flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <button
              type="button"
              onClick={() => setMode('hour')}
              className={`text-4xl font-bold font-mono transition-opacity ${
                mode === 'hour' ? 'opacity-100 underline decoration-2 underline-offset-4' : 'opacity-70 hover:opacity-90'
              }`}
            >
              {selectedHour}
            </button>
            <span className="text-3xl font-bold font-mono opacity-80">:</span>
            <button
              type="button"
              onClick={() => setMode('minute')}
              className={`text-4xl font-bold font-mono transition-opacity ${
                mode === 'minute' ? 'opacity-100 underline decoration-2 underline-offset-4' : 'opacity-70 hover:opacity-90'
              }`}
            >
              {String(selectedMinute).padStart(2, '0')}
            </button>
          </div>

          {/* AM / PM Toggle */}
          <div className="flex flex-col gap-1 text-xs font-bold font-mono tracking-wider ml-4">
            <button
              type="button"
              onClick={() => setPeriod('AM')}
              className={`px-2 py-1 rounded transition-colors ${
                period === 'AM' ? 'bg-white text-[#5E35B1]' : 'text-white/70 hover:text-white'
              }`}
            >
              AM
            </button>
            <button
              type="button"
              onClick={() => setPeriod('PM')}
              className={`px-2 py-1 rounded transition-colors ${
                period === 'PM' ? 'bg-white text-[#5E35B1]' : 'text-white/70 hover:text-white'
              }`}
            >
              PM
            </button>
          </div>
        </div>

        {/* Clock Dial Face */}
        <div className="p-6 flex flex-col items-center justify-center bg-white">
          {!manualMode ? (
            <div className="relative w-[250px] h-[250px] rounded-full bg-[#ECEFF1] flex items-center justify-center select-none shadow-inner">
              {/* Dial SVG for pointer and center dot */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 250 250">
                {/* Center dot */}
                <circle cx={center} cy={center} r={4} fill="#5E35B1" />
                {/* Pointer Line */}
                <line
                  x1={center}
                  y1={center}
                  x2={pointerX}
                  y2={pointerY}
                  stroke="#5E35B1"
                  strokeWidth="2.5"
                />
                {/* Selected Node Circle */}
                <circle cx={pointerX} cy={pointerY} r={18} fill="#5E35B1" />
              </svg>

              {/* Number items positioned along the dial */}
              {mode === 'hour'
                ? hours.map((h, i) => {
                    const pos = getPosition(i, 12);
                    const isSelected = selectedHour === h;
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => {
                          setSelectedHour(h);
                          setMode('minute'); // smooth auto-advance to minute
                        }}
                        style={{
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold font-mono transition-transform hover:scale-110 ${
                          isSelected ? 'text-white font-bold' : 'text-zinc-800'
                        }`}
                      >
                        {h}
                      </button>
                    );
                  })
                : minutes.map((m, i) => {
                    const pos = getPosition(i, 12);
                    const isSelected = Math.abs(selectedMinute - m) < 2.5;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedMinute(m)}
                        style={{
                          left: `${pos.x}px`,
                          top: `${pos.y}px`,
                          transform: 'translate(-50%, -50%)',
                        }}
                        className={`absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold font-mono transition-transform hover:scale-110 ${
                          isSelected ? 'text-white font-bold' : 'text-zinc-800'
                        }`}
                      >
                        {String(m).padStart(2, '0')}
                      </button>
                    );
                  })}
            </div>
          ) : (
            <div className="py-8 space-y-4 w-full">
              <div className="text-center">
                <label className="block text-xs font-semibold text-zinc-600 mb-2">Manual Time Entry</label>
                <div className="flex items-center justify-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={selectedHour}
                    onChange={(e) => setSelectedHour(Math.min(12, Math.max(1, Number(e.target.value))))}
                    className="w-16 p-2 text-center text-xl font-mono font-bold border border-zinc-300 rounded-xl"
                  />
                  <span className="text-xl font-bold">:</span>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={selectedMinute}
                    onChange={(e) => setSelectedMinute(Math.min(59, Math.max(0, Number(e.target.value))))}
                    className="w-16 p-2 text-center text-xl font-mono font-bold border border-zinc-300 rounded-xl"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions Bar (matching screenshot 4: Keyboard icon, Clear, Cancel, Set) */}
        <div className="px-5 py-4 border-t border-zinc-100 flex items-center justify-between text-xs font-semibold">
          <button
            type="button"
            onClick={() => setManualMode(!manualMode)}
            className="p-2 text-zinc-500 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
            title="Toggle keyboard input"
          >
            <Keyboard className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSet}
              className="px-4 py-1.5 bg-[#5E35B1] text-white rounded-xl font-bold hover:bg-[#512DA8] shadow-sm transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
