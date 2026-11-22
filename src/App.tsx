import { useEffect, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { AlertTriangle, X } from 'lucide-react';
import { AppPermissionsModal } from './components/AppPermissionsModal';
import { OfflineIndicator } from './components/BrandMark';
import { ErrorBoundary } from './components/ErrorBoundary';
import { DEFAULT_PUBLIC_CONFIG } from './config/defaultConfig';
import { FirebaseProvider } from './contexts/FirebaseContext';
import { AdminPortal } from './pages/admin/AdminPortal';
import { PartnerApp } from './pages/partner/PartnerApp';
import { PassengerApp } from './pages/passenger/PassengerApp';
import { PublicTripTrackingPage } from './pages/PublicTripTrackingPage';
import { PublicWebsitePage } from './pages/PublicWebsitePage';
import { WelcomePage } from './pages/WelcomePage';
import type { Language, PublicConfig } from './types';
import { apiRequest } from './utils/api';

function normalizePath(pathname: string): string {
  if (pathname.startsWith('/passenger')) return '/passenger';
  if (pathname.startsWith('/partner')) return '/partner';
  if (pathname.startsWith('/track')) return '/track';
  if (pathname === '/admin/login') return '/admin/login';
  if (pathname.startsWith('/admin')) return '/admin';
  if (pathname.startsWith('/website')) return '/website';
  return '/';
}

export default function App() {
  const [path, setPath] = useState<string>(() => normalizePath(window.location.pathname));
  const [lang, setLang] = useState<Language>(() => {
    try {
      return localStorage.getItem('pr_lang') === 'ur' ? 'ur' : 'en';
    } catch {
      return 'en';
    }
  });
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_PUBLIC_CONFIG);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  const navigate = (nextPath: string) => {
    const clean = normalizePath(nextPath);
    if (window.location.pathname !== clean) {
      window.history.pushState({}, '', clean);
    }
    setPath(clean);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const onQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    apiRequest<PublicConfig>('/api/public/config')
      .then((res) => {
        if (res && Array.isArray(res.fleet) && res.fleet.length > 0) {
          setConfig(res);
        }
      })
      .catch(() => {
        // Keep DEFAULT_PUBLIC_CONFIG safely on static/offline hosting
      });
  }, []);

  const handleLanguageChange = (nextLang: Language) => {
    setLang(nextLang);
    try {
      localStorage.setItem('pr_lang', nextLang);
    } catch {
      // ignore
    }
  };

  const mapsApiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
  const hasMapsKey = mapsApiKey.length > 10;

  const content = (
    <FirebaseProvider>
      <ErrorBoundary>
        {quotaExceeded && hasMapsKey && (
          <div className="sticky top-0 z-50 bg-amber-50 border-b border-amber-300 text-amber-950 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 max-w-5xl mx-auto">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Google Maps Demo API Quota Reached:</strong> Fallback interactive OpenStreetMap view is active.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setQuotaExceeded(false)}
              aria-label="Dismiss quota banner"
              className="p-1 rounded hover:bg-amber-200/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {path === '/' && (
          <WelcomePage lang={lang} onChangeLang={handleLanguageChange} onNavigate={navigate} />
        )}
        {path === '/website' && (
          <PublicWebsitePage config={config} lang={lang} onChangeLang={handleLanguageChange} onNavigate={navigate} />
        )}
        {path === '/passenger' && (
          <PassengerApp config={config} lang={lang} onChangeLang={handleLanguageChange} onNavigate={navigate} />
        )}
        {path === '/partner' && (
          <PartnerApp config={config} lang={lang} onChangeLang={handleLanguageChange} onNavigate={navigate} />
        )}
        {(path === '/admin' || path === '/admin/login') && (
          <AdminPortal currentPath={path} onNavigate={navigate} />
        )}
        {path === '/track' && (
          <PublicTripTrackingPage config={config} lang={lang} onChangeLang={handleLanguageChange} onNavigate={navigate} />
        )}
        <AppPermissionsModal lang={lang} activeRoute={path} />
        <OfflineIndicator />
      </ErrorBoundary>
    </FirebaseProvider>
  );

  return hasMapsKey ? (
    <APIProvider apiKey={mapsApiKey} language={lang === 'ur' ? 'ur' : 'en'} region="PK">
      {content}
    </APIProvider>
  ) : (
    content
  );
}
