export type AppPermissionKey = 'location' | 'notifications' | 'microphone' | 'camera' | 'phone_call';

export type PermissionGrantState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export type PermissionsSnapshot = Record<AppPermissionKey, PermissionGrantState>;

const CALL_PERMISSION_STORAGE_KEY = 'pr_perm_phone_call_ready';
const PERMS_PROMPTED_STORAGE_KEY = 'pr_permissions_prompted_v1';

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

export function getCallPermissionReady(): PermissionGrantState {
  try {
    return localStorage.getItem(CALL_PERMISSION_STORAGE_KEY) === '1' ? 'granted' : 'prompt';
  } catch {
    return 'prompt';
  }
}

export async function queryAllAppPermissions(): Promise<PermissionsSnapshot> {
  const snapshot: PermissionsSnapshot = {
    location: typeof navigator !== 'undefined' && 'geolocation' in navigator ? 'prompt' : 'unsupported',
    notifications:
      typeof Notification !== 'undefined'
        ? (Notification.permission === 'default' ? 'prompt' : Notification.permission)
        : 'unsupported',
    microphone:
      typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? 'prompt'
        : 'unsupported',
    camera:
      typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
        ? 'prompt'
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
    if (geo) snapshot.location = geo;
    if (mic) snapshot.microphone = mic;
    if (cam) snapshot.camera = cam;
  }

  return snapshot;
}

export async function requestAppPermission(key: AppPermissionKey): Promise<PermissionGrantState> {
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
    if (typeof Notification === 'undefined') return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      return result === 'default' ? 'prompt' : result;
    } catch {
      return 'denied';
    }
  }

  if (key === 'microphone') {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
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
      return 'granted';
    } catch (err: any) {
      return err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError' ? 'denied' : 'prompt';
    }
  }

  // Phone / Direct Call dialer readiness (uses device tel: intent on click)
  try {
    localStorage.setItem(CALL_PERMISSION_STORAGE_KEY, '1');
  } catch {
    // ignore
  }
  return 'granted';
}
