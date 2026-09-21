---
name: gibhub
description: "This skill should be used when working on gibhub.net, the web viewer for gib (on-chain git on BSV) — its Next.js routes, its overlay and ORDFS clients, its BRC-100 wallet operations, or its BRC-169 author handles. Triggers on 'gibhub', 'gibhub.net', 'on-chain git viewer', 'browse a repo on chain', 'repository origin', 'commit head', 'branch head', 'gib overlay', '/1sat/gib', 'ORDFS content', 'BRC-169 handles', 'gib basket', 'gib push label'. The companion CLI is the Go gib at github.com/b-open-io/gib; use its own skill for publishing."
---

# gibhub.net

## What it does

gibhub.net browses git repositories that gib published on chain. It reads
the 1sat-stack overlay for repositories, branches and push history, reads
ORDFS for file content, and talks to the visitor's BRC-100 wallet to mint
and burn branch heads.

- A repository is identified by its **repository origin**: the outpoint of
  its genesis `ordfs/dir` root, `txid_vout`. Say "repository origin", not
  "origin" — an ordinal has an origin and git has a remote named `origin`.
- A branch head is a 1-satoshi PushDrop output with **nothing inscribed on
  it** and six fields,
  `["gib", <repository origin>, <branch>, <root>, <identity>, <branched-from>]`,
  protocol `[1, "gib branch"]`, keyID = the root outpoint, counterparty
  `anyone`. Basket `gib`, labels `gib push` / `gib delete`, tags `origin:` /
  `branch:` / `commit:`.
- The commits live in the tree: a published root is git's tree for the tip
  commit plus a `.git` directory holding every commit object reachable from
  it, named by sha, with a `.` entry pointing at the tip. gib strips `.git`
  before hashing, so the tree still verifies against what git computed.
  **Never show `.git` to someone browsing a repository** — `withoutGitStore`
  and `isGitStorePath` in `lib/ordfs.ts`.
- A push spends the previous head into the new one, so the spend chain is
  the branch history. Branched-from is the second parent: with a spend it is
  a merge, without one it is where a branch began.
- Branches come from the BRC-24 `branches` lookup, not from `.gib` and not
  from guessing `main` — that is what the chain shows.
- Nothing indexes a head off the chain: a minted head is submitted over
  BRC-22 or it is invisible.
- **Files are browsed from `head.root`, never from the repository origin.**
  The repository origin resolves to the genesis tree forever.

## Routes

| Route | Shows |
| --- | --- |
| `/` | Recent repositories and recent pushes. |
| `/r/[origin]` | A repository: branch heads, default branch's file tree, README. |
| `/r/[origin]/tree/[ref]/[[...path]]` | A directory at a ref. |
| `/r/[origin]/blob/[ref]/[...path]` | One file: highlighted text, image, or download. |
| `/r/[origin]/commits/[...ref]` | Push history of one branch. |
| `/r/[origin]/commit/[head]` | One head: its commit, the same commit elsewhere, what builds on it. |
| `/c/[sha]` | A commit as a DAG node across every repository that publishes it. |
| `/u/[identity]` | One publisher's repositories and pushes. |
| `/me` | The connected wallet's own branches. |
| `/api/handles` | BRC-169 resolution through the server's shared cache. |
| `/manifest.json` | Web app manifest, BRC-73 grouped permissions, BRC-180 `metanet.overlays`, `babbage.trust`. |

`[ref]` in a generated link is always a head outpoint, so links never rot.
A branch name is accepted and resolves to that branch's current head.

## Modules

| Module | For |
| --- | --- |
| `lib/gib-api.ts` | The overlay client and the `HeadRecord` / `RepoRecord` / `Commit` types. |
| `lib/ordfs.ts` | `/content/…` URLs, `ordfs/dir` decoding, path walking, file text. |
| `lib/gib-wallet.ts` | `mintHead`, `burnHead`, `branchFromHead`, and the token vocabulary. |
| `lib/gib-lookup.ts` | The BRC-24 `branches` lookup on `ls_gib`. |
| `lib/gib-submit.ts` | The submission BEEF (head transaction last) and the BRC-22 POST. |
| `lib/gib-head.ts` | Decode a head from its own locking script, and read its commit from the root's `.git` store — both without the overlay. |
| `lib/resolve-ref.ts` | A URL ref → a head: outpoint, or branch name → current head. |
| `lib/handles.ts`, `lib/handles-server.ts` | BRC-169 grammar, resolution, cache, verification. |
| `lib/routes.ts` | Every internal URL. Build links here. |
| `lib/format.ts` | `txid_vout` handling, shortening, `timeAgo`. |
| `lib/stack.ts` | `STACK_URL`, `APP_URL`, `GIB_BASKET`. |

