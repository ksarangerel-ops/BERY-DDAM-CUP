/* ============================================================
   SUPABASE REALTIME

   The complete tournament state is stored as one JSONB row. Supabase
   Realtime broadcasts updates to every connected scoreboard, while the
   localStorage cache keeps the board usable during a temporary outage.
============================================================ */
import { createClient } from '@supabase/supabase-js';
import { TOURNAMENT_ID } from './config.js';

const config = {
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY,
};

export const isConfigured = Boolean(config.url && config.publishableKey);
export const missingKeys = Object.entries({
  VITE_SUPABASE_URL: config.url,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
}).filter(([, value]) => !value).map(([key]) => key);

let client = null;
let channel = null;
let connected = false;
const connectionListeners = new Set();

if (isConfigured) {
  try {
    client = createClient(config.url, config.publishableKey);
  } catch (error) {
    console.error('[supabase] init failed:', error);
  }
}

export const isLive = () => client !== null;

export async function getSession() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function subscribeAuth(onChange) {
  if (!client) {
    onChange(null);
    return () => {};
  }
  const { data } = client.auth.onAuthStateChange((_event, session) => onChange(session));
  return () => data.subscription.unsubscribe();
}

export async function signIn(email, password) {
  if (!client) throw new Error('Supabase is not configured');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

function setConnectionState(value) {
  connected = value;
  connectionListeners.forEach(listener => listener(value));
}

function normaliseRow(row) {
  if (!row) return null;
  return row.state || null;
}

export function subscribeConnection(onChange) {
  connectionListeners.add(onChange);
  onChange(connected);
  return () => connectionListeners.delete(onChange);
}

export function subscribe(onNext, onError) {
  if (!client) return () => {};
  let active = true;

  const loadCurrent = async () => {
    const { data, error } = await client
      .from('tournaments')
      .select('state')
      .eq('id', TOURNAMENT_ID)
      .maybeSingle();
    if (!active) return;
    if (error) {
      console.error('[supabase] read failed:', error);
      setConnectionState(false);
      onError?.(error);
      return;
    }
    onNext(normaliseRow(data));
  };

  channel = client
    .channel(`tournament:${TOURNAMENT_ID}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tournaments', filter: `id=eq.${TOURNAMENT_ID}` },
      payload => {
        if (payload.eventType === 'DELETE') onNext(null);
        else onNext(normaliseRow(payload.new));
      },
    )
    .subscribe(status => {
      if (status === 'SUBSCRIBED') setConnectionState(true);
      if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) setConnectionState(false);
    });

  loadCurrent();

  return () => {
    active = false;
    if (channel) client.removeChannel(channel);
    channel = null;
    setConnectionState(false);
  };
}

export async function publish(state) {
  if (!client) throw new Error('Supabase is not configured');
  const { error } = await client.from('tournaments').upsert({
    id: TOURNAMENT_ID,
    state,
    updated: state.updated,
  }, { onConflict: 'id' });
  if (error) throw error;
}
