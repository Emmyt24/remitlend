/**
 * Remittance domain types shared across the frontend.
 *
 * NOTE: These types describe the API/contract payload shape and MUST stay
 * compatible with existing API consumers, deployed contracts, and persisted
 * data. Progressive disclosure is a purely presentational concern: sensitive
 * fields remain part of the payload but are masked in the UI until the user
 * explicitly reveals them.
 */

export type RemittanceStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

/**
 * Fields on a remittance that are considered sensitive and therefore subject
 * to progressive disclosure (masked by default, revealed on explicit action).
 */
export const SENSITIVE_REMITTANCE_FIELDS = [
  'recipientName',
  'recipientAccount',
  'recipientBank',
  'reference',
] as const;

export type SensitiveRemittanceField =
  (typeof SENSITIVE_REMITTANCE_FIELDS)[number];

/**
 * A remittance record as returned by the API. The shape is unchanged; the
 * sensitive fields below are simply rendered behind progressive disclosure.
 */
export interface Remittance {
  id: string;
  status: RemittanceStatus;
  /** Amount in the smallest unit of `currency` (integer, authoritative). */
  amount: string;
  currency: string;
  createdAt: string;
  updatedAt?: string;
  /** Sensitive: recipient display name. */
  recipientName?: string;
  /** Sensitive: recipient account identifier. */
  recipientAccount?: string;
  /** Sensitive: recipient bank / institution. */
  recipientBank?: string;
  /** Sensitive: free-form payment reference. */
  reference?: string;
}

/**
 * Per-field disclosure state for a single remittance. Kept as a plain map so
 * it can be persisted in component state without changing the API shape.
 */
export type RemittanceDisclosureState = Partial<
  Record<SensitiveRemittanceField, boolean>
>;

/**
 * Bounded rendering limits for remittance lists. Prevents unbounded lists and
 * eager loading of sensitive data.
 */
export const REMITTANCE_PAGE_SIZE = 25;
export const REMITTANCE_MAX_PAGE_SIZE = 100;

/**
 * Clamp a requested page size into the supported, bounded range.
 */
export function clampRemittancePageSize(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return REMITTANCE_PAGE_SIZE;
  }
  const size = Math.floor(requested);
  if (size < 1) {
    return 1;
  }
  return Math.min(size, REMITTANCE_MAX_PAGE_SIZE);
}

/**
 * Mask a sensitive string value for display. Returns a fixed-width mask so the
 * rendered output does not leak the length of the underlying value.
 */
export function maskSensitiveValue(value?: string | null): string {
  if (value === undefined || value === null || value === '') {
    return '\u2014';
  }
  return '\u2022'.repeat(8);
}

/**
 * Resolve the display value for a sensitive field given the current disclosure
 * state. Masked by default; only revealed when explicitly toggled on.
 */
export function resolveSensitiveDisplay(
  field: SensitiveRemittanceField,
  remittance: Pick<Remittance, SensitiveRemittanceField>,
  disclosure: RemittanceDisclosureState,
): string {
  const raw = remittance[field];
  if (disclosure[field] === true) {
    return raw === undefined || raw === null || raw === '' ? '\u2014' : raw;
  }
  return maskSensitiveValue(raw);
}

/**
 * Toggle disclosure for a single sensitive field without mutating the input.
 */
export function toggleSensitiveField(
  disclosure: RemittanceDisclosureState,
  field: SensitiveRemittanceField,
): RemittanceDisclosureState {
  return { ...disclosure, [field]: disclosure[field] !== true };
}
