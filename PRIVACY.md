# Privacy

*Last updated: 29 October 2026*

This describes what Pollito does with your data. It is written to be accurate
rather than exhaustive: everything below reflects what the code in this
repository actually does.

> **Fill in before publishing:** the controller name, address and contact email
> marked `[…]` below, and confirm your Supabase region under
> **Settings → General → Region**.
>
> This is a careful draft, not legal advice. If Pollito ever holds data for
> anyone beyond the two of you, have it reviewed.

---

## Does this even need a privacy policy?

Possibly not, and it is worth knowing why.

GDPR Article 2(2)(c) excludes processing carried out "by a natural person in the
course of a purely personal or household activity". Two people tracking their own
shared shopping, calendar and money is close to the centre of that exemption —
there is no commercial purpose, no third party, and no data about anyone outside
the household.

Two caveats keep this document worth having:

- The exemption covers **your** processing. It does not cover Supabase or
  Cloudflare, who process the data as service providers and have their own
  obligations.
- It stops applying the moment Pollito is used by anyone else, or for anything
  other than private household purposes.

So this exists partly as good practice and partly as documentation of where the
data goes.

## Who is responsible

**[Your name]**
**[Your address]**
**[Your email]**

Both household members are joint users of the same data. Each of you can see
everything the other records — that is the purpose of the app, not a side effect.

## What is stored, and why

Nothing is collected beyond what you type in.

| Data | Why | Legal basis if GDPR applies |
|---|---|---|
| Email address and password hash | To sign in. Handled by Supabase Auth; the password is hashed, never stored in readable form | Contract (Art. 6(1)(b)) |
| Display name and colour | So each of you can tell who added what | Contract |
| Income amounts and labels | The shared financial overview | Contract |
| Expenses: amount, category, date, note, who paid | The shared financial overview | Contract |
| Calendar events | The shared calendar | Contract |
| Shopping list and to-do items | The shared lists | Contract |

**There is no analytics, no tracking, no advertising, and no third-party scripts.**
The app loads nothing from any domain other than its own and Supabase. No cookies
are set for tracking; the only stored state is your login session and a local copy
of your own data, both kept on your device.

Financial figures are the most sensitive thing here. They are not special category
data under Article 9, but they are private, and the access rules below are what
protect them.

## Who else processes it

Two providers, both acting as processors on your behalf:

**Supabase** — database and authentication. Your data is stored here. The region
was chosen at project creation and is visible under Settings → General.
*Confirm and state it here: `[region]`.*

**Cloudflare Pages** — serves the app itself. The files it serves contain no
personal data; the app talks to Supabase directly from your browser. Cloudflare
processes connection metadata such as IP addresses in the course of delivering
the page.

If either provider stores data outside the EU or EEA, that transfer relies on
their standard contractual clauses and equivalent safeguards. Nobody else
receives your data. It is never sold, shared, or used to train anything.

## How access is restricted

Each household's data is isolated at the database level using PostgreSQL Row
Level Security. Every table carries a policy that limits access to rows belonging
to the signed-in user's household.

This matters more than usual here, because the key the app carries in your browser
is public by design — anyone can read it out of the page. It grants nothing on its
own. The database policies are the actual boundary, and they are covered by an
automated test suite of 68 assertions, including that an unauthenticated request
returns nothing at all.

## How long it is kept

Until you delete it.

- Individual items are removed when you delete them in the app. They are marked
  deleted first, so that a deletion syncs reliably to the other device, and
  erased for good 30 days later.
- **If one person leaves the household**, their income entries are deleted, and
  shared expenses, events and list items remain — attributed to a former member.
  This is deliberate: erasing them would retroactively change the other person's
  own financial history.
- **When the second person leaves, the household and everything in it is
  deleted.**
- Deleting your account through Supabase removes your login and counts as
  leaving the household, so the rules above apply.
- Signing out, or leaving, removes the copy of the household's data kept on
  that device.

## Your rights

If GDPR applies, you have the right to access your data, correct it, have it
erased, restrict or object to its processing, and receive a copy in a portable
form. You can also complain to a supervisory authority — in Germany, the data
protection authority of your federal state.

In practice most of these are immediate: you can see everything in the app, edit
or delete any of it, and leave the household to trigger the deletion rules above.
For anything else, contact **[your email]**.

## Security

Connections use HTTPS. Passwords are hashed by Supabase Auth and never visible to
the app. Access is restricted by the database policies described above.

Being straightforward about the limits: this is a small private app, not a bank.
There is no two-factor authentication, and a forgotten password is reset from the
Supabase dashboard rather than by email. Choose a password you do not use
elsewhere.

## Children

Pollito is not intended for children and is not offered to them.

## Changes

Any change to how data is handled will be reflected here, with the date at the top
updated. The version history lives in this repository.
