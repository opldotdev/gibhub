# gibhub.net

A GitHub-style front end for **gib**, on-chain git on BSV. Repositories are
directory inscriptions, files are on-chain outputs (with vcdiff patch chains),
and every branch is a signed 1-sat PushDrop coin ("commit head") whose spend
chain is the push history. This site only reads: content comes from ORDFS on
the 1Sat stack, and repository/branch discovery comes from the stack's `gib`
overlay (`/1sat/gib`).

## What it does (v1)

- **Explore**: recently active repositories and recent pushes.
- **Repository**: current branches, file tree at any push, README, per-file
  view with syntax highlighting, push history with git commit metadata.
- **Publisher page**: repositories and pushes by identity key.
- **Commit DAG**: `/c/<sha>` shows a git commit as a node: every head that
  publishes it (across repos and forks), its parents, and the commits that
  build on it. Parents resolve through the overlay's sha index, so history
  is followable across origins.
- **My repos**: connect a BRC-100 wallet and see the commit heads in your
  `gib` basket, resolved through the overlay.

- **Branch**: publishes a head under your identity on the same repository,
  pointing at an existing commit (the commit object is reused verbatim, no
  content copied, no new origin). The name is prompted, defaulting to the
  source branch. Fork-as-new-origin was removed: a detached copy is a CLI
  operation on a fresh `gib init`.

- **Author handles (BRC-169)**: a commit author whose email slot holds a
  handle (`alice@1sat.name` or `@alice@1sat.name`) is shown as a verified
  `@alice@1sat.name` when that domain resolves the handle to the identity key
  that signed the head being viewed. Nothing is added to the head token and
  nothing is required of users; the same commit on someone else's head shows
  the author as plain text, as git does.

In-browser editing is a later revision. No social layer. Wallet operations in
`lib/gib-wallet.ts` follow the gib CLI's conventions exactly (protocol
`[1, "gib branch"]`, keyID = root outpoint, basket `gib`, `origin:`/`branch:`
tags incl. `commit:<sha>`, fixed `gib push` / `gib delete` labels, commit object inscribed after the PushDrop lock).

## Stack

Next.js 16 (App Router, React Compiler), React 19, Tailwind v4, shadcn/ui
(new-york), `@1sat/react` for wallet connect, Biome, Bun. Same house style as
1satwallet.com.

## Develop

```bash
bun install
cp .env.example .env.local   # optional; defaults to https://api.1sat.app
bun dev                      # http://localhost:8266
bun run lint && bun run typecheck && bun run build
```

`NEXT_PUBLIC_ONESAT_STACK_URL` points at a 1sat-stack with the `gib` overlay
enabled. `NEXT_PUBLIC_TRUST_PUBLIC_KEY`, when set, adds a `babbage.trust`
block to `/manifest.json` so the 1Sat desktop wallet trusts this origin.

`/manifest.json` also carries a BRC-73 `permissions` block, so a BRC-100
wallet asks once, as one grouped request, for everything the site needs:
the identity key, protocol `gib branch`, basket `gib`, the `gib push` and
`gib delete` action labels, and a spending authorization for minting heads.

Working on the code: [AGENTS.md](AGENTS.md), and
[skills/gibhub](skills/gibhub/SKILL.md) for agents.

## Data flow

| Need | Source |
| --- | --- |
| Repositories, branches, push history, commit metadata | `GET /1sat/gib/...` (overlay REST) |
| Directory listing | `GET /content/{manifest}?raw=true` + `POST /1sat/ordfs/metadata` |
| File bytes (patches applied) | `GET /content/{root}/path` or `/content/{outpoint}` |
| Your branches | wallet `listOutputs({ basket: "gib" })` → `/1sat/gib/head/{outpoint}` |
| Author handles | `https://<domain>/manifest.json` → `metanet.handles.resolve?handle=` (server-side, cached per `ttl`) |

Refs in URLs are head outpoints (immutable), so links never rot; a branch name
is accepted too and resolves to its current head.

## SDK dependency

`@1sat/actions` (0.0.224+) and `@1sat/templates` (0.0.38+) from npm provide
everything the site needs on chain: `dirDecode` for `ordfs/dir` manifests,
`buildDataScript` for zero-sat data outputs, `pushDropLock` /
`unlockByScript` for minting and burning heads, and decoders that accept
zero-length files. `lib/ordfs.ts` decodes binary manifests with the SDK's
`dirDecode` and legacy JSON manifests locally.
