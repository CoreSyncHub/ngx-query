import { InjectionToken } from '@angular/core';
import { QueryConfig } from '../core/types';

/** Injection token for query client configuration */
export const QUERY_CONFIG = new InjectionToken<Partial<QueryConfig>>('QUERY_CONFIG');
