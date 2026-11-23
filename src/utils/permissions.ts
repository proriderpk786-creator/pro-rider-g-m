import { getSavedRideBellSound, playRideBell, saveRideBellSound, type RideBellSoundId } from './rideBell';

export type AppPermissionKey =
  | 'location'
  | 'notifications'
  | 'ride_bell'
  | 'camera'
  | 'microphone'
  | 'phone_call';

export type PermissionGrantState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export type PermissionsSnapshot = Record<AppPermissionKey, PermissionGrantState>;

const CALL_PERMISSION_STORAGE_KEY = 'pr_perm_phone_call_ready';
const INAPP_NOTIF_STORAGE_KEY = 'pr_perm_inapp_notif_ready';
const CAMERA_GRANTED_HINT_KEY = 'pr_perm_camera_ready';
const MIC_GRANTED_HINT_KEY = 'pr_perm_mic_ready';
const PERMS_PROMPTED_STORAGE_KEY = 'pr_permissions_prompted_v1';
const USER_DISABLED_PREFIX = 'pr_perm_user_disabled_';
const LAST_ACTIVE_BELL_PREFIX = 'pr_last_active_bell_';

export function isEmbeddedIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

export function hasPromptedPermissionsBefore(): boolean {
  try {
    return localStorage.getItem(PERMS_PROMPTED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPermissionsPrompted(): void {
  try {
    localStorage.setItem(PERMS_PROMPTED_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export function isPermissionUserDisabled(key: AppPermissionKey): boolean {
  try {
    return localStorage.getItem(`${USER_DISABLED_PREFIX}${key}`) === '1';
  } catch {
    return false;
  }
}

function setPermissionUserDisabled(key: AppPermissionKey, disabled: boolean): void {
  try {
    if (disabled) {
      localStorage.setItem(`${USER_DISABLED_PREFIX}${key}`, '1');
    } else {
      localStorage.removeItem(`${USER_DISABLED_PREFIX}${key}`);
    }
  } catch {
    // ignore
  }
}

export function getCallPermissionReady(): PermissionGrantState {
  if (isPermissionUserDisabled('phone_call')) return 'prompt';
  try {
    return localStorage.getItem(CALL_PERMISSION_STORAGE_KEY) === '1' ? 'granted' : 'prompt';
  } catch {
    return 'prompt';
  }
}

export function isInAppNotificationsEnabled(): boolean {
  if (isPermissionUserDisabled('notifications')) return false;
  try {
    return localStorage.getItem(INAPP_NOTIF_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function enableInAppNotifications(): void {
  setPermissionUserDisabled('notifications', false);
  try {
    localStorage.setItem(INAPP_NOTIF_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
}

export async function queryAllAppPermissions(
  role: 'passenger' | 'partner' = 'passenger'
): Promise<PermissionsSnapshot> {
  const hasNotificationApi =
    typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined';

  let notifState: PermissionGrantState = hasNotificationApi
    ? Notification.permission === 'default'
      ? 'prompt'
      : (Notification.permission as PermissionGrantState)
    : isInAppNotificationsEnabled()
    ? 'granted'
    : 'prompt';

  if (notifState !== 'granted' && (isEmbeddedIframe() || isInAppNotificationsEnabled()) && isInAppNotificationsEnabled()) {
    notifState = 'granted';
  }
  if (isPermissionUserDisabled('notifications')) {
    notifState = 'prompt';
  }

  let cachedCam: PermissionGrantState = 'prompt';
  let cachedMic: PermissionGrantState = 'prompt';
  try {
    if (localStorage.getItem(CAMERA_GRANTED_HINT_KEY) === '1') cachedCam = 'granted';
    if (localStorage.getItem(MIC_GRANTED_HINT_KEY) === '1') cachedMic = 'granted';
  } catch {
    // ignore
  }

  const bellSound = getSavedRideBellSound(role);
  const bellState: PermissionGrantState =
    bellSound !== 'muted' && !isPermissionUserDisabled('ride_bell') ? 'granted' : 'prompt';

  const snapshot: PermissionsSnapshot = {
    location:
      typeof navigator !== 'undefined' && 'geolocation' in navigator
        ? isPermissionUserDisabled('location')
          ? 'prompt'
          : 'prompt'
        : 'unsupported',
    notifications: notifState,
    ride_bell: bellState,
    microphone:
      typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? cachedMic
        : 'unsupported',
    camera:
      typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? cachedCam
        : 'unsupported',
    phone_call: getCallPermissionReady(),
  };

  if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
    const queryOne = async (name: string): Promise<PermissionGrantState | null> => {
      try {
        const res = await navigator.permissions.query({ name: name as PermissionName });
        return res.state as PermissionGrantState;
      } catch {
        return null;
      }
    };

    const [geo, mic, cam] = await Promise.all([
      queryOne('geolocation'),
      queryOne('microphone'),
      queryOne('camera'),
    ]);
    if (geo) snapshot.location = isPermissionUserDisabled('location') ? 'prompt' : geo;
    if (mic) snapshot.microphone = isPermissionUserDisabled('microphone') ? 'prompt' : mic;
    if (cam) snapshot.camera = isPermissionUserDisabled('camera') ? 'prompt' : cam;
  }

  if (isPermissionUserDisabled('camera') && snapshot.camera !== 'unsupported') {
    snapshot.camera = 'prompt';
  }
  if (isPermissionUserDisabled('microphone') && snapshot.microphone !== 'unsupported') {
    snapshot.microphone = 'prompt';
  }

  return snapshot;
}

export async function requestAppPermission(
  key: AppPermissionKey,
  role: 'passenger' | 'partner' = 'passenger'
): Promise<PermissionGrantState> {
  setPermissionUserDisabled(key, false);

  if (key === 'ride_bell') {
    let restoreTone: RideBellSoundId = role === 'passenger' ? 'soft_gold' : 'classic_bell';
    try {
      const savedLast = localStorage.getItem(`${LAST_ACTIVE_BELL_PREFIX}${role}`);
      if (savedLast === 'classic_bell' || savedLast === 'urgent_dispatch' || savedLast === 'soft_gold') {
        restoreTone = savedLast;
      }
    } catch {
      // ignore
    }
    saveRideBellSound(restoreTone, role);
    playRideBell(restoreTone);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pr:bell-updated', { detail: { role, sound: restoreTone } }));
    }
    return 'granted';
  }

  if (key === 'location') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => resolve(err.code === err.PERMISSION_DENIED ? 'denied' : 'prompt'),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  if (key === 'notifications') {
    enableInAppNotifications();
    const hasNotificationApi =
      typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined';
    if (!hasNotificationApi) {
      return 'granted';
    }
    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        return 'granted';
      }
      if (isEmbeddedIframe()) {
        return 'granted';
      }
      return result === 'default' ? 'prompt' : 'denied';
    } catch {
      return isEmbeddedIframe() ? 'granted' : 'denied';
    }
  }

  if (key === 'microphone') {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      try {
        localStorage.setItem(MIC_GRANTED_HINT_KEY, '1');
      } catch {}
      return 'granted';
    } catch (err: any) {
      return err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' ? 'denied' : 'prompt';
    }
  }

  if (key === 'camera') {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((tr) => tr.stop());
      try {
        localStorage.setItem(CAMERA_GRANTED_HINT_KEY, '1');
      } catch {}
      return 'granted';
    } catch (err: any) {
      return err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' ? 'denied' : 'prompt';
    }
  }

  try {
    localStorage.setItem(CALL_PERMISSION_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
  return 'granted';
}

export async function toggleAppPermission(
  key: AppPermissionKey,
  enabled: boolean,
  role: 'passenger' | 'partner' = 'passenger'
): Promise<PermissionGrantState> {
  if (!enabled) {
    setPermissionUserDisabled(key, true);
    if (key === 'ride_bell') {
      const current = getSavedRideBellSound(role);
      if (current !== 'muted') {
        try {
          localStorage.setItem(`${LAST_ACTIVE_BELL_PREFIX}${role}`, current);
        } catch {
          // ignore
        }
      }
      saveRideBellSound('muted', role);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pr:bell-updated', { detail: { role, sound: 'muted' } }));
      }
    } else if (key === 'notifications') {
      try {
        localStorage.removeItem(INAPP_NOTIF_STORAGE_KEY);
      } catch {
        // ignore
      }
    } else if (key === 'phone_call') {
      try {
        localStorage.removeItem(CALL_PERMISSION_STORAGE_KEY);
      } catch {
        // ignore
      }
    } else if (key === 'camera') {
      try {
        localStorage.removeItem(CAMERA_GRANTED_HINT_KEY);
      } catch {
        // ignore
      }
    } else if (key === 'microphone') {
      try {
        localStorage.removeItem(MIC_GRANTED_HINT_KEY);
      } catch {
        // ignore
      }
    }
    return 'prompt';
  }

  return requestAppPermission(key, role);
}
