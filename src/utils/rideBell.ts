export type RideBellSoundId = 'classic_bell' | 'urgent_dispatch' | 'soft_gold' | 'muted';

export interface RideBellOption {
  id: RideBellSoundId;
  labelEn: string;
  labelUr: string;
  descriptionEn: string;
}

export const RIDE_BELL_OPTIONS: RideBellOption[] = [
  {
    id: 'classic_bell',
    labelEn: 'Classic Bell',
    labelUr: 'کلاسک بیل',
    descriptionEn: 'Crisp dual-tone dispatch bell',
  },
  {
    id: 'urgent_dispatch',
    labelEn: 'Urgent Ring',
    labelUr: 'تیز ڈسپیچ رنگ',
    descriptionEn: 'Triple priority alert ring',
  },
  {
    id: 'soft_gold',
    labelEn: 'Soft Chime',
    labelUr: 'نرم گولڈ ٹون',
    descriptionEn: 'Warm melodic chime',
  },
  {
    id: 'muted',
    labelEn: 'Muted',
    labelUr: 'سائلنٹ',
    descriptionEn: 'Visual banner only',
  },
];

const PARTNER_BELL_STORAGE_KEY = 'pr_partner_bell_sound';
const PASSENGER_BELL_STORAGE_KEY = 'pr_passenger_bell_sound';

export function getSavedRideBellSound(role: 'passenger' | 'partner' = 'partner'): RideBellSoundId {
  const key = role === 'passenger' ? PASSENGER_BELL_STORAGE_KEY : PARTNER_BELL_STORAGE_KEY;
  try {
    const val = localStorage.getItem(key);
    if (val === 'classic_bell' || val === 'urgent_dispatch' || val === 'soft_gold' || val === 'muted') {
      return val;
    }
  } catch {
    // ignore storage restrictions
  }
  return role === 'passenger' ? 'soft_gold' : 'classic_bell';
}

export function saveRideBellSound(sound: RideBellSoundId, role: 'passenger' | 'partner' = 'partner'): void {
  const key = role === 'passenger' ? PASSENGER_BELL_STORAGE_KEY : PARTNER_BELL_STORAGE_KEY;
  try {
    localStorage.setItem(key, sound);
  } catch {
    // ignore
  }
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    sharedAudioCtx = new Ctx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = 'sine',
  peakGain = 0.22
) {
  const start = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playRideBell(overrideSound?: RideBellSoundId): boolean {
  const sound = overrideSound ?? getSavedRideBellSound();
  if (sound === 'muted') return false;
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (sound === 'classic_bell') {
      // Crisp taxi dispatch Ding-Dong (E5 -> B5) repeated twice
      playTone(ctx, 659.25, 0.0, 0.28, 'triangle', 0.24);
      playTone(ctx, 987.77, 0.16, 0.42, 'sine', 0.26);
      playTone(ctx, 659.25, 0.62, 0.24, 'triangle', 0.2);
      playTone(ctx, 987.77, 0.78, 0.45, 'sine', 0.22);
    } else if (sound === 'urgent_dispatch') {
      // High-attention triple dispatch ring
      for (let i = 0; i < 3; i++) {
        const offset = i * 0.34;
        playTone(ctx, 880, offset, 0.12, 'triangle', 0.25);
        playTone(ctx, 1174.66, offset + 0.1, 0.18, 'triangle', 0.25);
      }
    } else if (sound === 'soft_gold') {
      // Smooth warm ascending chord chime (C5 - E5 - G5 - C6)
      playTone(ctx, 523.25, 0.0, 0.35, 'sine', 0.18);
      playTone(ctx, 659.25, 0.11, 0.38, 'sine', 0.18);
      playTone(ctx, 783.99, 0.22, 0.42, 'sine', 0.18);
      playTone(ctx, 1046.5, 0.34, 0.55, 'sine', 0.2);
    }
    return true;
  } catch {
    return false;
  }
}

export function sendRideBrowserNotification(title: string, body: string): void {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      void navigator.serviceWorker.ready
        .then((reg) =>
          reg.showNotification(title, {
            body,
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: 'prorider-incoming-ride',
          })
        )
        .catch(() => {
          new Notification(title, { body, icon: '/pwa-192x192.png' });
        });
    } else {
      new Notification(title, { body, icon: '/pwa-192x192.png' });
    }
  } catch {
    // ignore browser notification restrictions in iframes
  }
}
