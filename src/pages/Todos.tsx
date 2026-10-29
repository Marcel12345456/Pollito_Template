import { useMemo, useState } from 'react';
import {
  useTodos, useAddTodo, useToggleTodo, useDeleteTodo, useHousehold, useMembers, useMe,
} from '../lib/queries';
import { todayIso } from '../lib/money';
import type { Member, Todo } from '../lib/types';

/**
 * The to-do list.
 *
 * Assignment is optional and "Either of us" is a first-class choice, not a
 * fallback - forcing every task onto one person is how a shared list turns into
 * an argument.
 */
export function Todos() {
  const household = useHousehold();
  const members = useMembers();
  const me = useMe();
  const todos = useTodos();
  const add = useAddTodo();
  const toggle = useToggleTodo();
  const remove = useDeleteTodo();

  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [expanded, setExpanded] = useState(false);

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m: Member) => [m.id, m])),
    [members.data],
  );

  const { open, done } = useMemo(() => {
    const rows = todos.data ?? [];
    return {
      open: rows.filter((t) => t.done_at === null),
      done: rows.filter((t) => t.done_at !== null)
        .sort((a, b) => (b.done_at ?? '').localeCompare(a.done_at ?? '')),
    };
  }, [todos.data]);

  const submit = async () => {
    const trimmed = title.trim();
    if (trimmed === '' || !household.data) return;
    await add.mutateAsync({
      household_id: household.data.id,
      title: trimmed,
      note: null,
      assigned_to: assignedTo || null,
      due_on: dueOn || null,
      created_by: me?.id ?? null,
    });
    setTitle('');
    setDueOn('');
    setExpanded(false);
  };

  return (
    <>
      <form
        className="stack"
        style={{ marginBottom: 20 }}
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <div className="inline" style={{ alignItems: 'flex-start' }}>
          <input
            aria-label="Task"
            placeholder="Add a task"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setExpanded(true)}
          />
          <button className="button--primary" type="submit" disabled={title.trim() === ''}>
            Add
          </button>
        </div>

        {expanded ? (
          <div className="inline" style={{ alignItems: 'flex-start' }}>
            <select
              aria-label="Assign to"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">Either of us</option>
              {(members.data ?? []).filter((m) => m.left_at === null).map((m) => (
                <option key={m.id} value={m.id}>{m.display_name}</option>
              ))}
            </select>
            <input
              aria-label="Due date"
              type="date"
              value={dueOn}
              min={todayIso()}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </div>
        ) : null}
      </form>

      {open.length === 0 && done.length === 0 ? <p>Nothing to do. Enjoy it.</p> : null}

      {open.map((todo) => (
        <TodoRow
          key={todo.id}
          todo={todo}
          member={todo.assigned_to ? memberById.get(todo.assigned_to) : undefined}
          onToggle={() => void toggle.mutateAsync({
            id: todo.id, done: true, memberId: me?.id ?? null,
          })}
          onDelete={() => void remove.mutateAsync(todo.id)}
        />
      ))}

      {done.length > 0 ? (
        <>
          <h3>Done ({done.length})</h3>
          {done.map((todo) => (
            <TodoRow
              key={todo.id}
              todo={todo}
              member={todo.done_by ? memberById.get(todo.done_by) : undefined}
              onToggle={() => void toggle.mutateAsync({
                id: todo.id, done: false, memberId: me?.id ?? null,
              })}
              onDelete={() => void remove.mutateAsync(todo.id)}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

/** Overdue and due-today are called out in words as well as colour. */
function dueLabel(dueOn: string | null): { text: string; tone: 'overdue' | 'today' | 'later' } | null {
  if (!dueOn) return null;
  const today = todayIso();
  if (dueOn < today) return { text: 'Overdue', tone: 'overdue' };
  if (dueOn === today) return { text: 'Today', tone: 'today' };
  return {
    text: new Date(`${dueOn}T00:00:00`).toLocaleDateString('de-DE', {
      day: 'numeric', month: 'short',
    }),
    tone: 'later',
  };
}

const TONE_COLOUR = {
  overdue: 'var(--red)',
  today: 'var(--amber)',
  later: 'var(--muted)',
} as const;

function TodoRow({
  todo, member, onToggle, onDelete,
}: {
  todo: Todo;
  member: Member | undefined;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isDone = todo.done_at !== null;
  const due = isDone ? null : dueLabel(todo.due_on);

  return (
    <div className="row" style={isDone ? { opacity: 0.55 } : undefined}>
      <input
        type="checkbox"
        checked={isDone}
        aria-label={isDone ? `Reopen ${todo.title}` : `Complete ${todo.title}`}
        style={{ width: 24, height: 24, minHeight: 24, flex: 'none' }}
        onChange={onToggle}
      />
      <div className="row__grow">
        <div
          className="row__name"
          style={isDone ? { textDecoration: 'line-through' } : undefined}
        >
          {todo.title}
        </div>
        <div className="row__meta">
          {[
            member ? member.display_name : (isDone ? null : 'Either of us'),
            due ? due.text : null,
          ].filter(Boolean).map((part, index) => (
            <span
              key={index}
              style={index === 1 && due ? { color: TONE_COLOUR[due.tone], fontWeight: 600 } : undefined}
            >
              {index > 0 ? ' · ' : ''}{part}
            </span>
          ))}
        </div>
      </div>
      <button
        className="button--quiet"
        style={{ minWidth: 'var(--tap)' }}
        aria-label={`Delete ${todo.title}`}
        onClick={onDelete}
      >
        ✕
      </button>
    </div>
  );
}
