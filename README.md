# Pollito

A shared app for exactly two people: calendar, shopping list, to-do list, and a
joint financial overview.

Delivered as an **installable PWA** rather than a native app. For a private
two-person app the native route costs $99/year for an Apple Developer account, or
re-signing the iPhone build every 7 days. A PWA installs from a URL on both
phones with no store, no review and no expiry — and since the calendar is in-app
only, there is no native integration being given up.

Want your own copy? See [`FORKING.md`](FORKING.md).

## The constraint that shapes everything

**Exactly two people, who know each other.** No roles, no permissions, no member
management, no invitations beyond a single pairing code. Most of what makes a
"shared app" expensive is the N-user case. This is not it, and the simplification
is taken deliberately rather than left as an accident — building for "maybe more
people later" would roughly double the work.

## Money model: transparency, not settlement

Both people see all income and all expenses. There is **no** who-owes-whom
ledger, no splitting, no settling up. Income is recorded per person because it is
personal; expenses are recorded at household level because they are shared.

`paid_by` is stored but never used to compute a balance — it exists so the
overview can say "you spent €400, I spent €300" without any settlement
machinery. If the model ever needs to become a ledger, that column is the seam.

## Three schema decisions worth stating

**Integer cents, never floats.** Money in floating point is a bug waiting for a
rounding boundary.

**`spent_on` is separate from `created_at`.** You enter yesterday's coffee today.
Reports need the date it happened, not the date it was typed.

**Soft delete via `deleted_at`.** Makes sync tractable, and makes the leaving
question below answerable at all.

## What happens when one person leaves

Decided up front, because it is a schema decision now and a migration later:

- **Shared expenses survive**, re-attributed to a former member. Deleting them
  would retroactively change the *other* person's historical totals, which is
  worse than an awkward label.
- **Personal income entries are deleted.** They were never shared data.
- **The household is removed only when both members have left.**

## Legal surface

There is no App Review here, which makes the obligations easier to skip and worse
to get wrong. Two people storing income and expenses means **GDPR applies**: a
lawful basis, a privacy policy, data minimisation, and a working deletion path.
Financial data about an identifiable second person is the sensitive part.

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | Vite + React + TypeScript | No SSR needed for a private app; leanest path to an installable PWA |
| PWA | `vite-plugin-pwa` | Service worker, manifest, update handling |
| Backend | Supabase | Postgres for the money queries, realtime for sync |
| Auth | Email + password | Magic links needed Supabase to send mail, and the built-in service is capped at ~2/hour and documented as test-only. A password needs no SMTP provider, has no quota, and cannot start costing money. Forgotten passwords are reset from the dashboard |
| Security | Row Level Security | **The anon key is public by design — RLS is the actual boundary, not the key** |
| Hosting | Cloudflare Pages (direct upload) | Free with no build-minute quota, and HTTPS is required for service workers |

## Deploying

`git push` to `main` builds and deploys via GitHub Actions
(`.github/workflows/deploy.yml`). `npm run deploy` does the same from a laptop.

The project name and production branch are set only in `package.json`, so there
is one copy to get wrong. The public domain is the repository variable
`PAGES_DOMAIN`:

| | Value |
|---|---|
| Pages project | `pollito` (in `package.json`) |
| Public domain | repository variable `PAGES_DOMAIN`, e.g. `pollito-abc.pages.dev` |
| Production branch | `production`, **not** `main` |

The production branch is the trap. `wrangler pages deploy --branch main` exits 0
and prints "Success", but lands a *preview* deployment on its own hash URL while
the public domain keeps serving the previous build. A green deploy proves
nothing; the workflow's last step polls the public domain until it serves the
bundle hash that was just built, and fails if it never does.

The project was created by direct upload, and [Cloudflare does not allow
switching those to Git integration](https://developers.cloudflare.com/pages/get-started/direct-upload/) —
that would mean a new project, a new hostname, and therefore a reinstall of the
PWA on both phones. Hence Actions calling `wrangler` rather than a Git-connected
Pages project.

Four repository secrets, under **Settings → Secrets and variables → Actions**:

| Secret | Notes |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Custom token, **Account → Cloudflare Pages → Edit** only |
| `CLOUDFLARE_ACCOUNT_ID` | Not a credential; it appears in dashboard URLs |
| `VITE_SUPABASE_URL` | Inlined into the bundle at build time |
| `VITE_SUPABASE_ANON_KEY` | Also inlined, and **public by design** — RLS is the boundary |

Plus one repository **variable**, `PAGES_DOMAIN` (e.g. `pollito-abc.pages.dev`),
which the verify step polls. Without it the deploy job is skipped, not failed.

The last two are secrets only for tidiness: both are readable in the shipped
JavaScript by anyone who opens devtools. Treat a leak of them as a non-event and
a leak of `CLOUDFLARE_API_TOKEN` as the real one.
