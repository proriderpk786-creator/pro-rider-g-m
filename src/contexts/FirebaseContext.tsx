import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
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
  googleProvider,
  facebookProvider,
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

interface FirebaseContextValue {
  firebaseUser: FirebaseUser | null;
  authReady: boolean;
  firestoreOnline: boolean;
  savedPlaces: SavedPlaceItem[];
  aiThreads: CloudAiThread[];
  signInWithGooglePopup: (role: 'passenger' | 'partner', city?: string, lang?: Language) => Promise<{ idToken: string; user: FirebaseUser }>;
  signInWithFacebookPopup: (role: 'passenger' | 'partner', city?: string, lang?: Language) => Promise<{ idToken: string; user: FirebaseUser }>;
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
}

const FirebaseContext = createContext<FirebaseContextValue | null>(null);

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || `id_${Date.now()}`;
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [firestoreOnline, setFirestoreOnline] = useState(true);
  const [savedPlaces, setSavedPlaces] = useState<SavedPlaceItem[]>([]);
  const [aiThreads, setAiThreads] = useState<CloudAiThread[]>([]);

  useEffect(() => {
    testFirestoreConnection().then((ok) => setFirestoreOnline(ok));
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const ensureUserProfile = useCallback(
    async (user: FirebaseUser, role: 'passenger' | 'partner', city = 'Islamabad', preferredLang: Language = 'en') => {
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(
            privateRef,
            {
              email,
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
        // Ignore initial missing parent error before profile finishes creating
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
      const cred = await signInWithPopup(auth, googleProvider);
      const idToken = await cred.user.getIdToken();
      await ensureUserProfile(cred.user, role, city, lang);
      return { idToken, user: cred.user };
    },
    [ensureUserProfile]
  );

  const signInWithFacebookPopup = useCallback(
    async (role: 'passenger' | 'partner', city = 'Islamabad', lang: Language = 'en') => {
      const cred = await signInWithPopup(auth, facebookProvider);
      const idToken = await cred.user.getIdToken();
      await ensureUserProfile(cred.user, role, city, lang);
      return { idToken, user: cred.user };
    },
    [ensureUserProfile]
  );

  const signOutFirebase = useCallback(async () => {
    await signOut(auth);
  }, []);

  const savePlace = useCallback(
    async (place: Omit<SavedPlaceItem, 'id' | 'uid'>) => {
      if (!firebaseUser) return;
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
      if (!firebaseUser) return;
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

  return (
    <FirebaseContext.Provider
      value={{
        firebaseUser,
        authReady,
        firestoreOnline,
        savedPlaces,
        aiThreads,
        signInWithGooglePopup,
        signInWithFacebookPopup,
        signOutFirebase,
        savePlace,
        removeSavedPlace,
        createAiThread,
        saveAiMessage,
        fetchThreadMessages,
        syncBookingSummary,
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
