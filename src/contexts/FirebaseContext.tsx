import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  RecaptchaVerifier,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type ConfirmationResult,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  facebookProvider,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../firebase';
import type { Language } from '../types';

export interface SavedPlaceItem {
  id: string;
  uid: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  category: 'home' | 'work' | 'university' | 'favorite';
  placeId?: string;
}

export interface GroundedPlace {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface CloudAiThread {
  id: string;
  title: string;
  persona: 'passenger' | 'partner' | 'general';
  mode: 'fast' | 'general' | 'deep';
  lastMessagePreview?: string;
}

export interface CloudAiMessage {
  id: string;
  threadId: string;
  sender: 'user' | 'assistant';
  text: string;
  mode: 'fast' | 'general' | 'deep' | 'maps' | 'search' | 'voice';
  sources?: GroundedSource[];
  places?: GroundedPlace[];
}

export interface PartnerApplicationDocCloud {
  uid: string;
  docType: 'profile_photo' | 'cnic_front' | 'cnic_back' | 'driving_licence' | 'vehicle_registration' | 'vehicle_photo';
  fileName: string;
  fileDataUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  expiryDate?: string;
  reviewNotes?: string;
  isPublic?: boolean;
  uploadedAt?: any;
  updatedAt?: any;
}

export interface PartnerApplicationCloud {
  uid: string;
  fullName: string;
  email?: string;
  phone?: string;
  referencePhone?: string;
  cnicNumber?: string;
  cnicExpiry?: string;
  licenceNumber?: string;
  licenceExpiry?: string;
  vehicleCategoryId?: string;
  vehicleName?: string;
  vehicleNumber?: string;
  seatingCapacity?: number;
  fuelType?: string;
  operatingCity: string;
  serviceEligibility?: string[];
  verificationStatus: 'incomplete' | 'documents_pending' | 'under_review' | 'approved' | 'rejected' | 'suspended';
  adminNotes?: string;
  docsCount?: number;
  submittedAt?: any;
  createdAt?: any;
  updatedAt?: any;
  documents?: PartnerApplicationDocCloud[];
}

export function normalizePakistanPhoneE164(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]+/g, '').trim();
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('92')) return `+${cleaned}`;
  if (cleaned.startsWith('03')) return `+92${cleaned.slice(1)}`;
  if (cleaned.startsWith('3') && cleaned.length === 10) return `+92${cleaned}`;
  return `+92${cleaned.replace(/^0+/, '')}`;
}

export function formatFirebaseAuthError(err: unknown, providerName = 'Auth'): string {
  const code = String((err as any)?.code || '');
  const rawMessage = String((err as any)?.message || err || '');

  if (code === 'auth/unauthorized-domain') {
    return `${providerName} sign-in is completing security verification. Please use Email & Password or Quick Sign-in below. (براہ کرم نیچے ای میل اور پاس ورڈ استعمال کریں)`;
  }
  if (code === 'auth/operation-not-allowed') {
    console.warn(`[Auth] Provider ${providerName} is not enabled.`);
    return `${providerName} sign-in is currently unavailable. Please try another sign-in method. (یہ سائن اِن طریقہ فی الحال دستیاب نہیں ہے)`;
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with the same email using Google or Email sign-in. Please sign in with Google or Email instead. (یہ ای میل پہلے سے Google یا Email سے رجسٹرڈ ہے)';
  }
  if (code === 'auth/popup-blocked') {
    return 'Browser blocked the sign-in popup window. Please allow popups or try again.';
  }
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return `${providerName} sign-in window was closed before completing login.`;
  }
  if (code === 'auth/billing-not-enabled') {
    return 'SMS verification is temporarily unavailable. Please sign in with Google or Email. (ایس ایم ایس سروس فی الحال دستیاب نہیں، Google یا ای میل استعمال کریں)';
  }
  if (code === 'auth/invalid-phone-number') {
    return 'Please enter a valid Pakistan mobile number (e.g. 03125007782 or +923125007782).';
  }
  if (code === 'auth/invalid-verification-code') {
    return 'Incorrect 6-digit SMS verification code. Please check and try again.';
  }
  if (code === 'auth/code-expired') {
    return 'Verification code expired. Please request a new OTP code.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Please wait a few minutes before requesting another code.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'This email address is already registered. Please switch to Sign In instead.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. Please check your credentials or use Forgot Password.';
  }
  if (code === 'auth/weak-password') {
    return 'Password should be at least 6 characters long.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Network error while reaching authentication servers. Check internet connection.';
  }
  return rawMessage || `${providerName} sign-in failed.`;
}

