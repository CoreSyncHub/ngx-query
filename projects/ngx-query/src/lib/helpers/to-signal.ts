import { effect, signal, Signal } from '@angular/core';
import { Observable } from 'rxjs';

/** Converts an Observable to an Angular Signal, zone-less reading friendly. */
export function toSignal<T>(source$: Observable<T>, initialValue?: T): Signal<T | undefined> {
  const s = signal<T | undefined>(initialValue);
  effect(() => {
    const sub = source$.subscribe((v) => s.set(v));
    return () => sub.unsubscribe();
  });
  return s;
}
