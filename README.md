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
- **My repos**: connect a BRC-100 wallet and see the commit heads in your
  `gib` basket, resolved through the overlay.

Fork and branch delete land with the `@1sat` gib token template; in-browser
editing is a later revision. No social layer.

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

## Data flow

| Need | Source |
| --- | --- |
| Repositories, branches, push history, commit metadata | `GET /1sat/gib/...` (overlay REST) |
| Directory listing | `GET /content/{manifest}?raw=true` + `POST /1sat/ordfs/metadata` |
| File bytes (patches applied) | `GET /content/{root}/path` or `/content/{outpoint}` |
| Your branches | wallet `listOutputs({ basket: "gib" })` → `/1sat/gib/head/{outpoint}` |

Refs in URLs are head outpoints (immutable), so links never rot; a branch name
is accepted too and resolves to its current head.

## Pending on the SDK

`lib/ordfs.ts` decodes legacy JSON manifests locally. Binary `ordfs/dir`
manifests need the codec being added to the `@1sat` SDK; `decodeBinaryManifest`
is the one function to wire when it lands. The gib PushDrop template (fork,
delete) comes from the same SDK work.
