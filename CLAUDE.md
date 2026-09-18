# gibhub.net

GitHub-style viewer for gib (on-chain git on BSV). Read-only against the 1Sat
stack: ORDFS for content, the `gib` overlay (`/1sat/gib`) for repositories,
branches, and push history. Design source of truth: `gib-cli/docs/plans/`.

## Commands

```bash
bun install
bun dev            # next dev on :8266
bun run lint       # biome check
bun run typecheck  # tsc --noEmit
bun run build
bun test
```

## Layout

- `app/` routes: `/` explore, `/r/[origin]` repo, `/r/[origin]/tree/[ref]/[[...path]]`,
  `/r/[origin]/blob/[ref]/[...path]`, `/r/[origin]/commits/[...branch]`,
  `/r/[origin]/commit/[head]`, `/u/[identity]`, `/me` (wallet), `/manifest.json`.
- `lib/gib-api.ts` typed overlay client; `lib/ordfs.ts` manifests + content;
  `lib/resolve-ref.ts` ref → head; `lib/routes.ts` URL builders.
- `components/ui/` is shadcn (copied from 1satwallet.com, excluded from Biome).
- Wallet: `@1sat/react` `WalletProvider`/`useWallet`. No custom wallet code.

## Conventions

- Server components fetch with `next: { revalidate }`; client data via TanStack Query.
- Refs in generated links are head outpoints (`txid_vout`), never branch names.
- Outpoints are `txid_vout` everywhere in this codebase; convert at the boundary
  with `toOrdinalOutpoint`.
- Identity display is the raw key via `IdentityLink`; a name registry fronts it later.
- Do not add manifest/patch/token decoding here: that belongs to the `@1sat` SDK.
  `lib/ordfs.ts#decodeBinaryManifest` is the adapter point.
- Tabs, double quotes (Biome). Bun, not npm.
