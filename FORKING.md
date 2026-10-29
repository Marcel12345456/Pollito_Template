# Running your own Pollito

You're welcome to use and change this app for yourself. It's MIT-licensed (see
`LICENSE`): keep the copyright notice, and do whatever else you like.

Your copy runs on **your own** accounts. Nothing is shared with the original:
not the database, the hosting, or anyone's data. Everything below is free-tier.
Nothing asks for a credit card or can start charging you.

About 30 minutes, start to finish.

## What you need

- Node 22 and npm
- Free accounts at [GitHub](https://github.com), [Supabase](https://supabase.com)
  and [Cloudflare](https://dash.cloudflare.com)
- Docker, only if you want to run the security tests (step 6)

## 1. Get your own copy of the code

On GitHub, click **Use this template → Create a new repository** and choose
**Private**. Private matters: Actions logs on a public repo are public, and the
deploy log shows your app's domain.

```sh
git clone https://github.com/<you>/<your-repo>.git pollito
cd pollito
npm install
```

## 2. Create your backend (Supabase)

1. Create a new project. Pick an EU region if you're in the EU, and note which
   one you chose.
2. **SQL Editor** → paste the whole of `supabase/setup.sql` → Run. It's safe to
   run twice. If the app later says tables are missing, run
   `supabase/diagnose.sql`.
3. **Authentication → Providers → Email** → turn **"Confirm email" OFF**. The app
   signs in with a password. With confirmation on, Supabase's built-in mailer
   (about 2 mails/hour) blocks sign-up.
4. **Settings → API**: copy the **Project URL** and the **publishable / anon**
   key.

Never use the `service_role` / `sb_secret_` key anywhere in this app. It bypasses
every access rule.

## 3. Run it locally

```sh
cp .env.example .env     # then paste the URL and anon key into .env
npm run dev              # http://localhost:5173
```

To test on your phone over Wi-Fi, run `npm run dev:https`. The PWA install only
works over HTTPS. Accept the certificate warning once.

Create a household, then sign up a second account and join it with the pairing
code shown in **Settings**.

## 4. Pick your own name and domain

Change these before your first deploy:

| File | What to change |
|---|---|
| `package.json` → `deploy:upload` | `--project-name pollito` → your project name |
| `wrangler.toml` | `name` |
| `README.md` | the *Deploying* table |

Cloudflare gives you `<name>.pages.dev` if the name is free. If it isn't, you get
something like `<name>-abc.pages.dev`, which the dashboard shows after step 5.

Optional rebranding: the app name is in `vite.config.ts` (manifest),
`index.html`, `src/App.tsx`, `src/pages/Onboarding.tsx` and the install
components. The icons are in `public/`.

**Language and currency** are German and euros: `LOCALE` and `CURRENCY` in
`src/lib/money.ts`, plus the `'de-DE'` date formatting in `src/pages/Todos.tsx`
and `src/pages/Calendar.tsx`.

## 5. Deploy (Cloudflare Pages)

Create the project once, with `production` as its production branch:

```sh
npx wrangler login
npx wrangler pages project create <your-name> --production-branch production
npm run deploy
```

Use `--branch production`, not `main`: deploying to `main` shows "Success" but
lands a hidden preview while your domain keeps the old build. See README →
*Deploying*.

**Deploy on every push (optional).** Add these secrets under your repo's
**Settings → Secrets and variables → Actions**, then enable Actions:

| Secret | Where from |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → custom token with **Account → Cloudflare Pages → Edit** only |
| `CLOUDFLARE_ACCOUNT_ID` | In your Cloudflare dashboard URL |
| `VITE_SUPABASE_URL` | Step 2 |
| `VITE_SUPABASE_ANON_KEY` | Step 2 |

Also add one **variable** (same page, *Variables* tab): `PAGES_DOMAIN`, your
domain from step 5 without `https://`, e.g. `myapp.pages.dev`. The deploy
checks that this domain serves the new build.

The API token is the only real secret here. The Supabase values end up in the
public bundle anyway, because access is protected by the database rules, not the
key.

Without `PAGES_DOMAIN` the deploy job is skipped (grey), not failed, so it is
safe to push before you have set anything up.

Then open your domain on both phones and use **Add to Home Screen**.

**Once you have both signed up and paired, close sign-up:** Supabase →
**Authentication → Sign In / Providers** → turn off **Allow new users to sign
up**. You can both still log in. Without this, anyone who finds your domain can
create accounts in your project. They can't see your data, but they use your
free-tier quota.

## 6. Changing things safely

- **UI and features:** `src/pages/` (one file per tab), data access in
  `src/lib/queries.ts` and `src/lib/mutations.ts`. `npm run typecheck` before
  you push. A type error also fails the deploy.
- **Database changes:** add a new numbered file in `supabase/migrations/`. Write
  it so re-running it does nothing (`if not exists`, `create or replace`), then
  paste it into the SQL Editor. Also append it to `setup.sql`, so a fresh setup
  stays complete.
- **Every new table needs Row Level Security.** Without it, anyone with your
  (public) anon key can read that table. Follow the existing policies, then run
  `npm run test:rls` (needs Docker). It must pass.
- **Money is integer cents.** Never store amounts as floats.

## 7. Before you rely on it

- **Privacy text, in two places:** fill in the `[…]` placeholders in
  `PRIVACY.md` with *your* details and your Supabase region, and replace
  `[your email]` on the in-app privacy page (`src/pages/Privacy.tsx`). For your
  deployment, you are the one responsible for the data.
- **Known limits**, fine for two people, worth fixing before opening it to
  others:
  - Anyone can sign up to your Supabase project until you close sign-up
    (step 5).
  - There's no 2FA, and password reset happens in the Supabase dashboard.
  - Pairing codes use `random()`, which is not a secure random generator, and
    joining a household isn't rate-limited.
  - Once a partner leaves, the household can't pair with someone new. The
    remaining person has to leave and create a fresh household.
- **Inactive projects get paused:** Supabase pauses free-tier projects that
  go unused for a while (check their current terms for how long). The app then
  stops working until you restore the project in the dashboard. Your data is
  kept.
- **Deleted items are erased after 30 days** by a nightly `pg_cron` job, which
  `setup.sql` enables. You can see it under Supabase → Integrations → Cron. While
  the project is paused it doesn't run, so erasure can be late, never early.
- **Backups:** the Supabase free tier doesn't give you downloadable backups.
  Export your data now and then if it matters to you.
