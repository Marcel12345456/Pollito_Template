import { useMemo, useState } from 'react';
import {
  useCategories, useExpenses, useIncome, useMembers, useHousehold,
  useAddExpense, useDeleteExpense, incomeForMonth,
} from '../lib/queries';
import {
  currentMonth, formatCents, formatMonth, shiftMonth, parseAmountToCents, todayIso,
  type MonthKey,
} from '../lib/money';
import type { Category, Member } from '../lib/types';

/**
 * The financial overview.
 *
 * Transparency, not settlement: both people see all income and all expenses, and
 * nothing computes who owes whom. `paid_by` is displayed so the split of
 * spending is visible, but it never produces a balance.
 */
export function Money() {
  const [month, setMonth] = useState<MonthKey>(currentMonth());
  const [showAdd, setShowAdd] = useState(false);

  const household = useHousehold();
  const members = useMembers();
  const categories = useCategories();
  const income = useIncome();
  const expenses = useExpenses(month);

  const totals = useMemo(() => {
    const rows = expenses.data ?? [];
    const spent = rows.reduce((sum, e) => sum + e.amount_cents, 0);
    const active = incomeForMonth(income.data ?? [], month);
    const earned = active.reduce((sum, e) => sum + e.amount_cents, 0);

    const byCategory = new Map<string, number>();
    for (const row of rows) {
      const key = row.category_id ?? 'uncategorised';
      byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount_cents);
    }

    const byMember = new Map<string, number>();
    for (const row of rows) {
      if (!row.paid_by) continue;
      byMember.set(row.paid_by, (byMember.get(row.paid_by) ?? 0) + row.amount_cents);
    }

    const incomeByMember = new Map<string, number>();
    for (const entry of active) {
      incomeByMember.set(entry.member_id,
        (incomeByMember.get(entry.member_id) ?? 0) + entry.amount_cents);
    }

    return { spent, earned, byCategory, byMember, incomeByMember };
  }, [expenses.data, income.data, month]);

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m) => [m.id, m])),
    [members.data],
  );

  const remaining = totals.earned - totals.spent;

  return (
    <>
      <MonthPicker month={month} onChange={setMonth} />

      <div className="stack" style={{ marginBottom: 20 }}>
        <SummaryRow label="Income" cents={totals.earned} />
        <SummaryRow label="Spent" cents={totals.spent} />
        <SummaryRow
          label={remaining >= 0 ? 'Left' : 'Over'}
          cents={Math.abs(remaining)}
          tone={remaining >= 0 ? 'good' : 'bad'}
        />
      </div>

      {members.data && members.data.length > 0 ? (
        <>
          <h3>Per person</h3>
          {members.data.map((member) => (
            <div key={member.id} className="row">
              <span className="swatch" style={{ background: member.colour }} aria-hidden="true" />
              <div className="row__grow">
                <div className="row__name">{member.display_name}</div>
                <div className="row__meta">
                  earned {formatCents(totals.incomeByMember.get(member.id) ?? 0)}
                </div>
              </div>
              <span className="amount">{formatCents(totals.byMember.get(member.id) ?? 0)}</span>
            </div>
          ))}
          <p className="field__hint">
            Amounts on the right are what each person paid. Nothing is settled up —
            this is a shared picture, not a ledger.
          </p>
        </>
      ) : null}

      <h3>By category</h3>
      {totals.byCategory.size === 0 ? (
        <p>No spending recorded for {formatMonth(month)}.</p>
      ) : (
        [...totals.byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([categoryId, cents]) => {
            const category = categoryById.get(categoryId);
            const share = totals.spent > 0 ? (cents / totals.spent) * 100 : 0;
            return (
              <div key={categoryId} className="row">
                <span
                  className="swatch"
                  style={{ background: category?.colour ?? '#94a3b8' }}
                  aria-hidden="true"
                />
                <div className="row__grow">
                  <div className="row__name">{category?.name ?? 'Uncategorised'}</div>
                  <div className="bar" style={{ marginTop: 6 }}>
                    <div
                      className="bar__fill"
                      style={{ width: `${share}%`, background: category?.colour ?? '#94a3b8' }}
                    />
                  </div>
                </div>
                <span className="amount">{formatCents(cents)}</span>
              </div>
            );
          })
      )}

      <h3>Expenses</h3>
      <button
        className="button--primary"
        style={{ width: '100%', marginBottom: 12 }}
        onClick={() => setShowAdd((open) => !open)}
      >
        {showAdd ? 'Cancel' : 'Add an expense'}
      </button>

      {showAdd && household.data ? (
        <AddExpense
          householdId={household.data.id}
          categories={categories.data ?? []}
          members={members.data ?? []}
          onDone={() => setShowAdd(false)}
        />
      ) : null}

      <ExpenseList
        month={month}
        categoryById={categoryById}
        memberById={memberById}
      />
    </>
  );
}

