/**
 * Data access.
 *
 * Reads go through TanStack Query for caching; freshness comes from Supabase
 * realtime invalidating those caches, rather than from polling or from caching
 * API responses in the service worker. A partner's edit should appear, and a
 * stale cached total is worse than a brief spinner.
 */
import {
  useMutation, useQuery, useQueryClient, onlineManager, type QueryClient,
} from '@tanstack/react-query';
import { mutationKeys, mutationFns } from './mutations';
import { useEffect, useState } from 'react';
import { requireSupabase, supabase } from './supabase';
import { monthRange, type MonthKey } from './money';
import type {
  CalendarEvent, Category, Expense, Household, IncomeEntry, Member, ShoppingItem, Todo,
} from './types';

export const keys = {
  household: ['household'] as const,
  members: ['members'] as const,
  categories: ['categories'] as const,
  income: ['income'] as const,
  expenses: (month: MonthKey) => ['expenses', month] as const,
};

// --- household ------------------------------------------------------------

export function useHousehold() {
  return useQuery({
    queryKey: keys.household,
    queryFn: async (): Promise<Household | null> => {
      const { data, error } = await requireSupabase().from('household').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMembers() {
  return useQuery({
    queryKey: keys.members,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await requireSupabase()
        .from('member').select('*').order('joined_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * The member row for the signed-in user.
 *
 * Two lookups rather than one: RLS scopes `member` to the household, but it does
 * not tell you which of the two rows is you - that needs the auth user id, which
 * only the client has. Cached indefinitely because it cannot change within a
 * session.
 */
export function useMe(): Member | undefined {
  const members = useMembers();
  const user = useQuery({
    queryKey: ['auth-user'] as const,
    queryFn: async () => (await requireSupabase().auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });
  if (!user.data) return undefined;
  return (members.data ?? []).find((m) => m.user_id === user.data) ?? undefined;
}

// --- categories -----------------------------------------------------------

export function useCategories() {
  return useQuery({
    queryKey: keys.categories,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await requireSupabase()
        .from('category').select('*').is('archived_at', null).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.addCategory,
    mutationFn: mutationFns.addCategory,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useUpdateCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.updateCategory,
    mutationFn: mutationFns.updateCategory,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.categories }),
  });
}

export function useArchiveCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.archiveCategory,
    mutationFn: mutationFns.archiveCategory,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.categories }),
  });
}

// --- income ---------------------------------------------------------------

export function useIncome() {
  return useQuery({
    queryKey: keys.income,
    queryFn: async (): Promise<IncomeEntry[]> => {
      const { data, error } = await requireSupabase()
        .from('income_entry').select('*').is('deleted_at', null).order('effective_from');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddIncome() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.addIncome,
    mutationFn: mutationFns.addIncome,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.income }),
  });
}

export function useDeleteIncome() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteIncome,
    mutationFn: mutationFns.deleteIncome,
    onSuccess: () => client.invalidateQueries({ queryKey: keys.income }),
  });
}

/**
 * Income active during a month.
 *
 * Recurring income is stored once with a start date rather than materialised per
 * month, so a salary change does not require editing history - but it does mean
 * "income for March" is a filter, not a lookup.
 */
export function incomeForMonth(entries: IncomeEntry[], month: MonthKey): IncomeEntry[] {
  const { from, to } = monthRange(month);
  return entries.filter((entry) => {
    if (entry.effective_from > to) return false;
    if (entry.effective_to && entry.effective_to < from) return false;
    // A one-off only counts in the month it falls in.
    if (!entry.recurring) return entry.effective_from >= from && entry.effective_from <= to;
    return true;
  });
}

// --- expenses -------------------------------------------------------------

