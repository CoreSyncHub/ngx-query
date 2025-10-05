import { EnvironmentInjector, inject, Provider } from '@angular/core';
import { QueryConfig } from '../core/types';
import { QUERY_CLIENT, QUERY_CONFIG } from './tokens';
import { QueryClient } from '../core/query-client';

/**
 * Provides a singleton {@link QueryClient} to the Angular dependency injection system.
 *
 * @param config - Optional partial configuration overriding default {@link QueryConfig} values.
 * @returns An array of {@link Provider} definitions to register in an Angular application.
 *
 * @example
 * ```ts
 * import { bootstrapApplication } from '@angular/platform-browser';
 * import { AppComponent } from './app.component';
 * import { provideQueryClient } from '@coresync/ngx-query';
 *
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     ...provideQueryClient({
 *       retry: 2,
 *       staleTime: 60_000,
 *     }),
 *   ],
 * });
 * ```
 *
 * @remarks
 * This factory wires up a global {@link QueryClient} instance scoped to the provided
 * {@link EnvironmentInjector}. It should typically be registered once at the root of the
 * application. Subsequent calls to {@link injectQueryClient} will resolve this instance.
 *
 * @see QueryClient
 * @see QueryConfig
 * @see injectQueryClient
 *
 * @public
 * @since 0.1.0
 */
export function provideQueryClient(config?: Partial<QueryConfig>): Provider[] {
  return [
    { provide: QUERY_CONFIG, useValue: config ?? {} },
    {
      provide: QUERY_CLIENT,
      useFactory: () => {
        const cfg = inject(QUERY_CONFIG);
        const env = inject(EnvironmentInjector);
        return new QueryClient(cfg, env);
      },
    },
  ];
}
