import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';

/**
 * Centralized query key factory for financial resources.
 *
 * Single source of truth for query keys so that mutations can invalidate
 * every dependent financial query (list + detail + history/events) without
 * over-invalidating unrelated caches. Keys are plain, serializable arrays
 * to remain compatible with persisted query caches and existing consumers.
 */
export const financialQueryKeys = {
  all: ['financial'] as const,
  remittances: {
    all: ['financial', 'remittances'] as const,
    list: (filters?: Record<string, unknown>) =>
      ['financial', 'remittances', 'list', filters ?? {}] as const,
    detail: (id: string) => ['financial', 'remittances', 'detail', id] as const,
    history: (id: string) =>
      ['financial', 'remittances', 'history', id] as const,
  },
  loans: {
    all: ['financial', 'loans'] as const,
    list: (filters?: Record<string, unknown>) =>
      ['financial', 'loans', 'list', filters ?? {}] as const,
    detail: (id: string) => ['financial', 'loans', 'detail', id] as const,
    events: (id: string) => ['financial', 'loans', 'events', id] as const,
  },
  scores: {
    all: ['financial', 'scores'] as const,
    detail: (subjectId: string) =>
      ['financial', 'scores', 'detail', subjectId] as const,
  },
  notifications: {
    all: ['financial', 'notifications'] as const,
    list: (filters?: Record<string, unknown>) =>
      ['financial', 'notifications', 'list', filters ?? {}] as const,
  },
};

/**
 * Centralized invalidation helpers.
 *
 * Each helper invalidates only the financial resource subtree it owns, so a
 * remittance mutation never blows away loan or score caches. Callers can
 * still invalidate the whole `financial` root when a cross-resource change
 * genuinely requires it.
 */
export const financialInvalidation = {
  invalidateRemittances: (queryClient: ReturnType<typeof useQueryClient>) =>
    queryClient.invalidateQueries({ queryKey: financialQueryKeys.remittances.all }),
  invalidateRemittance: (
    queryClient: ReturnType<typeof useQueryClient>,
    id: string,
  ) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: financialQueryKeys.remittances.detail(id),
      }),
      queryClient.invalidateQueries({
        queryKey: financialQueryKeys.remittances.history(id),
      }),
      queryClient.invalidateQueries({
        queryKey: financialQueryKeys.remittances.all,
      }),
    ]),
  invalidateLoans: (queryClient: ReturnType<typeof useQueryClient>) =>
    queryClient.invalidateQueries({ queryKey: financialQueryKeys.loans.all }),
  invalidateLoan: (
    queryClient: ReturnType<typeof useQueryClient>,
    id: string,
  ) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: financialQueryKeys.loans.detail(id),
      }),
      queryClient.invalidateQueries({
        queryKey: financialQueryKeys.loans.events(id),
      }),
      queryClient.invalidateQueries({
        queryKey: financialQueryKeys.loans.all,
      }),
    ]),
  invalidateScores: (queryClient: ReturnType<typeof useQueryClient>) =>
    queryClient.invalidateQueries({ queryKey: financialQueryKeys.scores.all }),
  invalidateNotifications: (queryClient: ReturnType<typeof useQueryClient>) =>
    queryClient.invalidateQueries({
      queryKey: financialQueryKeys.notifications.all,
    }),
};

export interface Remittance {
  id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  recipient: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemittanceHistoryEntry {
  id: string;
  remittanceId: string;
  status: Remittance['status'];
  timestamp: string;
  note?: string;
}

export interface RemittanceFilters {
  status?: Remittance['status'];
  currency?: string;
  limit?: number;
  offset?: number;
}

/**
 * Shared query options for financial resources.
 *
 * Explicitly defines retry, stale-data, and dependency-failure behavior so
 * authorization failures (401/403) are not retried, transient failures are
 * retried with bounded backoff, and stale data is surfaced while refetching.
 */
const financialQueryOptions = {
  staleTime: 30_000,
  retry: (failureCount: number, error: unknown) => {
    const status = (error as { status?: number } | undefined)?.status;
    // Never retry authorization or client errors; they will not succeed.
    if (status && status >= 400 && status < 500) {
      return false;
    }
    // Bounded retries for transient/dependency failures.
    return failureCount < 3;
  },
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
};

export function useRemittances(filters?: RemittanceFilters) {
  return useQuery({
    queryKey: financialQueryKeys.remittances.list(filters),
    queryFn: async () => {
      const response = await apiClient.get<Remittance[]>('/remittances', {
        params: filters,
      });
      return response.data;
    },
    ...financialQueryOptions,
  });
}

export function useRemittance(id: string) {
  return useQuery({
    queryKey: financialQueryKeys.remittances.detail(id),
    queryFn: async () => {
      const response = await apiClient.get<Remittance>(`/remittances/${id}`);
      return response.data;
    },
    enabled: Boolean(id),
    ...financialQueryOptions,
  });
}

export function useRemittanceHistory(id: string) {
  return useQuery({
    queryKey: financialQueryKeys.remittances.history(id),
    queryFn: async () => {
      const response = await apiClient.get<RemittanceHistoryEntry[]>(
        `/remittances/${id}/history`,
      );
      return response.data;
    },
    enabled: Boolean(id),
    ...financialQueryOptions,
  });
}

export interface CreateRemittanceInput {
  amount: number;
  currency: string;
  recipient: string;
}

export function useCreateRemittance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateRemittanceInput) => {
      const response = await apiClient.post<Remittance>('/remittances', input);
      return response.data;
    },
    onSuccess: (remittance) => {
      // Invalidate the list plus the new detail/history so dependent views
      // refetch from the authoritative source without touching other caches.
      financialInvalidation.invalidateRemittances(queryClient);
      if (remittance?.id) {
        financialInvalidation.invalidateRemittance(queryClient, remittance.id);
      }
    },
  });
}

export function useUpdateRemittanceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: Remittance['status'];
    }) => {
      const response = await apiClient.patch<Remittance>(`/remittances/${id}`, {
        status,
      });
      return response.data;
    },
    onSuccess: (_data, variables) => {
      financialInvalidation.invalidateRemittance(queryClient, variables.id);
    },
  });
}
