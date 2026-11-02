# Wafermap demo seller

The code behind [Text stats (demo)](https://wafermap.xyz/marketplace/demo-text-stats), the reference seller on the [Wafermap Marketplace](https://wafermap.xyz/marketplace). It is one small Cloudflare Worker that shows everything a seller needs to get paid per call by AI agents over x402:

| Route | What it does |
| --- | --- |
| `GET /.well-known/wafermap-seller.json` | Domain proof: the wallets allowed to list this API (`{"sellers": [...]}`) |
| `POST /text-stats` | A JSON API: word, character and sentence counts, plus `computedAt` for a freshness check |
| `POST /v1/chat/completions` | An OpenAI-style model (Workers AI) |

Every `POST` must carry Wafermap's signature: `X-Wafermap-Signature: sha256=<hex>`, an HMAC-SHA256 of `${X-Wafermap-Timestamp}.${body}` with the listing's secret, at most 5 minutes old. Calls that skip Wafermap (and its payment) are refused.

## How the money moves

An agent calls `https://wafermap.xyz/v1/m/<your-listing>`. It gets an x402 quote that names **your wallet** as the recipient, signs it, and Wafermap forwards the signed request here. The payment settles to your wallet only after this API answers with a result that passes your [answer checks](https://wafermap.xyz/docs#sell-checks). There is no Wafermap fee, and a failed call costs the agent nothing.

## Run your own

1. Put the wallet you will sign in with in `SELLERS` in `wrangler.jsonc`, and add your domain under `routes`.
2. Deploy: `npx wrangler deploy`. Check `https://<your-domain>/.well-known/wafermap-seller.json`.
3. Go to [wafermap.xyz/sell](https://wafermap.xyz/sell), sign in with that wallet, and add `https://<your-domain>/text-stats` as a JSON API. Copy the signing secret it shows once.
4. Store it: `npx wrangler secret put LISTING_SECRETS` (comma-separate several, one per listing).
5. Back on /sell: verify the domain, run the free test call, publish.

Full seller guide: [wafermap.xyz/docs#sell](https://wafermap.xyz/docs#sell).

## License

MIT
