import { useMemo, useState } from 'react';
import {
  useEvents, useAddEvent, useDeleteEvent, useHousehold, useMembers, useMe,
} from '../lib/queries';
import { currentMonth, formatMonth, shiftMonth, todayIso, type MonthKey } from '../lib/money';
import type { CalendarEvent, Member } from '../lib/types';

/**
 * The calendar, as an agenda rather than a month grid.
 *
 * A month grid on a phone gives each day about 40px, which fits a dot and nothing
 * else - you end up tapping a day to find out what is in it. An agenda grouped by
 * day shows the actual content at a glance, which is what you open a shared
 * calendar for. Month navigation is kept for moving around.
 */
export function Calendar() {
  const [month, setMonth] = useState<MonthKey>(currentMonth());
  const [showAdd, setShowAdd] = useState(false);

  const household = useHousehold();
  const members = useMembers();
  const me = useMe();
  const events = useEvents(month);
  const remove = useDeleteEvent();

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m: Member) => [m.id, m])),
    [members.data],
  );

  /** Grouped by calendar day, so the agenda has day headings. */
  const byDay = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    for (const event of events.data ?? []) {
      const day = event.all_day
        ? (event.starts_on ?? '')
        : (event.starts_at ?? '').slice(0, 10);
      const existing = groups.get(day);
      if (existing) existing.push(event);
      else groups.set(day, [event]);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events.data]);

  const today = todayIso();

  return (
    <>
      <div className="inline" style={{ marginBottom: 16 }}>
        <button
          className="button--quiet" aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <strong style={{ flex: 1, textAlign: 'center' }}>{formatMonth(month)}</strong>
        <button
          className="button--quiet" aria-label="Next month"
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>

      <button
        className="button--primary"
        style={{ width: '100%', marginBottom: 16 }}
        onClick={() => setShowAdd((open) => !open)}
      >
        {showAdd ? 'Cancel' : 'Add an event'}
      </button>

      {showAdd && household.data ? (
        <AddEvent
          householdId={household.data.id}
          memberId={me?.id ?? null}
          onDone={() => setShowAdd(false)}
        />
      ) : null}

      {events.isLoading ? <p>Loading…</p> : null}
      {!events.isLoading && byDay.length === 0 ? (
        <p>Nothing planned in {formatMonth(month)}.</p>
      ) : null}

      {byDay.map(([day, dayEvents]) => (
        <section key={day}>
          <h3 style={{ color: day === today ? 'var(--green)' : undefined }}>
            {new Date(`${day}T00:00:00`).toLocaleDateString('de-DE', {
              weekday: 'short', day: 'numeric', month: 'long',
            })}
            {day === today ? ' · today' : ''}
          </h3>
          {dayEvents.map((event) => (
            <div key={event.id} className="row">
              <div className="row__grow">
                <div className="row__name">{event.title}</div>
                <div className="row__meta">
                  {describeTiming(event)}
                  {event.created_by
                    ? ` · ${memberById.get(event.created_by)?.display_name ?? 'former member'}`
                    : ''}
                </div>
                {event.note ? <div className="row__meta">{event.note}</div> : null}
              </div>
              <button
                className="button--quiet" style={{ minWidth: 'var(--tap)' }}
                aria-label={`Delete ${event.title}`}
                onClick={() => void remove.mutateAsync(event.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

function describeTiming(event: CalendarEvent): string {
  if (event.all_day) {
    if (event.ends_on && event.ends_on !== event.starts_on) {
      return `All day, until ${new Date(`${event.ends_on}T00:00:00`)
        .toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`;
    }
    return 'All day';
  }
  const start = new Date(event.starts_at!);
  const time = start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (!event.ends_at) return time;
  const end = new Date(event.ends_at)
    .toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return `${time} – ${end}`;
}

function AddEvent({
  householdId, memberId, onDone,
}: { householdId: string; memberId: string | null; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [startTime, setStartTime] = useState('19:00');
  const [endTime, setEndTime] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = useAddEvent();

  const submit = async () => {
    if (title.trim() === '') {
      setError('Give the event a title.');
      return;
    }
    setError(null);
    try {
      // The two shapes are mutually exclusive, and the database enforces it - so
      // the unused pair is sent as null rather than left undefined.
      await add.mutateAsync({
        household_id: householdId,
        title: title.trim(),
        note: note.trim() || null,
        all_day: allDay,
        starts_on: allDay ? date : null,
        ends_on: null,
        // `new Date('2026-08-21T19:00')` is parsed in local time, which is what
        // "dinner at 19:00" means to the person typing it.
        starts_at: allDay ? null : new Date(`${date}T${startTime}`).toISOString(),
        ends_at: allDay || !endTime ? null : new Date(`${date}T${endTime}`).toISOString(),
        created_by: memberId,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that event.');
    }
  };

  return (
    <div className="stack" style={{ marginBottom: 24 }}>
      <div className="field">
        <label htmlFor="event-title">Title</label>
        <input
          id="event-title" placeholder="Dinner with Ana" value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      <label className="inline" style={{ minHeight: 'var(--tap)' }}>
        <input
          type="checkbox" checked={allDay}
          style={{ width: 24, height: 24, minHeight: 24, flex: 'none' }}
          onChange={(e) => setAllDay(e.target.checked)}
        />
        <span>All day</span>
      </label>

      <div className="field">
        <label htmlFor="event-date">Date</label>
        <input
          id="event-date" type="date" value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {!allDay ? (
        <div className="inline" style={{ alignItems: 'flex-start' }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="event-start">Starts</label>
            <input
              id="event-start" type="time" value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="event-end">Ends</label>
            <input
              id="event-end" type="time" value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="event-note">Note</label>
        <input
          id="event-note" placeholder="Optional" value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      {error ? <div className="field__error">{error}</div> : null}

      <button className="button--primary" onClick={() => void submit()} disabled={add.isPending}>
        {add.isPending ? 'Saving…' : 'Save event'}
      </button>
    </div>
  );
}