## Running it

```sh
bun install
bun dev     # http://localhost:8266, against https://api.1sat.app
```

That is the whole setup: the defaults point at the live overlay and no key
or account is needed to browse. `cp .env.example .env.local` to point
`NEXT_PUBLIC_ONESAT_STACK_URL` at another 1sat-stack with the `gib` overlay
enabled.

```sh
bun run lint && bun run typecheck && bun test && bun run build
```

All four must pass. CI pins bun 1.4.2 and installs `--frozen-lockfile`.
`main` auto-deploys to gibhub.net via Vercel.

## How it ties to the other pieces

### The overlay

`GET {STACK_URL}/1sat/gib/…` — `/repos`, `/identity/{id}/repos`,
`/repo/{origin}`, `/repo/{origin}/branches`,
`/repo/{origin}/branch/{name}`, `/head/{outpoint}`, `/commit/{sha}`,
`/heads`. Paging is `limit` / `from` (an overlay score) / `rev`. 404 is
`null`; anything else throws.

### ORDFS

`GET {STACK_URL}/content/{outpoint}` or `/content/{root}/path/to/file` for
resolved file bytes — the gateway applies `ordfs/patch` chains, the site
never does. `?raw=true` gets a record's own bytes, which is how directory
manifests are read. `POST /1sat/ordfs/metadata` gets content type and
length for up to 100 outpoints at a time.

### The wallet

`@1sat/react`'s `useWallet()` is the only way to the wallet. Connecting
calls `getPublicKey({ identityKey: true })`. Minting and burning go through
`lib/gib-wallet.ts`, which mirrors the gib CLI's conventions exactly so a
head minted in the browser is indistinguishable from a CLI push.
`/manifest.json` declares the whole permission set under
`metanet.groupPermissions` as one BRC-73 grouped request: protocols
`[1, "identity key retrieval"]`, `[1, "gib branch"]`,
`[1, "action label gib push"]` and `[1, "action label gib delete"]`, basket
`gib`, and a spending authorization for the 1-satoshi head plus fees.
Action labels have no category of their own — the wallet gates label `x` as
the level-1 protocol `action label x` — and level-1 entries carry no
counterparty.

The same manifest declares BRC-180 `metanet.overlays`: exactly `tm_gib` and
`ls_gib`, both pointing at `${STACK_URL}/1sat/gib/overlay` via `stackApiUrl`
— the BRC-22/24 engine mount, not the stack root, where `/submit` and
`/lookup` would 404. Declare no overlay the site does not use.

`/me` decodes heads from the wallet's own locking scripts
(`lib/gib-head.ts`), so it works before any indexer has caught up.

### The gib CLI

The Go CLI at github.com/b-open-io/gib writes the heads this site reads.
Its `internal/token` package is the reference for the token vocabulary and
its `internal/testdata/ts-fixtures.json` holds the pinned script bytes. If
this site and that package disagree, this site is wrong.

## Rules

- Never reimplement what `@1sat/actions` or `@1sat/templates` already do:
  `dirDecode`, `pushDropLock`, `pushDropDecode`, `unlockByScript`,
  `completeSignedAction`, `Inscription`. No hand-rolled PushDrop, B or
  OP_RETURN scripts.
- Basket `gib`, protocol `[1, "gib branch"]`, labels `gib push` and
  `gib delete` are a published interface. Renaming one voids every user's
  wallet grants.
- Handles are verified per head, not per commit: the same commit reads as
  verified on its author's own head and as plain text on anyone else's.
- Outpoints are `txid_vout` in this codebase; convert at the boundary with
  `toOrdinalOutpoint`.

Full detail: [../../AGENTS.md](../../AGENTS.md).
