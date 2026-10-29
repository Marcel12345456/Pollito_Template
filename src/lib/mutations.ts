/**
 * Mutation registry.
 *
 * Offline writes are queued, and a queued mutation has to survive the app being
 * closed. That is the constraint that shapes this file: a persisted mutation
 * stores its *key and variables*, never its function - functions cannot be
 * serialised. On reload, TanStack Query has a queue of pending writes and no idea
 * how to perform them.
 *
 * `setMutationDefaults` is the missing half. Each key is registered here with the
 * function that performs it, so a mutation persisted yesterday can be resumed
 * today. Without it, queued writes are silently unresumable - they sit in
 * localStorage forever and the item never reaches the other phone.
 */
import type { QueryClient } from '@tanstack/react-query';
import { requireSupabase } from './supabase';

export const mutationKeys = {
  addExpense: ['addExpense'] as const,
  deleteExpense: ['deleteExpense'] as const,
  addIncome: ['addIncome'] as const,
  deleteIncome: ['deleteIncome'] as const,
  addCategory: ['addCategory'] as const,
  updateCategory: ['updateCategory'] as const,
  archiveCategory: ['archiveCategory'] as const,
  addEvent: ['addEvent'] as const,
  deleteEvent: ['deleteEvent'] as const,
  addShoppingItem: ['addShoppingItem'] as const,
  toggleShoppingItem: ['toggleShoppingItem'] as const,
  clearCheckedItems: ['clearCheckedItems'] as const,
  addTodo: ['addTodo'] as const,
  toggleTodo: ['toggleTodo'] as const,
  deleteTodo: ['deleteTodo'] as const,
};

const now = () => new Date().toISOString();

/** The actual write for each key. Plain functions, so they are testable alone. */
export const mutationFns = {
  addExpense: async (v: Record<string, unknown>) => {
    const { error } = await requireSupabase().from('expense').insert(v);
    if (error) throw error;
  },
  deleteExpense: async (id: string) => {
    const { error } = await requireSupabase()
      .from('expense').update({ deleted_at: now() }).eq('id', id);
    if (error) throw error;
  },
  addIncome: async (v: Record<string, unknown>) => {
    const { error } = await requireSupabase().from('income_entry').insert(v);
    if (error) throw error;
  },
  deleteIncome: async (id: string) => {
    const { error } = await requireSupabase()
      .from('income_entry').update({ deleted_at: now() }).eq('id', id);
    if (error) throw error;
  },
  addCategory: async (v: { name: string; colour: string; householdId: string }) => {
    const { error } = await requireSupabase().from('category')
      .insert({ household_id: v.householdId, name: v.name.trim(), colour: v.colour });
    if (error) throw error;
  },
  updateCategory: async (v: { id: string; name?: string; colour?: string }) => {
    const { id, ...patch } = v;
    const { error } = await requireSupabase().from('category').update(patch).eq('id', id);
    if (error) throw error;
  },
  archiveCategory: async (id: string) => {
    const { error } = await requireSupabase()
      .from('category').update({ archived_at: now() }).eq('id', id);
    if (error) throw error;
  },
  addEvent: async (v: Record<string, unknown>) => {
    const { error } = await requireSupabase().from('event').insert(v);
    if (error) throw error;
  },
  deleteEvent: async (id: string) => {
    const { error } = await requireSupabase()
      .from('event').update({ deleted_at: now() }).eq('id', id);
    if (error) throw error;
  },
  addShoppingItem: async (v: Record<string, unknown>) => {
    const { error } = await requireSupabase().from('shopping_item').insert(v);
    if (error) throw error;
  },
  toggleShoppingItem: async (v: { id: string; checked: boolean; memberId: string | null }) => {
    const { error } = await requireSupabase().from('shopping_item').update({
      checked_at: v.checked ? now() : null,
      checked_by: v.checked ? v.memberId : null,
    }).eq('id', v.id);
    if (error) throw error;
  },
  clearCheckedItems: async (householdId: string) => {
    const { error } = await requireSupabase().from('shopping_item')
      .update({ deleted_at: now() })
      .eq('household_id', householdId)
      .not('checked_at', 'is', null)
      .is('deleted_at', null);
    if (error) throw error;
  },
  addTodo: async (v: Record<string, unknown>) => {
    const { error } = await requireSupabase().from('todo').insert(v);
    if (error) throw error;
  },
  toggleTodo: async (v: { id: string; done: boolean; memberId: string | null }) => {
    const { error } = await requireSupabase().from('todo').update({
      done_at: v.done ? now() : null,
      done_by: v.done ? v.memberId : null,
    }).eq('id', v.id);
    if (error) throw error;
  },
  deleteTodo: async (id: string) => {
    const { error } = await requireSupabase()
      .from('todo').update({ deleted_at: now() }).eq('id', id);
    if (error) throw error;
  },
};

/**
 * Teaches the client how to perform each persisted mutation.
 *
 * Must run before `resumePausedMutations`, and before any component mounts - a
 * mutation resumed without a registered default throws.
 */
export function registerMutationDefaults(client: QueryClient): void {
  for (const [name, key] of Object.entries(mutationKeys)) {
    client.setMutationDefaults(key, {
      mutationFn: mutationFns[name as keyof typeof mutationFns] as (v: unknown) => Promise<void>,
    });
  }
}
