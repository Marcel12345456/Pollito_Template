import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useQueryClient, onlineManager } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './lib/supabase';
import { useHousehold, useRealtimeSync } from './lib/queries';
import { AppShell } from './components/AppShell';
import { Overview } from './pages/Overview';
import { Money } from './pages/Money';
import { Calendar } from './pages/Calendar';
import { Shopping } from './pages/Shopping';
import { Todos } from './pages/Todos';
import { Settings } from './pages/Settings';
import { Privacy } from './pages/Privacy';
import { NotConfigured, Pairing, SignIn } from './pages/Onboarding';

const TITLES: Record<string, string> = {
  '/': 'Pollito',
  '/calendar': 'Calendar',
  '/shopping': 'Shopping',
  '/todos': 'To-do',
  '/money': 'Money',
  '/settings': 'Settings',
  '/privacy': 'Privacy',
};

export default function App() {
  if (!isConfigured) return <NotConfigured />;
  return <Authenticated />;
}

function Authenticated() {
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    // The magic link returns with the session in the URL fragment, so the
    // listener is what picks it up - getSession alone would miss it.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!checked) return null;
  if (!session) return <SignIn />;
  return <InHousehold />;
}

function InHousehold() {
  const household = useHousehold();
  const client = useQueryClient();
  useRealtimeSync(household.data?.id, client);
  const location = useLocation();

  // Coming back online should send the queue immediately. Without this the writes
  // sit there until something else triggers a mutation, which from the user's
  // side looks like the app quietly dropped them.
  useEffect(() => onlineManager.subscribe((online) => {
    if (online) void client.resumePausedMutations();
  }), [client]);

  if (household.isLoading) return null;
  if (!household.data) {
    return <Pairing onDone={() => void household.refetch()} />;
  }

  return (
    <Routes>
      <Route element={<AppShell title={TITLES[location.pathname] ?? 'Pollito'} />}>
        <Route index element={<Overview />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="shopping" element={<Shopping />} />
        <Route path="todos" element={<Todos />} />
        <Route path="money" element={<Money />} />
        <Route path="settings" element={<Settings />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
