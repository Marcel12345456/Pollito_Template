/**
 * The privacy policy, in the app.
 *
 * Rendered as a page rather than linked to an external URL because the Settings
 * links previously pointed at example.com, and a policy nobody can open is not a
 * policy. Kept as literal markup rather than parsed markdown so there is no
 * dependency and no chance of it rendering blank.
 *
 * The text must stay in step with PRIVACY.md. If they diverge, the one users can
 * actually read is this one.
 */
export function Privacy() {
  return (
    <div className="stack" style={{ paddingBottom: 24 }}>
      <p style={{ fontSize: 13 }}>Last updated: 29 October 2026</p>

      <h3>What is stored</h3>
      <p>
        Only what you type in: your email and password, your display name, and the
        income, expenses, calendar events, shopping items and to-dos you record.
      </p>
      <p>
        <strong>No analytics, no tracking, no advertising, no third-party scripts.</strong>
        {' '}The app loads nothing from any domain except its own and Supabase.
      </p>

      <h3>Who can see it</h3>
      <p>
        Both household members see everything — that is the purpose of the app.
        Nobody outside your household can. Each household&rsquo;s data is isolated
        in the database itself, and an unauthenticated request returns nothing.
      </p>

      <h3>Who processes it</h3>
      <p>
        <strong>Supabase</strong> stores the data and handles sign-in.
        {' '}<strong>Cloudflare</strong> serves the app; the files it serves contain
        no personal data, since your browser talks to Supabase directly.
      </p>
      <p>Nobody else. It is never sold, shared, or used to train anything.</p>

      <h3>How long it is kept</h3>
      <p>
        Until you delete it. Deleted items are erased for good after 30 days.
        Signing out removes the copy kept on your device. If one of you leaves the
        household, or deletes their account:
      </p>
      <ul style={{ color: 'var(--muted)', lineHeight: 1.6, paddingLeft: 20 }}>
        <li>their income entries are deleted;</li>
        <li>
          shared expenses, events and list items remain, attributed to a former
          member — erasing them would retroactively change the other
          person&rsquo;s own financial history;
        </li>
        <li>when the second person leaves, everything is deleted.</li>
      </ul>

      <h3>Your rights</h3>
      <p>
        You can see, correct and delete everything from inside the app, and leaving
        the household triggers the deletion rules above. You may also request a
        copy of your data or complain to your state data protection authority.
      </p>

      <h3>Security, honestly</h3>
      <p>
        Connections use HTTPS and passwords are hashed by Supabase, never visible
        to the app. But this is a small private app: there is no two-factor
        authentication, and a forgotten password is reset from the Supabase
        dashboard rather than by email. Use a password you do not reuse elsewhere.
      </p>

      <h3>Contact</h3>
      <p>
        [your email] — replace this before sharing the app with anyone outside the
        household.
      </p>
    </div>
  );
}
