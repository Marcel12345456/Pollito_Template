import { useMemo, useState } from 'react';
import {
  useShoppingItems, useAddShoppingItem, useToggleShoppingItem, useClearCheckedItems,
  useHousehold, useMembers, useMe,
} from '../lib/queries';
import type { Member } from '../lib/types';

/**
 * The shopping list.
 *
 * Optimised for adding fast and ticking off one-handed in a shop: the input
 * stays focused after submitting, and ticked items drop to the bottom rather than
 * vanishing, so an accidental tap is recoverable.
 */
export function Shopping() {
  const household = useHousehold();
  const members = useMembers();
  const me = useMe();
  const items = useShoppingItems();
  const add = useAddShoppingItem();
  const toggle = useToggleShoppingItem();
  const clear = useClearCheckedItems();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');

  const { open, done } = useMemo(() => {
    const rows = items.data ?? [];
    return {
      open: rows.filter((i) => i.checked_at === null),
      done: rows.filter((i) => i.checked_at !== null)
        .sort((a, b) => (b.checked_at ?? '').localeCompare(a.checked_at ?? '')),
    };
  }, [items.data]);

  const memberById = useMemo(
    () => new Map((members.data ?? []).map((m: Member) => [m.id, m])),
    [members.data],
  );

  const submit = async () => {
    const trimmed = name.trim();
    if (trimmed === '' || !household.data) return;
    await add.mutateAsync({
      household_id: household.data.id,
      name: trimmed,
      quantity: quantity.trim() || null,
      added_by: me?.id ?? null,
    });
    setName('');
    setQuantity('');
    // Keep focus so the next item can be typed straight away.
  };

  return (
    <>
      <form
        className="inline"
        style={{ marginBottom: 16, alignItems: 'flex-start' }}
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
      >
        <input
          aria-label="Item"
          placeholder="Add an item"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <input
          aria-label="Quantity"
          placeholder="2 kg"
          style={{ maxWidth: 96 }}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
        <button className="button--primary" type="submit" disabled={name.trim() === ''}>
          Add
        </button>
      </form>

      {open.length === 0 && done.length === 0 ? (
        <p>Nothing on the list. Add something above.</p>
      ) : null}

      {open.map((item) => (
        <label key={item.id} className="row" style={{ cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={false}
            style={{ width: 24, height: 24, minHeight: 24, flex: 'none' }}
            onChange={() => void toggle.mutateAsync({
              id: item.id, checked: true, memberId: me?.id ?? null,
            })}
          />
          <div className="row__grow">
            <div className="row__name">{item.name}</div>
            {item.quantity || item.added_by ? (
              <div className="row__meta">
                {[item.quantity, item.added_by ? memberById.get(item.added_by)?.display_name : null]
                  .filter(Boolean).join(' · ')}
              </div>
            ) : null}
          </div>
        </label>
      ))}

      {done.length > 0 ? (
        <>
          <div
            className="inline"
            style={{ justifyContent: 'space-between', marginTop: 24, marginBottom: 4 }}
          >
            <h3 style={{ margin: 0 }}>In the basket ({done.length})</h3>
            <button
              className="button--quiet"
              onClick={() => {
                if (household.data) void clear.mutateAsync(household.data.id);
              }}
            >
              Clear
            </button>
          </div>
          {done.map((item) => (
            <label key={item.id} className="row" style={{ cursor: 'pointer', opacity: 0.55 }}>
              <input
                type="checkbox"
                checked
                style={{ width: 24, height: 24, minHeight: 24, flex: 'none' }}
                onChange={() => void toggle.mutateAsync({
                  id: item.id, checked: false, memberId: me?.id ?? null,
                })}
              />
              <div className="row__grow">
                <div className="row__name" style={{ textDecoration: 'line-through' }}>
                  {item.name}
                </div>
                {item.checked_by ? (
                  <div className="row__meta">
                    by {memberById.get(item.checked_by)?.display_name ?? 'former member'}
                  </div>
                ) : null}
              </div>
            </label>
          ))}
        </>
      ) : null}
    </>
  );
}
