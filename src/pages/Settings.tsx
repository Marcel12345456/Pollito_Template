import { useState } from 'react';
import { Section } from '../components/Section';
import { InstallSection } from '../components/InstallSection';
import {
  useCategories, useAddCategory, useUpdateCategory, useArchiveCategory,
  useHousehold, useMembers, useIncome, useAddIncome, useDeleteIncome,
} from '../lib/queries';
import { Link } from 'react-router-dom';
import { formatCents, parseAmountToCents, todayIso } from '../lib/money';

/**
 * Categories are free text.
 *
 * The seeded set is a starting point, not a taxonomy: anything can be renamed,
 * recoloured, archived, or added by typing. Categories are the part of this app
 * touched most often, so they belong to the household rather than to the
 * developer.
 */
const PALETTE = [
  '#166534', '#1e40af', '#0f766e', '#7c2d12', '#b45309',
  '#4c1d95', '#be123c', '#a21caf', '#475569', '#065f46',
];

/**
 * Settings is a set of collapsed panels rather than one long scroll.
 *
 * Income and Categories are unbounded lists, so with everything expanded the
 * screen showed its *contents* before it showed its *structure* — Household and
 * Privacy sat below a fold that grew every time a category was added.
 *
 * Install is deliberately not collapsible. It is the one thing here somebody is
 * hunting for when they cannot find it, so hiding it behind a tap would defeat
 * the reason it was moved to this screen.
 */
export function Settings() {
  return (
    <>
      <InstallSection />
      <IncomeSection />
      <CategorySection />
      <HouseholdSection />
      <LegalSection />
    </>
  );
}

/**
 * The privacy policy, reachable.
 *
 * An internal route rather than an external URL: the placeholders here used to
 * point at example.com, which would have 404'd for anyone who tapped them.
 */
function LegalSection() {
  return (
    <Section id="privacy" title="Privacy" summary="No analytics, no third parties">
      <p>
        No analytics, no tracking, no third parties beyond the database and the
        host. Both of you see everything; nobody else sees anything.
      </p>
      <Link
        to="/privacy"
        className="button"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none',
        }}
      >
        Read the privacy policy
      </Link>
    </Section>
  );
}

function IncomeSection() {
  const members = useMembers();
  const household = useHousehold();
  const income = useIncome();
  const add = useAddIncome();
  const remove = useDeleteIncome();

  const [memberId, setMemberId] = useState('');
  const [amount, setAmount] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const cents = parseAmountToCents(amount);
    if (cents === null || cents === 0) {
      setError('Enter an amount, for example 2400');
      return;
    }
    if (!memberId || !household.data) {
      setError('Pick who this income belongs to.');
      return;
    }
    setError(null);
    await add.mutateAsync({
      household_id: household.data.id,
      member_id: memberId,
      amount_cents: cents,
      label: label.trim() || null,
      // Recurring by default: a salary is the common case, and storing it once
      // with a start date means changing it later does not rewrite history.
      recurring: true,
      effective_from: todayIso(),
      effective_to: null,
    });
    setAmount('');
    setLabel('');
  };

  // Collapsed one-liner: the combined figure is the thing worth knowing without
  // opening the panel.
  const monthlyTotal = (income.data ?? [])
    .reduce((sum, entry) => sum + entry.amount_cents, 0);
  const summary = (income.data ?? []).length === 0
    ? 'Not set up yet'
    : `${formatCents(monthlyTotal)} combined`;

  return (
    <Section id="income" title="Income" summary={summary}>
      <p>
        Recorded per person, because income is personal. It is context for the
        shared picture — nothing is split or settled.
      </p>

      {(income.data ?? []).map((entry) => {
        const owner = members.data?.find((m) => m.id === entry.member_id);
        return (
          <div key={entry.id} className="row">
            <span
              className="swatch"
              style={{ background: owner?.colour ?? '#94a3b8' }}
              aria-hidden="true"
            />
            <div className="row__grow">
              <div className="row__name">{owner?.display_name ?? 'Former member'}</div>
              <div className="row__meta">
                {entry.label || (entry.recurring ? 'Monthly' : 'One-off')}
                {` · from ${entry.effective_from}`}
              </div>
            </div>
            <span className="amount">{formatCents(entry.amount_cents)}</span>
            <button
              className="button--quiet" style={{ minWidth: 'var(--tap)' }}
              aria-label={`Remove income for ${owner?.display_name ?? 'former member'}`}
              onClick={() => void remove.mutateAsync(entry.id)}
            >
              ✕
            </button>
          </div>
        );
      })}

      <h3>Add income</h3>
      <div className="stack">
        <div className="field">
          <label htmlFor="income-member">Person</label>
          <select
            id="income-member" value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="">Choose…</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.display_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="income-amount">Monthly amount</label>
          <input
            id="income-amount" inputMode="decimal" placeholder="2400"
            value={amount} onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="income-label">Label</label>
          <input
            id="income-label" placeholder="Salary" value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        {error ? <div className="field__error">{error}</div> : null}
        <button className="button--primary" onClick={() => void submit()} disabled={add.isPending}>
          Add income
        </button>
      </div>
    </Section>
  );
}

