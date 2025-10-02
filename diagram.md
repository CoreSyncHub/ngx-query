```cs
[Angular app]
  └─ provideQueryClient(QUERY_CONFIG) ───────────────┐
                                                     │
[builders] queryBuilder / mutationBuilder ───────────┤
                                                     │ uses
[core] QueryClient ── owns ──▶ QueryCache ── LRU ────┤
             │                    │                  │
             │                    └─ MutationCache ◀─┤
             │
             ├─ strategies: backoff, polling, stale, gc
             └─ invalidation: byKey | byPredicate | byTag

[angular] resolver + transfer-state + focus/reconnect listeners
[helpers] to-signal | deep-equal | key-hasher
[testing] createTestQueryClient | flushQueries | fakeTimers
```
