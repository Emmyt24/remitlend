import { useCallback, useMemo, useState } from 'react';

/**
 * Remittance record as returned by the API. The shape is intentionally left
 * open so we stay compatible with existing API consumers and persisted data.
 */
export interface Remittance {
  id: string;
  [key: string]: unknown;
}

/**
 * Fields that are considered sensitive and must be masked by default.
 * Progressive disclosure: these are only revealed after an explicit user
 * action (toggle/expand) for a specific remittance.
 */
export const SENSITIVE_REMITTANCE_FIELDS = [
  'accountNumber',
  'routingNumber',
  'iban',
  'swift',
  'recipientName',
  'recipientEmail',
  'recipientPhone',
  'address',
] as const;

export type SensitiveRemittanceField = (typeof SENSITIVE_REMITTANCE_FIELDS)[number];

const MASK = '••••••••';

/**
 * Bounded rendering: never eagerly load or render more than this many
 * remittances at once. Keeps resource usage predictable for large datasets.
 */
export const MAX_VISIBLE_REMITTANCES = 50;

function isSensitiveField(key: string): key is SensitiveRemittanceField {
  return (SENSITIVE_REMITTANCE_FIELDS as readonly string[]).includes(key);
}

/**
 * Redact sensitive fields on a single remittance. Non-sensitive fields are
 * passed through untouched so existing consumers keep working.
 */
export function redactRemittance(remittance: Remittance): Remittance {
  const redacted: Remittance = { ...remittance };
  for (const key of Object.keys(redacted)) {
    if (isSensitiveField(key)) {
      redacted[key] = MASK;
    }
  }
  return redacted;
}

/**
 * Redact sensitive fields across a bounded slice of remittances.
 */
export function redactRemittances(remittances: Remittance[]): Remittance[] {
  return remittances.slice(0, MAX_VISIBLE_REMITTANCES).map(redactRemittance);
}

export interface UseRemittancesResult {
  /** Remittances with sensitive fields masked unless explicitly revealed. */
  remittances: Remittance[];
  /** Ids of remittances whose sensitive data has been revealed. */
  revealedIds: string[];
  /** Whether a given remittance's sensitive data is currently revealed. */
  isRevealed: (id: string) => boolean;
  /** Explicitly reveal sensitive data for a single remittance. */
  reveal: (id: string) => void;
  /** Re-mask sensitive data for a single remittance. */
  conceal: (id: string) => void;
  /** Toggle disclosure for a single remittance. */
  toggle: (id: string) => void;
  /** Re-mask every remittance (e.g. on navigation or logout). */
  concealAll: () => void;
}

/**
 * Progressive disclosure hook for sensitive remittance data.
 *
 * Sensitive fields are masked by default and only revealed through an
 * explicit user action. Rendering is bounded to MAX_VISIBLE_REMITTANCES.
 */
export function useRemittances(input: Remittance[] = []): UseRemittancesResult {
  const [revealedIds, setRevealedIds] = useState<string[]>([]);

  const bounded = useMemo(
    () => input.slice(0, MAX_VISIBLE_REMITTANCES),
    [input],
  );

  const remittances = useMemo(
    () =>
      bounded.map((remittance) =>
        revealedIds.includes(remittance.id)
          ? remittance
          : redactRemittance(remittance),
      ),
    [bounded, revealedIds],
  );

  const isRevealed = useCallback(
    (id: string) => revealedIds.includes(id),
    [revealedIds],
  );

  const reveal = useCallback((id: string) => {
    if (!id) return;
    setRevealedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const conceal = useCallback((id: string) => {
    setRevealedIds((prev) => prev.filter((existing) => existing !== id));
  }, []);

  const toggle = useCallback((id: string) => {
    if (!id) return;
    setRevealedIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }, []);

  const concealAll = useCallback(() => {
    setRevealedIds([]);
  }, []);

  return { remittances, revealedIds, isRevealed, reveal, conceal, toggle, concealAll };
}

export default useRemittances;
