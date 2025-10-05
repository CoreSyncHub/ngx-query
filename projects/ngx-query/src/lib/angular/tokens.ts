import { InjectionToken } from '@angular/core';
import { QueryConfig } from '../core/types';
import { QueryClient } from '../core/query-client';

/** Injection token for query client configuration */
export const QUERY_CONFIG = new InjectionToken<Partial<QueryConfig>>(
  'QUERY_CONFIG'
);

/** Injection token for the global QueryClient instance */
export const QUERY_CLIENT = new InjectionToken<QueryClient>('QUERY_CLIENT');
