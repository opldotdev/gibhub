# AGENTS.md — working on gibhub.net

gibhub.net is the web viewer for [gib](https://github.com/b-open-io/gib),
on-chain git on BSV. It reads repositories, branches and files from the
1sat-stack overlay at `https://api.1sat.app` and connects to the visitor's
BRC-100 wallet in the browser to mint and burn branch heads.

For what the site *shows*, read [README.md](README.md) and
[skills/gibhub/SKILL.md](skills/gibhub/SKILL.md). This file is for changing it.

## Skills

| Skill | For |
| --- | --- |
| [`skills/gibhub`](skills/gibhub/SKILL.md) | Using and changing this site: routes, lib modules, the overlay and ORDFS calls, the wallet operations. |

This repository is not a monorepo, so `skills/` at the root is the only
copy — there is nothing to mirror it to. Add a skill as
`skills/<name>/SKILL.md` with frontmatter `name` and a trigger-rich
`description`, and list it here.

## Terminology (non-negotiable)

Always **"repository origin"**, never bare "origin". Three things called
"origin" live within a page of each other: a repository's genesis
`ordfs/dir` root outpoint (this one), an ordinal's own origin, and git's
conventional remote name. Comments, error strings, docs and commit messages
all spell it out. The route parameter is `[origin]` and `HeadRecord.origin`
is the field name; the prose around them says "repository origin".

## Build, test, lint

```sh
bun install
bun dev            # next dev on :8266
bun run lint       # biome check
bun run typecheck  # tsc --noEmit
bun test           # bun's runner over lib/*.test.ts
bun run build      # next build
bun run lint:fix   # biome check --write .
bun run start      # next start, after a build
```

All of lint, typecheck, test and build must be clean before a commit.
Bun, not npm.

`.github/workflows/verify.yml` runs the same four on every pull request and
every push to `main`, and **pins `bun-version: 1.4.2`** with
`bun install --frozen-lockfile`. `bun.lock` is written by that bun; a
different bun rewrites the lockfile and the frozen install fails. The CI
build is given `NEXT_PUBLIC_ONESAT_STACK_URL=https://api.1sat.app` and
`NEXT_PUBLIC_APP_URL=https://gibhub.net`.

`main` auto-deploys to https://gibhub.net through Vercel. A merge is a
deploy; there is no separate release step.

## Layout

### `app/` — routes

| Route | Renders |
| --- | --- |
| `/` | Explore: 20 most recent repositories and 20 most recent pushes. |
| `/r/[origin]` | Repository: branch heads, the default branch's file tree, the README. |
| `/r/[origin]/tree/[ref]/[[...path]]` | Directory listing at a ref and path. A file path redirects to `blob`. |
| `/r/[origin]/blob/[ref]/[...path]` | One file: text with syntax highlighting, image, or a download link. A directory path redirects to `tree`. |
| `/r/[origin]/commits/[...ref]` | Push history of one branch, paged by overlay `score` through `?from=`. |
| `/r/[origin]/commit/[head]` | One head: its commit object, the same commit on other heads, the heads that build on it, Branch. |
| `/c/[sha]` | A git commit as a DAG node, independent of repository: every head publishing it, its parents, its children. |
| `/u/[identity]` | A publisher: repositories and pushes under one 66-hex identity key. |
| `/me` | The connected wallet's own branches (`components/my-repos.tsx`). Client-only. |
| `/api/handles` | `GET ?handle=…` — BRC-169 resolution through the server's shared cache. |
| `/manifest.json` | Web app manifest, the BRC-73 grouped permissions block, the BRC-180 overlay declaration, and `babbage.trust`. |

`app/layout.tsx` wraps everything in `ThemeProvider` → `QueryProvider` →
`WalletProvider` and the site header/footer. `app/error.tsx` and
`app/not-found.tsx` are the boundaries.

A `[ref]` is a **head outpoint** (`txid_vout`) in every generated link, so
links never rot. A branch name is accepted too and resolves to that
branch's current head — see `lib/resolve-ref.ts`.

### `lib/` — the modules that matter

| Module | Owns |
| --- | --- |
| `stack.ts` | `STACK_URL` (`NEXT_PUBLIC_ONESAT_STACK_URL`, default `https://api.1sat.app`), `APP_URL`, and `GIB_BASKET`. |
| `gib-api.ts` | Typed client for the overlay REST API under `/1sat/gib`. The `HeadRecord`, `RepoRecord`, `Commit` and `Spend` shapes. 404 → `null`, anything else throws. |
| `ordfs.ts` | ORDFS reads: `/content/…` URLs, `ordfs/dir` manifest decoding, bulk metadata, path walking, text fetch, `.gib` metadata. |
| `gib-lookup.ts` | The overlay's BRC-24 lookup service `ls_gib` at `/1sat/gib/overlay/lookup`. The `branches` query and its `BranchRecord` / `BranchesResult` shapes. |
| `gib-submit.ts` | Handing a minted head to `tm_gib`: the submission BEEF (head transaction last) and the BRC-22 POST. |
| `gib-wallet.ts` | The three wallet operations: `mintHead`, `burnHead`, `branchFromHead`. The token vocabulary lives here. |
| `gib-head.ts` | Decodes a head from its own locking script — six bare PushDrop fields — and reads its commit from the root's `.git` store, both with no overlay round trip. |
| `resolve-ref.ts` | A URL ref → a `HeadRecord`: outpoint (immutable) or branch name (current head). |
| `handles.ts` | BRC-169: the handle grammar, manifest discovery, the resolve endpoint, the cache, and `verifyHandle`. Isomorphic and pure where it can be. |
| `handles-server.ts` | The one shared resolver instance, on `globalThis`. Server only. |
| `routes.ts` | Every internal URL. Build links here, never by hand. |
| `format.ts` | `txid_vout` handling (`toOrdinalOutpoint`, `outpointTxid`, `outpointVout`), shortening, `timeAgo`, commit-message splitting. |
| `explorer.ts` | Block explorer links (bananablocks.com). |
| `empty.ts` | The browser stand-in `next.config.ts` aliases `xdelta3-wasm` to. |

`lib/format.test.ts`, `lib/ordfs.test.ts`, `lib/gib-head.test.ts`,
`lib/gib-lookup.test.ts`, `lib/gib-submit.test.ts` and `lib/handles.test.ts`
are the test suite. Nothing in them touches the network or a wallet: the
ones that need a response stub `globalThis.fetch` and restore it, because
the new head format is not on api.1sat.app yet and there is nothing live to
test against.

### `components/`, `providers/`

`components/ui/` is shadcn/ui (new-york), copied from 1satwallet.com and
excluded from Biome in `biome.json`. Everything above it is this site's own.

The wallet-touching ones are `connect-wallet-button.tsx`, `my-repos.tsx`,
`branch-button.tsx` and `delete-branch-button.tsx`; all four are `"use
client"` and reach the wallet only through `useWallet()` from `@1sat/react`.

`providers/wallet-provider.tsx` is `@1sat/react`'s `WalletProvider` with
`autoReconnect autoDetect`. `providers/query-provider.tsx` is a TanStack
Query client with `staleTime: 30s, retry: 1`.

There is no `hooks/` directory. Client state is react-query plus component
state; add a hook only when two components need the same one.

## The data model

A **repository origin** is the outpoint of the genesis `ordfs/dir` root,
written `txid_vout`. It identifies the repository and never changes.

A **commit head** is a 1-satoshi PushDrop output with **nothing inscribed
on it**. Its fields, in order, are

```
["gib", <repository origin>, <branch>, <root>, <identity>, <branched-from>]
```

as UTF-8 strings, locked under protocol `[1, "gib branch"]` with
`keyID` = the **root** outpoint and counterparty `anyone`. The coin is filed
in basket `gib` under tags `origin:<o>`, `branch:<n>` and `commit:<sha>`,
minted under the action label `gib push` and burned under `gib delete`.

**The commits moved into the tree.** A published root is git's tree for the
tip commit plus a `.git` directory holding every commit object reachable
from it, named by sha, with a `.` entry pointing at the tip's object. gib
strips `.git` before hashing, so the tree still verifies against what git
computed, and a commit already on chain is cited at its outpoint rather
than republished — which is why branching copies nothing.

**The five-field head with an inscribed commit is a different format and
does not decode.** There is no migration and no compatibility path;
`lib/gib-head.test.ts` pins the refusal.

Pushing spends the previous head into the next one, so **a head's spend
chain is the branch history**. `HeadRecord.prev` walks back;
`HeadRecord.spend` walks forward — `spend.next` present is a push,
`spend.next` absent is a branch deletion.

**`branchedFrom` is the second parent.** It is empty on an ordinary push,
whose only parent is the head it spends; it is set on a branch's first head,
naming the head it forked from, and on a merge *alongside* the spend. So
`branchedFrom` **with** `prev` is a merge and `branchedFrom` **without** one
is where a branch began — that is the discriminator the UI uses, in
`components/head-list.tsx` and on `/r/[origin]/commit/[head]`.

`root` is the `ordfs/dir` outpoint of the tree *at that head*. **File
browsing always goes through `head.root`**, never through the repository
origin. Every page does this: `app/r/[origin]/page.tsx`,
`tree/…` and `blob/…` all call `resolvePath(head.root, path)` or
`loadDirectory(head.root)`.

`lib/ordfs.ts:loadRepoMeta` is the one deliberate exception: it reads
`.gib` through the repository origin, because it wants the genesis `.gib`
and wants a name without an overlay round trip.

**`.git` is gib's, not the project's.** Every user-facing listing passes
through `withoutGitStore`, and the tree and blob routes `notFound()` a path
that starts with `.git` (`isGitStorePath`). The store is read on purpose in
exactly one place, `loadGitStoreTip`, which walks root → `.git` → `.` with
the light `loadManifest` rather than `loadDirectory`: a store names every
commit reachable from the tip, and enriching thousands of entries with bulk
metadata to read one of them would be absurd.

## How it connects to everything else

### The overlay (`/1sat/gib` on `STACK_URL`)

All of these are `GET`, JSON, and wrapped in `lib/gib-api.ts`.

| Route | Returns |
| --- | --- |
| `/repos` | `RepoRecord[]` — recently active repositories. |
| `/identity/{identity}/repos` | `RepoRecord[]` — repositories one identity publishes to. |
| `/repo/{origin}` | `RepoResponse`: the repository plus `branchHeads`. |
| `/repo/{origin}/branches` | `HeadRecord[]` — current heads, optionally `?identity=`. |
| `/repo/{origin}/branch/{name}` | `BranchResponse`: the current `head` and the `history` of that branch. |
| `/head/{outpoint}` | One `HeadRecord`. |
| `/commit/{sha}` | `CommitResponse`: the heads publishing that commit and the heads building on it. |
| `/heads` | `HeadRecord[]` filtered by `origin`, `branch`, `identity`, `unspent`. |

Paging is `limit` / `from` (an overlay `score`) / `rev`. `404` becomes
`null`; anything else throws. Server components pass a `revalidate` window
(30 s by default) which is applied only when `typeof window === "undefined"`.

### The BRC-24 lookups (`/1sat/gib/overlay/lookup`, `lib/gib-lookup.ts`)

`ls_gib` answers three queries, each naming its `type`; a BRC-24 answer
carries its payload in `result`, **JSON-encoded as a string**.

| `type` | Asks for |
| --- | --- |
| `branches` | A repository's branches, each with its tip, plus `defaultBranch` and `owner` from the genesis push. |
| `headsSince` | One branch's heads from a point forward, each with its BEEF. |
| `txs` | Whole transactions by txid, as one merged BEEF, at most 50. |

The site wraps `branches` and nothing else: `headsSince` and `txs` are what
a client cloning a repository needs, and this site browses through ORDFS.

**`branches` is the branch list, and `.gib` is not.** Every page rendering
`RepoHeader` fetches it and hands it down: it is the only source that says
which branches exist per publisher, which ones nobody extends any more
(`spent`), and which branch a clone starts from. `.gib`'s `defaultBranch` is
a label its publisher wrote; `branches.defaultBranch` is the branch of the
repository's genesis push, which is what the chain shows. Prefer the
lookup, fall back to `.gib`, and only then to the `main`/`master` guess in
`defaultBranchHead`.

### Submitting a head (`/1sat/gib/overlay/submit`, `lib/gib-submit.ts`)

**Nothing indexes a head off the chain any more.** The gib module has no
queue, no event bridge, no sync worker and no JungleBus subscription: a
head enters `tm_gib` when a client submits it over BRC-22 and never
otherwise. A head this site mints and does not submit is on chain and
invisible, forever.

So `mintHead` submits. Admission judges the push from the submitted BEEF
alone with no network fetch, so the submission carries, besides the head
transaction: the transaction holding its `root`, the one holding that
root's `.git` store, and — when the token names one — the one holding the
branched-from head. Those come from `/1sat/beef/{txid}`.

An atomic BEEF would prune everything the head does not spend, and a push's
content is not an ancestor of the head, so the body is a **BEEF V2 with the
head transaction last**: that is the transaction the engine judges, and
`buildSubmission` moves it there explicitly because `sortTxs` has no reason
to. `lib/gib-submit.test.ts` pins that.

A failed submission is **not** a failed mint — the coin is on chain either
way — so `mintHead` returns `submitted: false` and the Branch toast says so
rather than reporting an error.

### ORDFS (`/content` and `/1sat/ordfs` on `STACK_URL`)

| Request | Returns |
| --- | --- |
| `GET /content/{outpoint}` | The resolved file bytes, patch chains applied by the gateway. |
| `GET /content/{root}/path/to/file` | The same, resolved through a directory tree. |
| `GET /content/{outpoint}?raw=true` | The record's own bytes — how a directory manifest is read. |
| `POST /1sat/ordfs/metadata` | `{ outpoints }` → content type and length for up to 100 outpoints. |
| `GET /1sat/ordfs/metadata/{outpoint}` | The same for one. |

The gateway applies `ordfs/patch` (vcdiff) chains itself. The site never
does: `next.config.ts` aliases `xdelta3-wasm` to `lib/empty.ts` in the
browser bundle, because `@1sat/actions` imports it lazily and its Node
loader wants `fs`.

### The wallet

`@1sat/react`'s `WalletProvider` auto-detects the 1Sat browser extension,
a desktop wallet on `localhost:3321` and XDM hosts. Connecting calls
`waitForAuthentication`, then `getPublicKey({ identityKey: true })`, and
polls `isAuthenticated`. Everything after that goes through
`lib/gib-wallet.ts`.

The permissions the site needs are declared as a BRC-73 grouped request in
`app/manifest.json/route.ts`, so a wallet can ask once at connect time
instead of prompting per call. Adding a wallet call means adding it there —
see [Wallet permissions](#wallet-permissions).

### Heads without the overlay

`lib/gib-head.ts:decodeHeadScript` rebuilds a `HeadRecord` from a locking
script: six bare PushDrop fields, tolerating 36-byte raw outpoints and a
33-byte raw identity as well as the text forms this site writes. `/me` uses
it, so **"my repositories" works with no gib overlay at all** — a repository
you published is yours to see before any indexer catches up. `score` and
`height` are `0` there (unknown locally) and `spend` is absent (the wallet
only returns spendable coins).

**The commit is not on the token, so `/me` reads it from the tree.**
`loadTipCommit(head.root)` follows the root's `.git` store to its `.` entry
and parses the commit object; `components/my-repos.tsx` does it in a second
react-query keyed on the roots, so the branch list renders from the token
immediately and the commit subjects fill in. That keeps the page's whole
point intact — it is an ORDFS read, not a gib overlay round trip, so a head
the indexer has never seen still shows its commit. Going to
`/1sat/gib/head/{outpoint}` for the commit would have been one fetch
instead of two and was rejected for exactly that reason.

### The gib CLI

The Go CLI at https://github.com/b-open-io/gib writes the heads this site
reads, and its `internal/token` package is the reference for the token
vocabulary. `lib/gib-wallet.ts` mirrors it field for field so a head minted
in the browser is indistinguishable from a CLI push. Its fixtures
(`internal/testdata/ts-fixtures.json`) are the pinned bytes; if this site
and that package disagree, this site is wrong.

## Conventions

**Server components by default.** Every page under `app/` except `/me` is a
server component with `export const revalidate = 30`, fetching through
`lib/gib-api.ts` and `lib/ordfs.ts` with `next: { revalidate }`. `"use
client"` is for the wallet, TanStack Query, and interactive widgets, and
nothing else.

**Handle resolution is server-side.** `lib/handles-server.ts` holds one
resolver on `globalThis` so a page listing twenty commits by one author
asks that author's domain once, and so the manifest and binding caches are
shared across requests. Client components do not resolve handles
themselves; they call `/api/handles` and apply the verification rule
locally with `matchAuthorHandles`.

**Client data is TanStack Query.** Keys in use: `["gib-basket", identityKey]`,
`["repo-meta", origin]`, `["handles", handleKeys]`. After a mint or a burn,
invalidate `["gib-basket"]`.

**Do not reimplement anything the @1sat SDK provides.** This is the
standing rule and it has teeth:

- Manifest decoding is `dirDecode` / `dirNameString` from `@1sat/actions`.
- Script building and decoding are `pushDropLock`, `pushDropDecode`,
  `unlockByScript`, `completeSignedAction`, `pushDropCustomInstructions`,
  `stampManagedOutputIds` from `@1sat/actions`.
- Never hand-roll PushDrop, B, or OP_RETURN scripts here.
- BEEF assembly is `@bsv/sdk`'s `Beef`. `@1sat/client`'s `OverlayClient`
  cannot serve the submit here: its `submit` hard-codes
  `/1sat/overlay/submit`, and gib's engine is mounted at
  `/1sat/gib/overlay`. That belongs in the SDK, as a path the caller picks.

If the SDK is missing something, add it to the SDK.

**Outpoints are `txid_vout` everywhere in this codebase.** Convert at the
boundary with `toOrdinalOutpoint` (`txid.vout` is accepted on the way in).
The wallet's own outpoint form is `txid.vout` — `gib-wallet.ts` converts
both ways at each `listOutputs` / `createAction` call.

**Biome**: tabs, double quotes, organized imports. `components/ui` is
excluded. `bun run lint:fix` before committing.

**Identity display** is the raw identity key through `IdentityLink`, with a
verified BRC-169 handle in front of it when there is one.

## Wallet permissions

`app/manifest.json/route.ts` serves the site manifest, which carries a
BRC-73 grouped permission block. A BRC-100 wallet fetches
`https://<originator>/manifest.json` — the origin root, nothing else — and
asks for everything in it as one grouped request instead of prompting per
call.

The reader is `WalletPermissionsManager.fetchManifestPermissions` in
`@bsv/wallet-toolbox` (bundled into `@1sat/connect`, which is what this
site's wallets run). It reads `manifest.metanet || manifest.babbage` and
then `.groupPermissions`, and **validates nothing** — a misshapen entry is
carried into the prompt and fails later, or is silently dropped.

Declare exactly what the code calls and nothing more; an over-broad
manifest is worse than none. The current set is derived from
`lib/gib-wallet.ts` and the `@1sat/connect` handshake:

| Declared | Because |
| --- | --- |
| protocol `[1, "identity key retrieval"]` | `getPublicKey({ identityKey: true })` on connect. |
| protocol `[1, "gib branch"]` | `pushDropLock` and `unlockByScript` sign under it. |
| protocol `[1, "action label gib push"]` | `mintHead`'s action label. |
| protocol `[1, "action label gib delete"]` | `burnHead`'s action label. |
| basket `gib` | `listOutputs({ basket: "gib" })` on `/me`, and every minted head is filed there. |
| `spendingAuthorization`, 10 000 sat | `createAction` computes a net spend > 0 — a 1-satoshi head plus fees — and calls `ensureSpendingAuthorization`. A monthly allowance, counted per calendar month. |

Three things about that list are not guessable and are easy to get wrong:

- **Action labels are not a category.** `GroupedPermissions` has exactly
  `description`, `spendingAuthorization`, `protocolPermissions`,
  `basketAccess` and `certificateAccess`. The manager gates label `x` as
  the level-1 protocol `action label x`, so that is how `gib push` and
  `gib delete` are declared.
- **Level-1 entries carry no counterparty.** The manager forces
  counterparty to `""` for level 1, so a declared one is ignored — and a
  literal `""` is a reserved slot that drops the entry. Every entry here is
  level 1, so none of them has a counterparty, even though `gib-wallet.ts`
  signs with counterparty `anyone`.
- **No extra keys.** The grant path compares granted entries to requested
  ones with a deep equality check, and the requested entries are these
  literal objects. A non-spec field (`operations`, say) rides into the
  prompt and can make the grant throw.

### BRC-180 overlay declaration

The same manifest carries `metanet.overlays`: a map from overlay service
name to the base URL a client resolves that service's routes against. It
tells a client what *this domain* hosts, which is a different question from
BRC-88 SHIP ("who on the network serves this topic").

gibhub declares exactly two, the gib topic manager and lookup service the
1Sat stack runs — `tm_gib` and `ls_gib`, named as `TopicName` and
`LookupName` in 1sat-stack's `pkg/gib/config.go`. The stack hosts other
overlays; the site has nothing to do with them and must not declare them.

**The value is `${STACK_URL}/1sat/gib/overlay`, not `STACK_URL`.** This is
the one thing that is easy to get wrong. BRC-180 keys name BRC-22 topic
managers and BRC-24 lookup services, so the base has to be where those
routes live: 1sat-stack mounts `/submit`, `/lookup`,
`/listTopicManagers` and `/listLookupServiceProviders` under
`/1sat/gib/overlay`, and at the stack root they 404. The stack's plain REST
routes (`/1sat/gib/heads`, `/1sat/beef/{txid}`) and ORDFS `/content/…`
*do* resolve against the root, which is what makes the mistake tempting —
but a BRC-180 consumer is not calling those. The Go CLI splits it the same
way: `internal/remote/client.go` keeps a host-only `Base` and appends its
own `OverlayPath = "/1sat/gib/overlay"` to submit.

Both values are built with `stackApiUrl` from `lib/stack.ts`, so the
manifest follows `NEXT_PUBLIC_ONESAT_STACK_URL` and the hostname is never
written down twice.

`babbage.trust` stays under `babbage` when `NEXT_PUBLIC_TRUST_PUBLIC_KEY`
is set, because the 1Sat desktop wallet's trusted-origin check reads
`manifest.babbage.trust` directly. Permissions go under `metanet`, which is
BRC-73's canonical namespace; `babbage` is only the legacy fallback.

A failed fetch — 404, CORS, bad JSON — is cached by the wallet as "no
manifest" for five minutes, so a broken manifest looks like no manifest
until that expires.

Changing an action label, a protocol name, or the basket invalidates every
user's existing grants and every user's entry in their wallet's permission
list. Treat them as a published interface, exactly as the CLI's
`internal/token` does.

## Things that will bite you

**The repository origin is the genesis tree, not the current one.**
Resolving a path through the repository origin outpoint gives you the files
as they were at `gib init`, forever. Browse through `head.root`. The one
place that reads through the repository origin on purpose is
`loadRepoMeta`, which wants the genesis `.gib`. Every other use is a bug,
and it is a quiet one: the page renders, with stale files.

**Handle verification is per head, not per commit.** `verifyHandle` counts
a handle as verified only when the author's domain resolves it to the
identity key that signed *the head being viewed*. The same commit therefore
shows a verified `@alice@1sat.name` on Alice's own head and plain
`alice@1sat.name` on someone else's head that republishes it. That is the
intended behaviour, it matches what git shows, and `/c/[sha]`'s summary
block deliberately has no head context and so never verifies. Do not
"fix" it by resolving once per commit.

**The `gib` basket is hard-coded.** `GIB_BASKET` in `lib/stack.ts` is a
protocol constant shared with the CLI, not a setting. It reads from no
environment variable and must not grow one.

**CI pins bun 1.4.2.** `bun.lock` is written by that version and CI installs
`--frozen-lockfile`. If a local `bun install` rewrites the lockfile, the
lockfile is wrong or your bun is — check `bun --version` before committing a
lockfile change.

**`revalidate` is server-only.** `lib/gib-api.ts` and `lib/ordfs.ts` attach
`next: { revalidate }` only when `typeof window === "undefined"`. The same
functions run in client components with plain `fetch`, so a client call has
no ISR behind it; that is what react-query's `staleTime` is for.

**Branching copies nothing, and costs one wallet call.** `branchFromHead`
mints a head at the same root with `branchedFrom` set to the source head —
no content fetch in front of it, because the root already carries the commit
in its `.git` store. What follows the mint is the overlay submission, which
can fail on its own; the coin is minted either way and there is no resume
state in the browser.

**A commit the overlay does not hold is normal.** `HeadRecord.commit` is the
tip commit read out of `.git` at admission. A push that cited its commit
object instead of republishing it — a fork of a commit already on chain —
leaves the overlay with the sha and no object, so the commit is absent.
That is "not held", not "not published"; the copy says so.

**Every page is a server fetch against a live overlay.** `bun run build`
does not prerender repository pages (they are dynamic), but `bun dev`
against a stack that is down looks like a site-wide 500. Check
`STACK_URL` first.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