function MonthPicker({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <div className="inline" style={{ marginBottom: 16 }}>
      <button
        className="button--quiet"
        aria-label="Previous month"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        ‹
      </button>
      <strong style={{ flex: 1, textAlign: 'center' }}>{formatMonth(month)}</strong>
      <button
        className="button--quiet"
        aria-label="Next month"
        // Future months hold nothing but let you plan; capped at the current
        // month so the arrow does not invite endless empty screens.
        disabled={month >= currentMonth()}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        ›
      </button>
    </div>
  );
}

function SummaryRow(
  { label, cents, tone }: { label: string; cents: number; tone?: 'good' | 'bad' },
) {
  const colour = tone === 'good' ? 'var(--green)' : tone === 'bad' ? 'var(--red)' : 'inherit';
  return (
    <div className="inline" style={{ justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="amount" style={{ color: colour, fontSize: 18 }}>{formatCents(cents)}</span>
    </div>
  );
}

function AddExpense({
  householdId, categories, members, onDone,
}: {
  householdId: string; categories: Category[]; members: Member[]; onDone: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '');
  const [paidBy, setPaidBy] = useState<string>(members[0]?.id ?? '');
  const [spentOn, setSpentOn] = useState(todayIso());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddExpense();

  const submit = async () => {
    const cents = parseAmountToCents(amount);
    if (cents === null || cents === 0) {
      // A typo becoming a zero-euro expense is worse than an error message.
      setError('Enter an amount, for example 12,50');
      return;
    }
    setError(null);
    try {
      await add.mutateAsync({
        household_id: householdId,
        amount_cents: cents,
        category_id: categoryId || null,
        note: note.trim() || null,
        spent_on: spentOn,
        entered_by: paidBy || null,
        paid_by: paidBy || null,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that expense.');
    }
  };

  return (
    <div className="stack" style={{ marginBottom: 20 }}>
      <div className="field">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          // `decimal` gives a keypad with a separator, unlike `numeric`.
          inputMode="decimal"
          placeholder="12,50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <div className="field__hint">Comma or dot, both work.</div>
      </div>

      <div className="field">
        <label htmlFor="category">Category</label>
        <select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="paid-by">Paid by</label>
        <select id="paid-by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="spent-on">Date</label>
        <input
          id="spent-on" type="date" value={spentOn} max={todayIso()}
          onChange={(e) => setSpentOn(e.target.value)}
        />
        <div className="field__hint">When it was spent, not when you typed it.</div>
      </div>

      <div className="field">
        <label htmlFor="note">Note</label>
        <input
          id="note" placeholder="Optional" value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error ? <div className="field__error">{error}</div> : null}

      <button className="button--primary" onClick={() => void submit()} disabled={add.isPending}>
        {add.isPending ? 'Saving…' : 'Save expense'}
      </button>
    </div>
  );
}

function ExpenseList({
  month, categoryById, memberById,
}: {
  month: MonthKey;
  categoryById: Map<string, Category>;
  memberById: Map<string, Member>;
}) {
  const expenses = useExpenses(month);
  const remove = useDeleteExpense();

  if (expenses.isLoading) return <p>Loading…</p>;
  if (!expenses.data || expenses.data.length === 0) {
    return <p>Nothing recorded yet this month.</p>;
  }

  return (
    <>
      {expenses.data.map((expense) => {
        const category = expense.category_id ? categoryById.get(expense.category_id) : undefined;
        const payer = expense.paid_by ? memberById.get(expense.paid_by) : undefined;
        return (
          <div key={expense.id} className="row">
            <span
              className="swatch"
              style={{ background: category?.colour ?? '#94a3b8' }}
              aria-hidden="true"
            />
            <div className="row__grow">
              <div className="row__name">{expense.note || category?.name || 'Expense'}</div>
              <div className="row__meta">
                {new Date(`${expense.spent_on}T00:00:00`).toLocaleDateString('de-DE', {
                  day: 'numeric', month: 'short',
                })}
                {payer ? ` · ${payer.display_name}` : ''}
                {category && expense.note ? ` · ${category.name}` : ''}
              </div>
            </div>
            <span className="amount">{formatCents(expense.amount_cents)}</span>
            <button
              className="button--quiet"
              style={{ minWidth: 'var(--tap)' }}
              aria-label={`Delete ${expense.note || category?.name || 'expense'}`}
              onClick={() => void remove.mutateAsync(expense.id)}
            >
              ✕
            </button>
          </div>
        );
      })}
    </>
  );
}
