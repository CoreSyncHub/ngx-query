import { EnvironmentInjector, inject, Provider } from '@angular/core';
import { QueryConfig } from '../core/types';
import { QUERY_CONFIG } from './tokens';
import { QueryClient } from '../core/query-client';

export function provideQueryClient(config?: Partial<QueryConfig>): Provider[] {
  return [
    { provide: QUERY_CONFIG, useValue: config ?? {} },
    {
      provide: QueryClient,
      useFactory: (cfg: Partial<QueryConfig>) =>
        new QueryClient(cfg, inject(EnvironmentInjector)),
      deps: [QUERY_CONFIG],
    },
  ];
}