export function useExpenses(month: MonthKey) {
  const { from, to } = monthRange(month);
  return useQuery({
    queryKey: keys.expenses(month),
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await requireSupabase()
        .from('expense').select('*')
        .is('deleted_at', null)
        .gte('spent_on', from)
        .lte('spent_on', to)
        .order('spent_on', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddExpense() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.addExpense,
    mutationFn: mutationFns.addExpense,
    onSuccess: () => client.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

export function useDeleteExpense() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteExpense,
    mutationFn: mutationFns.deleteExpense,
    onSuccess: () => client.invalidateQueries({ queryKey: ['expenses'] }),
  });
}

/**
 * A temporary client-side id for an optimistic row.
 *
 * Deliberately not `crypto.randomUUID()`. That is only available in a *secure
 * context*, so on plain HTTP over a LAN address - exactly how this app gets
 * tested on a phone - it is undefined and throws, which made adding a shopping
 * item fail before it reached the network.
 *
 * Uniqueness only has to hold within one client for a few seconds, until the
 * reconciling refetch replaces the row with the server's. A timestamp plus a
 * counter is more than enough and works everywhere.
 */
let temporaryIdCounter = 0;
function temporaryId(): string {
  temporaryIdCounter += 1;
  return `pending-${Date.now()}-${temporaryIdCounter}`;
}

// --- connectivity ---------------------------------------------------------

/**
 * Online state and the number of writes waiting to be sent.
 *
 * Shown in the UI because a queued write is invisible otherwise: the item is on
 * screen, so the app looks like it saved. Saying "3 waiting" is the difference
 * between trusting the app and wondering whether it lost something.
 */
export function useConnectivity(): { online: boolean; pending: number } {
  const client = useQueryClient();
  const [online, setOnline] = useState(onlineManager.isOnline());
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const unsubscribeOnline = onlineManager.subscribe(setOnline);
    const cache = client.getMutationCache();
    const recount = () => setPending(
      cache.getAll().filter((m) => m.state.status === 'pending' || m.state.isPaused).length,
    );
    recount();
    const unsubscribeCache = cache.subscribe(recount);
    return () => { unsubscribeOnline(); unsubscribeCache(); };
  }, [client]);

  return { online, pending };
}

// --- realtime -------------------------------------------------------------

/**
 * Invalidates caches when the other person changes something.
 *
 * One channel for the whole household rather than one per table: two users
 * generate almost no traffic, and a single subscription is one thing to get
 * right instead of five.
 */
/** Which cache a change to each table invalidates. */
const INVALIDATES: Record<string, readonly unknown[]> = {
  expense: ['expenses'],
  income_entry: keys.income,
  category: keys.categories,
  member: keys.members,
  event: ['events'],
  shopping_item: ['shopping'],
  todo: ['todos'],
};

export function useRealtimeSync(householdId: string | undefined, client: QueryClient) {
  useEffect(() => {
    // Captured in a local so the cleanup closure cannot see a different value
    // than the effect body did.
    const client_ = supabase;
    if (!client_ || !householdId) return;

    const channel = client_.channel(`household:${householdId}`);
    const TABLES = [
      'expense', 'income_entry', 'category', 'member',
      'event', 'shopping_item', 'todo',
    ] as const;
    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
        () => {
          const key = INVALIDATES[table];
          void client.invalidateQueries({ queryKey: key });
        },
      );
    }
    void channel.subscribe();
    return () => { void client_.removeChannel(channel); };
  }, [householdId, client]);
}

// --- calendar -------------------------------------------------------------

/**
 * Events overlapping a month.
 *
 * The overlap test is deliberately inclusive of multi-day events that start
 * before the month or end after it - an event running 28 Feb to 2 Mar belongs in
 * both months, and filtering on the start date alone would hide it from March.
 */
export function useEvents(month: MonthKey) {
  const { from, to } = monthRange(month);
  return useQuery({
    queryKey: ['events', month] as const,
    queryFn: async (): Promise<CalendarEvent[]> => {
      const { data, error } = await requireSupabase()
        .from('event').select('*')
        .is('deleted_at', null)
        // `sort_key` is the generated coalesce of the two start columns, so one
        // range filter covers both timed and all-day events.
        .gte('sort_key', `${from}T00:00:00`)
        .lte('sort_key', `${to}T23:59:59`)
        .order('sort_key');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.addEvent,
    mutationFn: mutationFns.addEvent,
    onSuccess: () => client.invalidateQueries({ queryKey: ['events'] }),
  });
}

export function useDeleteEvent() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteEvent,
    mutationFn: mutationFns.deleteEvent,
    onSuccess: () => client.invalidateQueries({ queryKey: ['events'] }),
  });
}

// --- shopping -------------------------------------------------------------

