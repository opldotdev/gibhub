/** Block explorer links for the transactions that hold on-chain resources. */

import { outpointTxid, toOrdinalOutpoint } from "./format";

export const EXPLORER_URL = "https://bananablocks.com";

export const txExplorerUrl = (txid: string) => `${EXPLORER_URL}/tx/${txid}`;

export const outpointExplorerUrl = (outpoint: string) =>
	txExplorerUrl(outpointTxid(toOrdinalOutpoint(outpoint)));
