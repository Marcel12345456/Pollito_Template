import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import {
  useExpenses, useIncome, useEvents, useShoppingItems, useTodos, incomeForMonth,
} from '../lib/queries';
import { currentMonth, formatCentsShort, formatMonth, todayIso } from '../lib/money';
import { InstallHint } from '../components/InstallHint';

/**
 * The first page: one tile per feature, each showing its current state.
 *
 * The point of a tile is to answer "do I need to look at this?" without tapping.
 * A tile that only names the feature is a menu item, and a menu is what the tab
 * bar already is.
 */
export function Overview() {
  const month = currentMonth();
  const expenses = useExpenses(month);
  const income = useIncome();
  const events = useEvents(month);
  const shopping = useShoppingItems();
  const todos = useTodos();

  const money = useMemo(() => {
    const spent = (expenses.data ?? []).reduce((total, e) => total + e.amount_cents, 0);
    const earned = incomeForMonth(income.data ?? [], month)
      .reduce((total, e) => total + e.amount_cents, 0);
    return { spent, earned };
  }, [expenses.data, income.data, month]);

  const nextEvent = useMemo(() => {
    const today = todayIso();
    return (events.data ?? []).find((e) => {
      const day = e.all_day ? e.starts_on : e.starts_at?.slice(0, 10);
      return day !== null && day !== undefined && day >= today;
    });
  }, [events.data]);

  const openShopping = (shopping.data ?? []).filter((i) => i.checked_at === null).length;
  const openTodos = (todos.data ?? []).filter((t) => t.done_at === null).length;
  const overdueTodos = (todos.data ?? [])
    .filter((t) => t.done_at === null && t.due_on !== null && t.due_on < todayIso()).length;

  return (
    <>
      <InstallHint />
      <h2>{formatMonth(month)}</h2>

      <div className="tiles">
        <Tile
          to="/calendar" icon="📅" name="Calendar"
          detail={events.isLoading
            ? 'Loading…'
            : nextEvent
              ? `Next: ${nextEvent.title}`
              : 'Nothing planned'}
        />
        <Tile
          to="/shopping" icon="🛒" name="Shopping"
          detail={shopping.isLoading
            ? 'Loading…'
            : openShopping === 0
              ? 'List is empty'
              : `${openShopping} item${openShopping === 1 ? '' : 's'} to get`}
        />
        <Tile
          to="/todos" icon="✅" name="To-do"
          detail={todos.isLoading
            ? 'Loading…'
            : openTodos === 0
              ? 'All clear'
              : `${openTodos} open${overdueTodos > 0 ? `, ${overdueTodos} overdue` : ''}`}
          tone={overdueTodos > 0 ? 'alert' : undefined}
        />
        <Tile
          to="/money" icon="📊" name="Money"
          detail={expenses.isLoading || income.isLoading
            ? 'Loading…'
            : `${formatCentsShort(money.spent)} of ${formatCentsShort(money.earned)}`}
        />
      </div>
    </>
  );
}

function Tile({
  to, icon, name, detail, tone,
}: {
  to: string; icon: string; name: string; detail: string; tone?: 'alert';
}) {
  return (
    <Link className="tile" to={to}>
      <span className="tile__icon" aria-hidden="true">{icon}</span>
      <span className="tile__name">{name}</span>
      <span
        className="tile__detail"
        // Colour is added on top of wording that already says "overdue" - never
        // the only signal.
        style={tone === 'alert' ? { color: 'var(--red)', fontWeight: 600 } : undefined}
      >
        {detail}
      </span>
    </Link>
  );
}