export function useShoppingItems() {
  return useQuery({
    queryKey: ['shopping'] as const,
    queryFn: async (): Promise<ShoppingItem[]> => {
      const { data, error } = await requireSupabase()
        .from('shopping_item').select('*').is('deleted_at', null).order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddShoppingItem() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.addShoppingItem,
    mutationFn: mutationFns.addShoppingItem,
    onMutate: async (variables: Record<string, unknown>) => {
      await client.cancelQueries({ queryKey: ['shopping'] });
      const previous = client.getQueryData<ShoppingItem[]>(['shopping']);
      // A temporary id, distinguishable so the reconciling refetch can replace
      // it. Never sent to the server - the database assigns the real one.
      const optimistic = {
        id: temporaryId(),
        household_id: String(variables.household_id),
        name: String(variables.name),
        quantity: (variables.quantity as string | null) ?? null,
        added_by: (variables.added_by as string | null) ?? null,
        checked_at: null,
        checked_by: null,
        created_at: new Date().toISOString(),
        deleted_at: null,
      } satisfies ShoppingItem;
      client.setQueryData<ShoppingItem[]>(['shopping'], (current) => [...(current ?? []), optimistic]);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(['shopping'], context.previous);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

/**
 * Ticks an item off, or un-ticks it.
 *
 * Writing a timestamp rather than toggling a boolean means two people ticking the
 * same item at once converge on the same end state instead of flipping each
 * other's change back.
 */
/**
 * Ticks an item off, or un-ticks it.
 *
 * A timestamp rather than a boolean, so two people ticking the same item at once
 * converge instead of flipping each other's change back.
 *
 * Optimistic, and that is not polish: offline the mutation is paused before it
 * reaches the network, so without an immediate cache write the tap appears to do
 * nothing. `onMutate` still runs while paused, which is what makes this work.
 */
export function useToggleShoppingItem() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.toggleShoppingItem,
    mutationFn: mutationFns.toggleShoppingItem,
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: ['shopping'] });
      const previous = client.getQueryData<ShoppingItem[]>(['shopping']);
      client.setQueryData<ShoppingItem[]>(['shopping'], (current) =>
        (current ?? []).map((item) => item.id === variables.id
          ? {
            ...item,
            checked_at: variables.checked ? new Date().toISOString() : null,
            checked_by: variables.checked ? variables.memberId : null,
          }
          : item));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      // Put the list back rather than leaving a lie on screen.
      if (context?.previous) client.setQueryData(['shopping'], context.previous);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

/** Clears everything already ticked off, in one statement. */
export function useClearCheckedItems() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.clearCheckedItems,
    mutationFn: mutationFns.clearCheckedItems,
    onSuccess: () => client.invalidateQueries({ queryKey: ['shopping'] }),
  });
}

// --- to-dos ---------------------------------------------------------------

export function useTodos() {
  return useQuery({
    queryKey: ['todos'] as const,
    queryFn: async (): Promise<Todo[]> => {
      const { data, error } = await requireSupabase()
        .from('todo').select('*').is('deleted_at', null)
        // Undated tasks last: a list sorted with nulls first buries everything
        // that actually has a deadline.
        .order('due_on', { ascending: true, nullsFirst: false })
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.addTodo,
    mutationFn: mutationFns.addTodo,
    onSuccess: () => client.invalidateQueries({ queryKey: ['todos'] }),
  });
}

export function useToggleTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.toggleTodo,
    mutationFn: mutationFns.toggleTodo,
    onMutate: async (variables) => {
      await client.cancelQueries({ queryKey: ['todos'] });
      const previous = client.getQueryData<Todo[]>(['todos']);
      client.setQueryData<Todo[]>(['todos'], (current) =>
        (current ?? []).map((todo) => todo.id === variables.id
          ? {
            ...todo,
            done_at: variables.done ? new Date().toISOString() : null,
            done_by: variables.done ? variables.memberId : null,
          }
          : todo));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(['todos'], context.previous);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['todos'] }),
  });
}

export function useDeleteTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: mutationKeys.deleteTodo,
    mutationFn: mutationFns.deleteTodo,
    onSuccess: () => client.invalidateQueries({ queryKey: ['todos'] }),
  });
}