function CategorySection() {
  const household = useHousehold();
  const categories = useCategories();
  const add = useAddCategory();
  const update = useUpdateCategory();
  const archive = useArchiveCategory();

  const [name, setName] = useState('');
  const [colour, setColour] = useState(PALETTE[0]!);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Give the category a name.');
      return;
    }
    if (!household.data) return;
    const clash = (categories.data ?? [])
      .some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (clash) {
      // The database enforces this too; catching it here gives a better message
      // than a unique-constraint error.
      setError(`You already have a category called “${trimmed}”.`);
      return;
    }
    setError(null);
    await add.mutateAsync({ name: trimmed, colour, householdId: household.data.id });
    setName('');
  };

  const count = (categories.data ?? []).length;
  const summary = count === 1 ? '1 category' : `${count} categories`;

  return (
    <Section id="categories" title="Categories" summary={summary}>
      <p>Rename, recolour or archive any of these, and add your own.</p>

      {(categories.data ?? []).map((category) => (
        <div key={category.id} className="row">
          <span className="swatch" style={{ background: category.colour }} aria-hidden="true" />
          {editing === category.id ? (
            <>
              <input
                className="row__grow" value={editName} autoFocus
                aria-label={`Rename ${category.name}`}
                onChange={(e) => setEditName(e.target.value)}
              />
              <button
                className="button--primary"
                onClick={() => {
                  const trimmed = editName.trim();
                  if (trimmed) void update.mutateAsync({ id: category.id, name: trimmed });
                  setEditing(null);
                }}
              >
                Save
              </button>
            </>
          ) : (
            <>
              <div className="row__grow">
                <div className="row__name">{category.name}</div>
              </div>
              <button
                className="button--quiet"
                onClick={() => { setEditing(category.id); setEditName(category.name); }}
              >
                Rename
              </button>
              <button
                className="button--quiet" style={{ minWidth: 'var(--tap)' }}
                aria-label={`Archive ${category.name}`}
                // Archived, not deleted: past expenses keep pointing at it, so
                // deleting would blank the category on historical rows.
                onClick={() => void archive.mutateAsync(category.id)}
              >
                ✕
              </button>
            </>
          )}
        </div>
      ))}

      <h3>Add a category</h3>
      <div className="stack">
        <div className="field">
          <label htmlFor="cat-name">Name</label>
          <input
            id="cat-name" placeholder="Anything you like" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
          />
        </div>
        <div className="field">
          <label>Colour</label>
          <div className="inline inline--wrap">
            {PALETTE.map((option) => (
              <button
                key={option}
                className="chip"
                aria-label={`Colour ${option}`}
                aria-pressed={colour === option}
                style={{ background: option, color: option, minWidth: 44 }}
                onClick={() => setColour(option)}
              >
                {colour === option ? '✓' : ' '}
              </button>
            ))}
          </div>
        </div>
        {error ? <div className="field__error">{error}</div> : null}
        <button className="button--primary" onClick={() => void submit()} disabled={add.isPending}>
          Add category
        </button>
      </div>
    </Section>
  );
}

function HouseholdSection() {
  const household = useHousehold();
  const members = useMembers();
  const active = (members.data ?? []).filter((m) => m.left_at === null);

  const pairing = household.data?.pairing_open === true;

  return (
    <Section
      id="household"
      title="Household"
      summary={pairing ? 'Waiting for the second person' : active.map((m) => m.display_name).join(' and ')}
      // Open by default while unpaired: the pairing code is the one thing that
      // is useless if it cannot be found.
      defaultOpen={pairing}
    >
      {household.data?.pairing_open ? (
        <div className="notice notice--warn">
          <strong>Waiting for the second person.</strong>
          <div style={{ marginTop: 4 }}>
            Share this code: <strong>{household.data.pairing_code}</strong>
          </div>
          <div style={{ marginTop: 4, fontSize: 13 }}>
            It stops working once they join.
          </div>
        </div>
      ) : (
        <div className="notice">
          {active.map((m) => m.display_name).join(' and ')} — paired.
        </div>
      )}
    </Section>
  );
}
