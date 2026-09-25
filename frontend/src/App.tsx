import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { OfflineProvider } from './context/OfflineContext';
import { OfflineBanner } from './components/OfflineBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoadingSpinner } from './components/LoadingSpinner';

// Wallet SDK is loaded lazily so it is never part of the initial render path.
// The provider is only mounted once the SDK chunk has resolved, keeping the
// first paint free of wallet dependencies while preserving connection,
// authorization, and user-visible status behavior.
const WalletProvider = lazy(() =>
  import('./context/WalletContext').then((m) => ({ default: m.WalletProvider })),
);

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Loans = lazy(() => import('./pages/Loans'));
const Remittances = lazy(() => import('./pages/Remittances'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  const [walletReady, setWalletReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Warm the wallet SDK chunk after the initial render so the provider can
    // mount without blocking first paint. Failures are non-fatal: the app
    // remains usable and the provider retries on the next mount.
    import('./context/WalletContext')
      .then(() => {
        if (!cancelled) setWalletReady(true);
      })
      .catch(() => {
        if (!cancelled) setWalletReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const app = (
    <QueryClientProvider client={queryClient}>
      <OfflineProvider>
        <OfflineBanner />
        <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/loans" element={<Loans />} />
                <Route path="/remittances" element={<Remittances />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </BrowserRouter>
          </Suspense>
        </ErrorBoundary>
      </OfflineProvider>
    </QueryClientProvider>
  );

  if (!walletReady) {
    return app;
  }

  return (
    <Suspense fallback={app}>
      <WalletProvider>{app}</WalletProvider>
    </Suspense>
  );
}

export default App;
