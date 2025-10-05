import { inject } from '@angular/core';
import { QUERY_CLIENT } from './tokens';
import { QueryClient } from '../core/query-client';

/**
 * Injects the active {@link QueryClient} instance from the Angular dependency injection context.
 *
 * @example
 * ```ts
 * import { injectQueryClient } from '@coresync/ngx-query';
 *
 * @Component({...})
 * export class UserListComponent {
 *   private readonly queryClient = injectQueryClient();
 * }
 * ```
 *
 * @remarks
 * This function must be called in an Angular injection context (e.g. inside a component, directive,
 * pipe, or factory function). It retrieves the singleton {@link QueryClient} previously provided via
 * {@link provideQueryClient}.
 *
 * @see QueryClient
 * @see provideQueryClient
 *
 * @public
 * @since 0.1.0
 */
export function injectQueryClient(): QueryClient {
  return inject(QUERY_CLIENT);
}
