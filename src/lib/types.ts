/** Row shapes, matching the migrations in supabase/migrations. */

export interface Household {
  id: string;
  pairing_code: string;
  pairing_open: boolean;
  currency: string;
  created_at: string;
}

export interface Member {
  id: string;
  household_id: string;
  /** Null once the person has left; their shared expenses still reference them. */
  user_id: string | null;
  display_name: string;
  colour: string;
  joined_at: string;
  left_at: string | null;
}

export interface Category {
  id: string;
  household_id: string;
  name: string;
  colour: string;
  is_default: boolean;
  archived_at: string | null;
}

export interface IncomeEntry {
  id: string;
  household_id: string;
  member_id: string;
  amount_cents: number;
  label: string | null;
  recurring: boolean;
  effective_from: string;
  effective_to: string | null;
  deleted_at: string | null;
}

export interface Expense {
  id: string;
  household_id: string;
  entered_by: string | null;
  /** Recorded for provenance and per-person views; never used to compute a balance. */
  paid_by: string | null;
  amount_cents: number;
  category_id: string | null;
  note: string | null;
  spent_on: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * A calendar event, either timed or all-day.
 *
 * The two cases are mutually exclusive and enforced by a check constraint. An
 * all-day event carries dates because "the 14th" is the 14th wherever you are;
 * a timed event carries instants because 19:00 is a specific moment.
 */
export interface CalendarEvent {
  id: string;
  household_id: string;
  title: string;
  note: string | null;
  all_day: boolean;
  starts_at: string | null;
  ends_at: string | null;
  starts_on: string | null;
  ends_on: string | null;
  /**
   * Trigger-maintained: whichever start applies, so timed and all-day events
   * sort and range-filter through one index. Never written by the client.
   */
  sort_key: string;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ShoppingItem {
  id: string;
  household_id: string;
  name: string;
  /** Free text: "2 kg", "a bunch", "the big one". */
  quantity: string | null;
  added_by: string | null;
  /** Null means still outstanding. */
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface Todo {
  id: string;
  household_id: string;
  title: string;
  note: string | null;
  /** Null means either of us. */
  assigned_to: string | null;
  due_on: string | null;
  done_at: string | null;
  done_by: string | null;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
}
