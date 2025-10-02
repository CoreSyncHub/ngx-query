import { inject, Injectable, TransferState } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve } from '@angular/router';
import { QueryClient } from '../core/query-client';

@Injectable({
  providedIn: 'root',
})
export class QueryPreloadResolver implements Resolve<boolean> {
  private readonly queryClient = inject(QueryClient);
  private readonly ts = inject(TransferState);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(route: ActivatedRouteSnapshot): boolean {
    // TODO: lire des data du route, exécuter préchargements et écrire dans TransferState
    // writeToTransferState(this.ts, someKey, someData)
    return true;
  }
}
