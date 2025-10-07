# 🌀 NGX Query

> A minimal, reactive, and type-safe data-fetching library for Angular — inspired by TanStack Query.

[![npm version](https://img.shields.io/npm/v/@coresync/ngx-query.svg?logo=npm)](https://www.npmjs.com/package/@coresync/ngx-query)
[![Angular](https://img.shields.io/badge/angular-20%2B-DD0031?logo=angular)](https://angular.dev)
[![RxJS](https://img.shields.io/badge/rxjs-7%2B-B7178C?logo=reactivex)](https://rxjs.dev)
[![License](https://img.shields.io/npm/l/@coresync/ngx-query.svg)](LICENSE)

---

## 📖 Overview

**NGX Query** is a lightweight, **observable-based** query library built specifically for **Angular**.  
It helps you manage **server state**, **caching**, and **synchronization** between your backend and UI — all without boilerplate.

It takes the best ideas from **TanStack Query** but rethinks them for Angular’s ecosystem, not just as an adapter for React concepts :

- Native **Dependency Injection** instead of context providers
- **RxJS Observables** instead of Promises

---

## ✨ Features

- ✅ **Observable-first** — built for Angular, not adapted from React.
- 🧠 **Fluent API** — declare queries and mutations with expressive builders.
- 🔁 **Caching & Invalidation** — configurable stale and GC times, precise invalidation.
- ⚡ **Optimistic Updates** — instant UI feedback with rollback on error.
- 🔄 **Refetch on Focus & Reconnect** — stay synced with network and tab activity.
- 🧩 **Error & Retry Strategies** — configurable backoff and retry handling.

---

## 🚀 Installation

```bash
npm install @coresync/ngx-query
```

or

```bash
yarn add @coresync/ngx-query
# or pnpm / bun
```

> Requires **Angular 20+** and **RxJS 7+**

---

## ⚡ Quick Start

### 1. Provide the QueryClient

```ts
// app.config.ts
import { ApplicationConfig } from "@angular/core";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideQueryClient } from "@coresync/ngx-query";

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(withFetch()),
    provideQueryClient({
      staleTime: 60_000,
      gcTime: 10 * 60_000,
      retry: 3,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    }),
  ],
};
```

### 2. Create a Query

```ts
import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { HttpClient } from "@angular/common/http";
import { queryBuilder, injectQueryClient } from "@coresync/ngx-query";

interface UserDto {
  id: string;
  name: string;
}

@Component({
  standalone: true,
  selector: "user-list",
  imports: [CommonModule],
  template: `
    <h2>Users</h2>
    @if (users$ | async; as users) {
    <ul>
      @for (user of users; track user.id) {
      <li>{{ user.name }}</li>
      }
    </ul>
    }
  `,
})
export class UserListComponent {
  private http = inject(HttpClient);
  private queryClient = injectQueryClient();

  users$ = queryBuilder<UserDto[]>(this.queryClient)
    .key(["users"])
    .fetcher(() => this.http.get<UserDto[]>("/api/users"))
    .build().data$;
}
```

### 3. Mutate Data

```ts
import { mutationBuilder, injectQueryClient } from "@coresync/ngx-query";

const queryClient = injectQueryClient();

const createUser = mutationBuilder<UserDto, CreateUserInput>(queryClient)
  .key(["users", "create"])
  .affects(["users"])
  .mutateFn((input) => http.post<UserDto>("/api/users", input))
  .build();
```

---

## 🧩 API Highlights

| Feature              | Description                                                           |
| -------------------- | --------------------------------------------------------------------- |
| `queryBuilder`       | Creates reactive, observable queries with caching and status tracking |
| `mutationBuilder`    | Builds mutations with optimistic updates and invalidation             |
| `provideQueryClient` | Configures global cache and retry policies                            |
| `injectQueryClient`  | Retrieves the current QueryClient from DI                             |

---

## 🔮 Roadmap

| Feature                | Status      |
| ---------------------- | ----------- |
| ✅ Queries & Mutations | Implemented |
| ✅ Optimistic Updates  | Implemented |
| 🧪 Infinite Queries    | Planned     |
| ⚡ Query Suspense      | Planned     |
| ⚙️ SSR / TransferState | Planned     |
| 🧰 DevTools            | Planned     |

---

## 🧱 Comparison with TanStack Query

> The comparison below refers specifically to **@tanstack/angular-query-experimental.**

| Aspect             | TanStack Query (Angular Adapter)                                                                                             | NGX Query                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Maturity           | Experimental, API evolving                                                                                                   | Experimental, API evolving                                                          |
| Angular support    | Angular v16+                                                                                                                 | Angular v20+                                                                        |
| Core primitives    | **Signals-centric** API with `injectQuery/injectMutation` returning signal-like getters (`data()`, `error()`, `isPending()`) | **Observable-first** streams with a fluent builder (`queryBuilder/mutationBuilder`) |
| Fetcher style      | Typically **Promise-based**                                                                                                  | **Observable-based** by default; no Promise requirement                             |
| Optimistic updates | Supported via mutation options                                                                                               | Supported via `optimistic`, `rollback`, `onSuccess` methods                         |

Both projects share the same goal: robust server-state management. Choose based on your app’s primitives: signals + promises vs observables + builders.

---

## 📚 Documentation

Full documentation with examples and guides is available at:  
👉 [https://doc.coresync.fr/ngx-query](https://doc.coresync.fr/ngx-query/overview)

---

## 💡 Philosophy

> _“Keep it reactive, declarative, and Angular-native.”_

NGX Query aims to give Angular developers the **power of React Query**,  
but in a form that fits naturally into Angular’s ecosystem — DI, Observables, and Signals.

---

## ⚖️ License

[MIT License](LICENSE) © 2025 CoreSyncHub