interface FirebaseContextValue {
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  firestoreOnline: boolean;
  redirectAuthUser: FirebaseUser | null;
  redirectError: string | null;
  clearRedirectState: () => void;
  savedPlaces: SavedPlaceItem[];
  aiThreads: CloudAiThread[];
  signInWithGooglePopup: (role: 'passenger' | 'partner', city?: string, lang?: Language) => Promise<{ idToken: string; user: FirebaseUser }>;
  signInWithFacebookPopup: (role: 'passenger' | 'partner', city?: string, lang?: Language) => Promise<{ idToken: string; user: FirebaseUser }>;
  registerWithFirebaseEmail: (input: {
    fullName: string;
    email: string;
    password: string;
    role: 'passenger' | 'partner';
    city?: string;
    lang?: Language;
  }) => Promise<{ idToken: string; user: FirebaseUser; emailVerified: boolean }>;
  signInWithFirebaseEmail: (input: {
    email: string;
    password: string;
    role: 'passenger' | 'partner';
    city?: string;
    lang?: Language;
  }) => Promise<{ idToken: string; user: FirebaseUser; emailVerified: boolean }>;
  resendFirebaseEmailVerification: () => Promise<void>;
  reloadFirebaseUser: (role: 'passenger' | 'partner', city?: string, lang?: Language) => Promise<{ idToken: string; user: FirebaseUser; emailVerified: boolean } | null>;
  sendFirebasePasswordReset: (email: string) => Promise<void>;
  sendFirebasePhoneOtp: (rawPhone: string, recaptchaContainerId: string) => Promise<ConfirmationResult>;
  confirmFirebasePhoneOtp: (
    confirmation: ConfirmationResult,
    otpCode: string,
    role: 'passenger' | 'partner',
    city?: string,
    lang?: Language
  ) => Promise<{ idToken: string; user: FirebaseUser }>;
  signOutFirebase: () => Promise<void>;
  savePlace: (place: Omit<SavedPlaceItem, 'id' | 'uid'>) => Promise<void>;
  removeSavedPlace: (placeId: string) => Promise<void>;
  createAiThread: (persona: 'passenger' | 'partner' | 'general', mode: 'fast' | 'general' | 'deep', firstTitle: string) => Promise<string | null>;
  saveAiMessage: (threadId: string, msg: Omit<CloudAiMessage, 'id' | 'threadId'>) => Promise<void>;
  fetchThreadMessages: (threadId: string) => Promise<CloudAiMessage[]>;
  syncBookingSummary: (input: {
    bookingCode: string;
    bookingMode: 'go_now' | 'schedule';
    serviceType: 'pick_and_drop' | 'ride_sharing' | 'fuel_sharing';
    pickupAddress: string;
    dropoffAddress: string;
    distanceKm: number;
    farePkr: number;
    status: string;
  }) => Promise<void>;
  syncPartnerApplication: (input: {
    fullName: string;
    email?: string;
    phone?: string;
    referencePhone?: string;
    cnicNumber?: string;
    cnicExpiry?: string;
    licenceNumber?: string;
    licenceExpiry?: string;
    vehicleCategoryId?: string;
    vehicleName?: string;
    vehicleNumber?: string;
    seatingCapacity?: number;
    fuelType?: string;
    operatingCity: string;
    serviceEligibility?: string[];
    docsCount?: number;
    isSubmit?: boolean;
  }) => Promise<boolean>;
  syncPartnerDocument: (input: {
    docType: PartnerApplicationDocCloud['docType'];
    fileName: string;
    fileDataUrl: string;
    expiryDate?: string;
    isPublic?: boolean;
    fallbackName?: string;
    fallbackCity?: string;
    fallbackPhone?: string;
  }) => Promise<boolean>;
  fetchMyPartnerApplication: () => Promise<{
    application: PartnerApplicationCloud | null;
    documents: PartnerApplicationDocCloud[];
  }>;
  fetchAllPartnerApplicationsForAdmin: () => Promise<PartnerApplicationCloud[]>;
  reviewPartnerApplicationInFirestore: (
    partnerId: string,
    verificationStatus: PartnerApplicationCloud['verificationStatus'],
    adminNotes?: string
  ) => Promise<boolean>;
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || `id_${Date.now()}`;
}

