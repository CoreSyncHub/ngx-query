# @coresync/ngx-query

Minimalistic Query-like library for Angular. RxJS only. DI native. SSR-friendly.

## Installation

npm i @coresync/ngx-query

## Bootstrap

```ts
providers: [provideHttpClient(withFetch()), provideQueryClient({ staleTime: 10_000, retry: 3 })];
```

## Query

```ts
const built = queryBuilder<void, UserDto[]>(queryClient)
  .key(["users"])
  .fetcher((_p, ct) => http.get<UserDto[]>("/api/users", { signal: ct }))
  .staleTime(15_000)
  .select((users) => users.filter((u) => u.role === "Admin"))
  .build();

built.data$.subscribe();
```

## Mutation

```ts
const m = mutationBuilder<CreateUserCommand, UserDto>(queryClient)
  .key(["create-user"])
  .mutateFn((cmd, ct) => http.post<UserDto>("/api/users", cmd, { signal: ct }))
  .optimistic((cmd) => {
    /* setQueryData(['users'], …) */
  })
  .rollback((cmd, err) => {
    /* restore */
  })
  .build();
```

## Invalidation

```ts
queryClient.invalidateQueries((hashedKey) => hashedKey === JSON.stringify(["users"]));
```

## Covered patterns

- StaleTime, Backoff retry, Polling, Focus/Reconnect
- Component side memoized selector
- Optional toSignal interop

## V1 limitations

- No ready-to-use infinite query (TODO: getNextPageParam / typed concat)
- No devtools
- Persistence in plugin (TODO)

## Router / SSR

- `QueryPreloadResolver` + `TransferState` helpers provided (to be specialized).
