import { useState } from 'react';
import { requireSupabase } from '../lib/supabase';

/**
 * Sign-in and pairing.
 *
 * Magic link rather than a password: two people, no reset flow to build, nothing
 * to leak. The trade is that signing in needs an inbox, which for a private app
 * used on a phone is acceptable.
 */
/**
 * Sign in and sign up, with a password.
 *
 * Magic links were the original choice - no password to leak, no reset flow to
 * build - but they depend on Supabase sending mail, and the built-in service is
 * capped at roughly two emails per hour and documented as test-only. For two
 * people that ceiling is hit immediately, and the failure is opaque: "email rate
 * limit exceeded" with no way to get in.
 *
 * A password removes the dependency entirely. No SMTP provider, no third-party
 * service, no per-message quota, and nothing that can start costing money. The
 * trade is that a forgotten password needs a reset from the Supabase dashboard
 * rather than an email - acceptable when there are two accounts and both owners
 * are in the same room.
 *
 * Requires "Confirm email" to be OFF in Authentication -> Providers -> Email,
 * or signing up still sends a message and hits the same limit.
 */
export function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const client = requireSupabase();
    const credentials = { email: email.trim(), password };

    const { error: authError } = mode === 'in'
      ? await client.auth.signInWithPassword(credentials)
      : await client.auth.signUp(credentials);

    setBusy(false);
    if (!authError) return; // onAuthStateChange takes it from here.

    // Supabase's messages are terse and sometimes misleading; translate the ones
    // that have an obvious cause.
    const message = authError.message.toLowerCase();
    if (message.includes('already registered')) {
      setError('That email already has an account. Switch to Sign in.');
    } else if (message.includes('invalid login credentials')) {
      setError('Wrong email or password.');
    } else if (message.includes('rate limit') || message.includes('email')) {
      setError(
        'Supabase tried to send a confirmation email and hit its limit. '
        + 'Turn off "Confirm email" in Authentication → Providers → Email.',
      );
    } else if (message.includes('password')) {
      setError('Password must be at least 6 characters.');
    } else {
      setError(authError.message);
    }
  };

  const canSubmit = email.includes('@') && password.length >= 6 && !busy;

  return (
    <div
      className="stack"
      style={{ padding: 24, paddingTop: 'calc(env(safe-area-inset-top) + 48px)' }}
    >
      <h1>Pollito</h1>
      <p>A shared space for two.</p>

      <div className="inline" style={{ marginBottom: 4 }}>
        <button
          className={mode === 'in' ? 'button--primary' : 'button--quiet'}
          style={{ flex: 1 }}
          onClick={() => { setMode('in'); setError(null); }}
        >
          Sign in
        </button>
        <button
          className={mode === 'up' ? 'button--primary' : 'button--quiet'}
          style={{ flex: 1 }}
          onClick={() => { setMode('up'); setError(null); }}
        >
          Create account
        </button>
      </div>

      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email" type="email" inputMode="email" autoComplete="email"
          placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password" type="password"
          // Tells the keychain whether to offer a saved password or generate one.
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          placeholder="At least 6 characters"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void submit(); }}
        />
      </div>

      {error ? <div className="field__error">{error}</div> : null}

      <button className="button--primary" onClick={() => void submit()} disabled={!canSubmit}>
        {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
      </button>
    </div>
  );
}

/**
 * Shown to a signed-in user who is not yet in a household.
 *
 * One of them creates and shares a code; the other joins with it. Both paths are
 * server-side functions so a client cannot put a third person in.
 */
export function Pairing({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: 'create' | 'join') => {
    if (name.trim() === '') {
      setError('What should the other person see you as?');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = requireSupabase();
      const { error: rpcError } = action === 'create'
        ? await client.rpc('create_household', { display_name: name.trim() })
        : await client.rpc('join_household', { code: code.trim(), display_name: name.trim() });
      if (rpcError) throw rpcError;
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ padding: 24, paddingTop: 'calc(env(safe-area-inset-top) + 48px)' }}>
      <h1>Set up</h1>

      <div className="field">
        <label htmlFor="display-name">Your name</label>
        <input
          id="display-name" placeholder="Alex" value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {mode === 'join' ? (
        <div className="field">
          <label htmlFor="code">Pairing code</label>
          <input
            id="code" placeholder="ABC234" value={code}
            // Uppercased on the way in; the code alphabet has no lowercase.
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
          />
        </div>
      ) : null}

      {error ? <div className="field__error">{error}</div> : null}

      {mode === 'choose' ? (
        <>
          <button className="button--primary" onClick={() => setMode('create')}>
            Start a new household
          </button>
          <button onClick={() => setMode('join')}>I have a pairing code</button>
        </>
      ) : (
        <>
          <button
            className="button--primary" disabled={busy}
            onClick={() => void run(mode === 'create' ? 'create' : 'join')}
          >
            {busy ? 'Working…' : mode === 'create' ? 'Create household' : 'Join'}
          </button>
          <button className="button--quiet" onClick={() => { setMode('choose'); setError(null); }}>
            Back
          </button>
        </>
      )}
    </div>
  );
}

/** Shown when the app was built without a backend, rather than failing obscurely. */
export function NotConfigured() {
  return (
    <div className="stack" style={{ padding: 24, paddingTop: 'calc(env(safe-area-inset-top) + 48px)' }}>
      <h1>Pollito</h1>
      <div className="notice notice--warn">
        <strong>No backend configured.</strong>
        <p style={{ marginTop: 8 }}>
          Copy <code>.env.example</code> to <code>.env</code> and fill in
          <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>
          from your Supabase project’s API settings, then restart the dev server.
        </p>
      </div>
    </div>
  );
}