async function shrinkDataUrlForFirestore(dataUrl: string, maxChars = 700_000): Promise<string> {
  if (!dataUrl || dataUrl.length <= maxChars) return dataUrl;
  if (!dataUrl.startsWith('data:image/')) {
    return dataUrl.slice(0, maxChars);
  }
  const attempts: Array<[number, number]> = [
    [960, 0.72],
    [760, 0.62],
    [600, 0.52],
  ];
  for (const [dim, quality] of attempts) {
    try {
      const next = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(dataUrl);
            return;
          }
          const scale = Math.min(1, dim / Math.max(w, h));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(dataUrl);
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('Image resize failed'));
        img.src = dataUrl;
      });
      if (next.length <= maxChars) return next;
    } catch {
      break;
    }
  }
  return dataUrl.slice(0, maxChars);
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreOnline, setFirestoreOnline] = useState(true);
  const [redirectAuthUser, setRedirectAuthUser] = useState<FirebaseUser | null>(null);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceItem[]>([]);
  const [aiThreads, setAiThreads] = useState<CloudAiThread[]>([]);

  const clearRedirectState = useCallback(() => {
    setRedirectAuthUser(null);
    setRedirectError(null);
  }, []);

  useEffect(() => {
    testFirestoreConnection().then((ok) => setFirestoreOnline(ok));
    let hadPendingRedirect = false;
    try {
      hadPendingRedirect = sessionStorage.getItem('pr_fb_redirect_pending') === '1';
      sessionStorage.removeItem('pr_fb_redirect_pending');
    } catch {
      // ignore storage errors
    }
    getRedirectResult(auth)
      .then((res) => {
        if (res?.user) {
          setRedirectAuthUser(res.user);
        }
      })
      .catch((err) => {
        if (hadPendingRedirect) {
          setRedirectError(formatFirebaseAuthError(err, 'Social Login'));
        }
      });
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const ensureUserProfile = useCallback(
    async (user: FirebaseUser, role: 'passenger' | 'partner', city = 'Islamabad', preferredLang: Language = 'en') => {
      // Security rules require email_verified == true for Firestore writes; skip cleanly for social/phone providers without verified email
      if (!user.emailVerified) return;
      const userPath = `users/${user.uid}`;
      const userRef = doc(db, 'users', user.uid);
      try {
        const snap = await getDoc(userRef);
        const safeName = (user.displayName || user.email?.split('@')[0] || 'PRO RIDER User').slice(0, 120);
        const safePhoto = (user.photoURL || '').slice(0, 500);
        if (!snap.exists()) {
          await setDoc(userRef, {
            uid: user.uid,
            displayName: safeName,
            ...(safePhoto ? { photoURL: safePhoto } : {}),
            role,
            city: city.slice(0, 80) || 'Islamabad',
            preferredLang,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(
            userRef,
            {
              displayName: safeName,
              ...(safePhoto ? { photoURL: safePhoto } : {}),
              city: city.slice(0, 80) || snap.data().city || 'Islamabad',
              preferredLang,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, userPath);
      }

      const privatePath = `users/${user.uid}/private/info`;
      const privateRef = doc(db, 'users', user.uid, 'private', 'info');
      try {
        const privSnap = await getDoc(privateRef);
        const email = (user.email || 'user@prorider.pk').slice(0, 180);
        if (!privSnap.exists()) {
          await setDoc(privateRef, {
            uid: user.uid,
            email,
            ...(user.phoneNumber ? { phone: user.phoneNumber.slice(0, 32) } : {}),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(
            privateRef,
            {
              email,
              ...(user.phoneNumber ? { phone: user.phoneNumber.slice(0, 32) } : {}),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, privatePath);
      }
    },
    []
  );

  // Subscribe to saved places & AI threads strictly when authenticated & emailVerified
  useEffect(() => {
    if (!authReady || !firebaseUser || !firebaseUser.emailVerified) {
      setSavedPlaces([]);
      setAiThreads([]);
      return;
    }

    const placesPath = `users/${firebaseUser.uid}/savedPlaces`;
    const placesQuery = query(
      collection(db, 'users', firebaseUser.uid, 'savedPlaces'),
      where('uid', '==', firebaseUser.uid),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubPlaces = onSnapshot(
      placesQuery,
      (snapshot) => {
        setSavedPlaces(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<SavedPlaceItem, 'id'>),
          }))
        );
      },
      (err) => {
        if (err instanceof Error && !err.message.includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, placesPath);
        }
      }
    );

    const threadsPath = `users/${firebaseUser.uid}/aiThreads`;
    const threadsQuery = query(
      collection(db, 'users', firebaseUser.uid, 'aiThreads'),
      where('uid', '==', firebaseUser.uid),
      orderBy('updatedAt', 'desc'),
      limit(15)
    );
    const unsubThreads = onSnapshot(
      threadsQuery,
      (snapshot) => {
        setAiThreads(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CloudAiThread, 'id'>),
          }))
        );
      },
      (err) => {
        if (err instanceof Error && !err.message.includes('permission')) {
          handleFirestoreError(err, OperationType.LIST, threadsPath);
        }
      }
    );

    return () => {
      unsubPlaces();
      unsubThreads();
    };
  }, [authReady, firebaseUser]);

  const signInWithGooglePopup = useCallback(
    async (role: 'passenger' | 'partner', city = 'Islamabad', lang: Language = 'en') => {
      try {
        const cred = await signInWithPopup(auth, googleProvider);
        const idToken = await cred.user.getIdToken();
        try {
          await ensureUserProfile(cred.user, role, city, lang);
        } catch {
          // Do not block sign-in if Firestore profile write faces transient connectivity issue
        }
        return { idToken, user: cred.user };
      } catch (err: any) {
        if (err?.code === 'auth/popup-blocked') {
          try {
            sessionStorage.setItem('pr_fb_redirect_pending', '1');
          } catch {
            // ignore
          }
          await signInWithRedirect(auth, googleProvider);
          return await new Promise<{ idToken: string; user: FirebaseUser }>(() => {});
        }
        throw err;
      }
    },
    [ensureUserProfile]
  );

  const signInWithFacebookPopup = useCallback(
    async (role: 'passenger' | 'partner', city = 'Islamabad', lang: Language = 'en') => {
      try {
        facebookProvider.addScope('email');
        facebookProvider.addScope('public_profile');
        const cred = await signInWithPopup(auth, facebookProvider);
        const idToken = await cred.user.getIdToken();
        try {
          await ensureUserProfile(cred.user, role, city, lang);
        } catch {
          // Skip Firestore failure safely
        }
        return { idToken, user: cred.user };
      } catch (err: any) {
        if (err?.code === 'auth/popup-blocked') {
          try {
            sessionStorage.setItem('pr_fb_redirect_pending', '1');
          } catch {
            // ignore
          }
          await signInWithRedirect(auth, facebookProvider);
          return await new Promise<{ idToken: string; user: FirebaseUser }>(() => {});
        }
        throw err;
      }
    },
    [ensureUserProfile]
  );

  const registerWithFirebaseEmail = useCallback(
    async (input: {
      fullName: string;
      email: string;
      password: string;
      role: 'passenger' | 'partner';
      city?: string;
      lang?: Language;
    }) => {
      const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
      if (input.fullName.trim()) {
        await updateProfile(cred.user, { displayName: input.fullName.trim().slice(0, 120) });
      }
      await sendEmailVerification(cred.user).catch(() => {});
      const idToken = await cred.user.getIdToken();
      if (cred.user.emailVerified) {
        try {
          await ensureUserProfile(cred.user, input.role, input.city || 'Islamabad', input.lang || 'en');
        } catch {
          // non-fatal
        }
      }
      return { idToken, user: cred.user, emailVerified: cred.user.emailVerified };
    },
    [ensureUserProfile]
  );

  const signInWithFirebaseEmail = useCallback(
    async (input: {
      email: string;
      password: string;
      role: 'passenger' | 'partner';
      city?: string;
      lang?: Language;
    }) => {
      const cred = await signInWithEmailAndPassword(auth, input.email.trim(), input.password);
      const idToken = await cred.user.getIdToken();
      if (cred.user.emailVerified) {
        try {
          await ensureUserProfile(cred.user, input.role, input.city || 'Islamabad', input.lang || 'en');
        } catch {
          // non-fatal
        }
      }
      return { idToken, user: cred.user, emailVerified: cred.user.emailVerified };
    },
    [ensureUserProfile]
  );

  const resendFirebaseEmailVerification = useCallback(async () => {
    if (!auth.currentUser) throw new Error('No active email session to verify.');
    await sendEmailVerification(auth.currentUser);
  }, []);

  const reloadFirebaseUser = useCallback(
    async (role: 'passenger' | 'partner', city = 'Islamabad', lang: Language = 'en') => {
      if (!auth.currentUser) return null;
      await reload(auth.currentUser);
      const updated = auth.currentUser;
      const idToken = await updated.getIdToken(true);
      if (updated.emailVerified) {
        try {
          await ensureUserProfile(updated, role, city, lang);
        } catch {
          // non-fatal
        }
      }
      return { idToken, user: updated, emailVerified: updated.emailVerified };
    },
    [ensureUserProfile]
  );

  const sendFirebasePasswordReset = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email.trim());
  }, []);

  const sendFirebasePhoneOtp = useCallback(async (rawPhone: string, recaptchaContainerId: string) => {
    const e164 = normalizePakistanPhoneE164(rawPhone);
    if (!e164 || e164.length < 11) {
      throw new Error('Please enter a valid mobile number (e.g. 03125007782).');
    }
    const existingVerifier = (window as any).__prRecaptchaVerifier as RecaptchaVerifier | undefined;
    if (existingVerifier) {
      try {
        existingVerifier.clear();
      } catch {
        // ignore
      }
    }
    const containerEl = document.getElementById(recaptchaContainerId);
    if (containerEl) containerEl.innerHTML = '';

    const verifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
      size: 'invisible',
    });
    (window as any).__prRecaptchaVerifier = verifier;
    return await signInWithPhoneNumber(auth, e164, verifier);
  }, []);

  const confirmFirebasePhoneOtp = useCallback(
    async (
      confirmation: ConfirmationResult,
      otpCode: string,
      role: 'passenger' | 'partner',
      city = 'Islamabad',
      lang: Language = 'en'
    ) => {
      const cred = await confirmation.confirm(otpCode.trim());
      const idToken = await cred.user.getIdToken();
      if (cred.user.emailVerified) {
        try {
          await ensureUserProfile(cred.user, role, city, lang);
        } catch {
          // non-fatal
        }
      }
      return { idToken, user: cred.user };
    },
    [ensureUserProfile]
  );

  const signOutFirebase = useCallback(async () => {
    await signOut(auth);
  }, []);

  const savePlace = useCallback(
    async (place: Omit<SavedPlaceItem, 'id' | 'uid'>) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      const placeId = sanitizeId(`plc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const path = `users/${firebaseUser.uid}/savedPlaces/${placeId}`;
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'savedPlaces', placeId), {
          uid: firebaseUser.uid,
          label: place.label.trim().slice(0, 100) || 'Saved Place',
          address: place.address.trim().slice(0, 300),
          lat: Number(place.lat),
          lng: Number(place.lng),
          category: place.category,
          ...(place.placeId ? { placeId: place.placeId.slice(0, 200) } : {}),
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [firebaseUser]
  );

  const removeSavedPlace = useCallback(
    async (placeId: string) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      const cleanId = sanitizeId(placeId);
      const path = `users/${firebaseUser.uid}/savedPlaces/${cleanId}`;
      try {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'savedPlaces', cleanId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [firebaseUser]
  );

  const createAiThread = useCallback(
    async (persona: 'passenger' | 'partner' | 'general', mode: 'fast' | 'general' | 'deep', firstTitle: string) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return null;
      const threadId = sanitizeId(`thr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const path = `users/${firebaseUser.uid}/aiThreads/${threadId}`;
      try {
        await ensureUserProfile(firebaseUser, persona === 'partner' ? 'partner' : 'passenger');
        await setDoc(doc(db, 'users', firebaseUser.uid, 'aiThreads', threadId), {
          uid: firebaseUser.uid,
          title: firstTitle.trim().slice(0, 140) || 'PRO RIDER AI Chat',
          persona,
          mode,
          lastMessagePreview: firstTitle.trim().slice(0, 240),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return threadId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [firebaseUser, ensureUserProfile]
  );

  const saveAiMessage = useCallback(
    async (threadId: string, msg: Omit<CloudAiMessage, 'id' | 'threadId'>) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      const cleanThread = sanitizeId(threadId);
      const msgId = sanitizeId(`msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      const msgPath = `users/${firebaseUser.uid}/aiThreads/${cleanThread}/messages/${msgId}`;
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid, 'aiThreads', cleanThread, 'messages', msgId), {
          uid: firebaseUser.uid,
          threadId: cleanThread,
          sender: msg.sender,
          text: msg.text.slice(0, 8000) || ' ',
          mode: msg.mode,
          ...(msg.sources?.length ? { sources: msg.sources.slice(0, 10) } : {}),
          ...(msg.places?.length ? { places: msg.places.slice(0, 10) } : {}),
          createdAt: serverTimestamp(),
        });
        await setDoc(
          doc(db, 'users', firebaseUser.uid, 'aiThreads', cleanThread),
          {
            lastMessagePreview: msg.text.slice(0, 240),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, msgPath);
      }
    },
    [firebaseUser]
  );

  const fetchThreadMessages = useCallback(
    async (threadId: string): Promise<CloudAiMessage[]> => {
      if (!firebaseUser || !firebaseUser.emailVerified) return [];
      const cleanThread = sanitizeId(threadId);
      const path = `users/${firebaseUser.uid}/aiThreads/${cleanThread}/messages`;
      try {
        const q = query(
          collection(db, 'users', firebaseUser.uid, 'aiThreads', cleanThread, 'messages'),
          where('uid', '==', firebaseUser.uid),
          orderBy('createdAt', 'asc'),
          limit(50)
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CloudAiMessage, 'id'>),
        }));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, path);
      }
    },
    [firebaseUser]
  );

  const syncBookingSummary = useCallback(
    async (input: {
      bookingCode: string;
      bookingMode: 'go_now' | 'schedule';
      serviceType: 'pick_and_drop' | 'ride_sharing' | 'fuel_sharing';
      pickupAddress: string;
      dropoffAddress: string;
      distanceKm: number;
      farePkr: number;
      status: string;
    }) => {
      if (!firebaseUser || !firebaseUser.emailVerified) return;
      const cleanCode = sanitizeId(input.bookingCode);
      const path = `users/${firebaseUser.uid}/bookings/${cleanCode}`;
      try {
        const ref = doc(db, 'users', firebaseUser.uid, 'bookings', cleanCode);
        const snap = await getDoc(ref);
        const payload = {
          uid: firebaseUser.uid,
          bookingCode: cleanCode,
          bookingMode: input.bookingMode,
          serviceType: input.serviceType,
          pickupAddress: input.pickupAddress.slice(0, 300),
          dropoffAddress: input.dropoffAddress.slice(0, 300),
          distanceKm: Math.max(0.1, Math.min(2000, Number(input.distanceKm) || 1)),
          farePkr: Math.max(0, Number(input.farePkr) || 0),
          status: input.status,
          updatedAt: serverTimestamp(),
        };
        if (!snap.exists()) {
          await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
        } else if (!['completed', 'cancelled'].includes(snap.data().status)) {
          await setDoc(
            ref,
            {
              status: input.status,
              farePkr: Math.max(0, Number(input.farePkr) || 0),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [firebaseUser]
  );

  const syncPartnerApplication = useCallback(
    async (input: {
      fullName: string;
      email?: string;
      phone?: string;
      referencePhone?: string;
      cnicNumber?: string;
      cnicExpiry?: string;
      licenceNumber?: string;
      licenceExpiry?: string;
      vehicleCategoryId?: string;
      vehicleName?: string;
      vehicleNumber?: string;
      seatingCapacity?: number;
      fuelType?: string;
      operatingCity: string;
      serviceEligibility?: string[];
      docsCount?: number;
      isSubmit?: boolean;
    }): Promise<boolean> => {
      if (!firebaseUser || !firebaseUser.emailVerified) return false;
      const uid = sanitizeId(firebaseUser.uid);
      const path = `partnerApplications/${uid}`;
      try {
        const ref = doc(db, 'partnerApplications', uid);
        const snap = await getDoc(ref);
        const existingData = snap.exists() ? (snap.data() as PartnerApplicationCloud) : null;
        if (existingData?.verificationStatus === 'suspended') {
          return false;
        }
        const docsTotal = Math.max(0, Math.min(12, Number(input.docsCount ?? existingData?.docsCount ?? 0)));
        let nextStatus: PartnerApplicationCloud['verificationStatus'] =
          existingData?.verificationStatus || 'incomplete';
        if (input.isSubmit) {
          if (['incomplete', 'documents_pending', 'rejected', 'under_review'].includes(nextStatus)) {
            nextStatus = docsTotal >= 1 ? 'under_review' : 'documents_pending';
          }
        } else if (nextStatus === 'incomplete' && docsTotal >= 1) {
          nextStatus = 'documents_pending';
        }

        const payload: Record<string, any> = {
          uid,
          fullName: (input.fullName || firebaseUser.displayName || 'Pro Partner').trim().slice(0, 120) || 'Pro Partner',
          email: (input.email || firebaseUser.email || '').trim().slice(0, 180),
          phone: (input.phone || '').trim().slice(0, 32),
          referencePhone: (input.referencePhone || '').trim().slice(0, 32),
          cnicNumber: (input.cnicNumber || '').trim().slice(0, 40),
          cnicExpiry: (input.cnicExpiry || '').trim().slice(0, 24),
          licenceNumber: (input.licenceNumber || '').trim().slice(0, 60),
          licenceExpiry: (input.licenceExpiry || '').trim().slice(0, 24),
          vehicleCategoryId: (input.vehicleCategoryId || 'fleet-sedan').trim().slice(0, 64),
          vehicleName: (input.vehicleName || '').trim().slice(0, 120),
          vehicleNumber: (input.vehicleNumber || '').trim().slice(0, 40),
          seatingCapacity: Math.max(1, Math.min(30, Number(input.seatingCapacity || 4))),
          fuelType: (input.fuelType || 'Petrol').trim().slice(0, 40),
          operatingCity: (input.operatingCity || 'Islamabad').trim().slice(0, 80) || 'Islamabad',
          serviceEligibility: Array.isArray(input.serviceEligibility)
            ? input.serviceEligibility.slice(0, 3).map((s) => String(s))
            : ['pick_and_drop'],
          verificationStatus: nextStatus,
          docsCount: docsTotal,
          updatedAt: serverTimestamp(),
          createdAt: existingData?.createdAt || serverTimestamp(),
        };

        if (existingData && typeof existingData.adminNotes === 'string') {
          payload.adminNotes = existingData.adminNotes;
        }
        if (input.isSubmit) {
          payload.submittedAt = serverTimestamp();
        } else if (existingData?.submittedAt) {
          payload.submittedAt = existingData.submittedAt;
        }

        await setDoc(ref, payload);
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [firebaseUser]
  );

  const syncPartnerDocument = useCallback(
    async (input: {
      docType: PartnerApplicationDocCloud['docType'];
      fileName: string;
      fileDataUrl: string;
      expiryDate?: string;
      isPublic?: boolean;
      fallbackName?: string;
      fallbackCity?: string;
      fallbackPhone?: string;
    }): Promise<boolean> => {
      if (!firebaseUser || !firebaseUser.emailVerified) return false;
      const uid = sanitizeId(firebaseUser.uid);
      const appRef = doc(db, 'partnerApplications', uid);
      const docRef = doc(db, 'partnerApplications', uid, 'documents', input.docType);
      const docPath = `partnerApplications/${uid}/documents/${input.docType}`;
      try {
        const appSnap = await getDoc(appRef);
        if (!appSnap.exists()) {
          await setDoc(appRef, {
            uid,
            fullName: (input.fallbackName || firebaseUser.displayName || 'Pro Partner').trim().slice(0, 120) || 'Pro Partner',
            email: (firebaseUser.email || '').slice(0, 180),
            phone: (input.fallbackPhone || firebaseUser.phoneNumber || '').slice(0, 32),
            operatingCity: (input.fallbackCity || 'Islamabad').slice(0, 80),
            verificationStatus: 'under_review',
            docsCount: 1,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        const safeDataUrl = await shrinkDataUrlForFirestore(input.fileDataUrl, 700_000);
        const existingDocSnap = await getDoc(docRef);
        const existingDoc = existingDocSnap.exists() ? existingDocSnap.data() : null;

        const docPayload: Record<string, any> = {
          uid,
          docType: input.docType,
          fileName: (input.fileName || `${input.docType}.jpg`).slice(0, 200),
          fileDataUrl: safeDataUrl,
          status: 'pending',
          expiryDate: (input.expiryDate || '').slice(0, 24),
          isPublic: Boolean(input.isPublic),
          uploadedAt: existingDoc?.uploadedAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (existingDoc && typeof existingDoc.reviewNotes === 'string') {
          docPayload.reviewNotes = existingDoc.reviewNotes;
        }

        await setDoc(docRef, docPayload);

        // Refresh docs count and bump status if incomplete/documents_pending
        const docsSnap = await getDocs(
          query(collection(db, 'partnerApplications', uid, 'documents'), where('uid', '==', uid), limit(12))
        );
        const currentAppSnap = await getDoc(appRef);
        const currentApp = currentAppSnap.exists() ? (currentAppSnap.data() as PartnerApplicationCloud) : null;
        if (currentApp && currentApp.verificationStatus !== 'suspended') {
          const nextStatus = ['incomplete', 'documents_pending', 'rejected'].includes(currentApp.verificationStatus)
            ? 'under_review'
            : currentApp.verificationStatus;
          await setDoc(
            appRef,
            {
              ...currentApp,
              verificationStatus: nextStatus,
              docsCount: docsSnap.size,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, docPath);
      }
    },
    [firebaseUser]
  );

  const fetchMyPartnerApplication = useCallback(async () => {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      return { application: null, documents: [] };
    }
    const uid = sanitizeId(firebaseUser.uid);
    const path = `partnerApplications/${uid}`;
    try {
      const appSnap = await getDoc(doc(db, 'partnerApplications', uid));
      const docsSnap = await getDocs(
        query(collection(db, 'partnerApplications', uid, 'documents'), where('uid', '==', uid), limit(12))
      );
      const documents = docsSnap.docs.map((d) => d.data() as PartnerApplicationDocCloud);
      return {
        application: appSnap.exists() ? (appSnap.data() as PartnerApplicationCloud) : null,
        documents,
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, path);
    }
  }, [firebaseUser]);

  const fetchAllPartnerApplicationsForAdmin = useCallback(async (): Promise<PartnerApplicationCloud[]> => {
    if (
      !firebaseUser ||
      !firebaseUser.emailVerified ||
      firebaseUser.email?.toLowerCase() !== 'prorider.pk786@gmail.com'
    ) {
      return [];
    }
    const path = 'partnerApplications';
    try {
      const snap = await getDocs(query(collection(db, 'partnerApplications'), limit(100)));
      const apps = await Promise.all(
        snap.docs.map(async (d) => {
          const data = d.data() as PartnerApplicationCloud;
          let documents: PartnerApplicationDocCloud[] = [];
          try {
            const docSnap = await getDocs(
              query(collection(db, 'partnerApplications', d.id, 'documents'), limit(12))
            );
            documents = docSnap.docs.map((x) => x.data() as PartnerApplicationDocCloud);
          } catch {
            documents = [];
          }
          return { ...data, uid: data.uid || d.id, documents };
        })
      );
      return apps;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  }, [firebaseUser]);

  const reviewPartnerApplicationInFirestore = useCallback(
    async (
      partnerId: string,
      verificationStatus: PartnerApplicationCloud['verificationStatus'],
      adminNotes = ''
    ): Promise<boolean> => {
      if (
        !firebaseUser ||
        !firebaseUser.emailVerified ||
        firebaseUser.email?.toLowerCase() !== 'prorider.pk786@gmail.com'
      ) {
        return false;
      }
      const cleanId = sanitizeId(partnerId);
      const path = `partnerApplications/${cleanId}`;
      try {
        const ref = doc(db, 'partnerApplications', cleanId);
        const snap = await getDoc(ref);
        if (!snap.exists()) return false;
        const current = snap.data() as PartnerApplicationCloud;
        await setDoc(ref, {
          ...current,
          verificationStatus,
          adminNotes: adminNotes.slice(0, 500),
          updatedAt: serverTimestamp(),
        });
        return true;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [firebaseUser]
  );

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        firestoreOnline,
        redirectAuthUser,
        redirectError,
        clearRedirectState,
        savedPlaces,
        aiThreads,
        signInWithGooglePopup,
        signInWithFacebookPopup,
        registerWithFirebaseEmail,
        signInWithFirebaseEmail,
        resendFirebaseEmailVerification,
        reloadFirebaseUser,
        sendFirebasePasswordReset,
        sendFirebasePhoneOtp,
        confirmFirebasePhoneOtp,
        signOutFirebase,
        savePlace,
        removeSavedPlace,
        createAiThread,
        saveAiMessage,
        fetchThreadMessages,
        syncBookingSummary,
        syncPartnerApplication,
        syncPartnerDocument,
        fetchMyPartnerApplication,
        fetchAllPartnerApplicationsForAdmin,
        reviewPartnerApplicationInFirestore,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside FirebaseProvider');
  }
  return ctx;
}
