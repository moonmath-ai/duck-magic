# Duck Magic

The Duck Wizard casts a spell. You invent a counterspell in plain English. An AI referee decides what it actually blocks, whether anything reaches the duck, and how much magic it costs. The duck has 100 locked attacks, from fireballs to meatball monsoons. [Play the original game](https://magic.zro.moonmath.ai/).

This is the forkable source for **Duck Magic**, separate from the private *Convince the Duck* game. The code and art in this repository are licensed under [MIT](LICENSE). A fork is your own game: you can change the spell book, art, rules, prompts, and UI.

## Run locally in two minutes

Requires Node.js 20 or newer. There are no npm dependencies.

```sh
git clone https://github.com/moonmath-ai/duck-magic.git
cd duck-magic
cp .env.example .env
npm start
```

Open <http://127.0.0.1:8793/>. With the example's blank `ZRO_API_KEY`, the game says **SIMULATED** and uses a small local preview judge. It lets you try the UI without spending money, but it does **not** judge creative counters like the live AI. Run `npm test` for the rules and API-unit tests.

To try live inference, put your own Zro key in `.env` as `ZRO_API_KEY=...`, then restart `npm start`. Keep the key server-side, never in `public/` or Git. Set a provider-side spend limit first. `ZRO_MODEL` and `ZRO_BASE_URL` are also configurable in `.env`.

## Make it yours

1. Edit the 100 attack names and exact physical facts in [`lib/spells.mjs`](lib/spells.mjs). Every line has `Name|category|facts`; the server currently gives each available spell an equal chance and does not repeat one in a duel until all have appeared.
2. Change the AI referee rubric in [`lib/judge.mjs`](lib/judge.mjs), the deterministic HP/magic rules in [`lib/counterspell.mjs`](lib/counterspell.mjs), or the frontend in [`public/`](public/). Keep the spell facts fixed *before* a player responds so the duck cannot move the goalposts.
3. Run `npm test` and play a few rounds in both simulated and live modes. Simulated judging is not a fairness test for live play.

If you deploy your own fork, change the `CLAIM_EMAIL` in `public/app.js` or remove the reward-claim feature, replace the original game's social preview URL in `public/index.html`, and change the “Fork this game” links there if you want them to point to your fork. The [MIT license](LICENSE) lets you remix the source; the original MoonMath/Zro branding does not imply endorsement of your fork.

## Deploy your own Cloudflare Worker

The checked-in [`wrangler.toml`](wrangler.toml) is a starting point, **not** the original game's production configuration. Give `name` your own unique Worker name and review the `$2` app-side estimated inference allowance. That allowance is not a billing cap, so also limit spending with your model provider.

```sh
npx wrangler login
npx wrangler secret put ZRO_API_KEY
npx wrangler secret put DUEL_OPERATOR_TOKEN
npx wrangler deploy
```

Wrangler asks for each secret interactively. Do not put their values in `wrangler.toml`, GitHub, or browser code. `DUEL_OPERATOR_TOKEN` protects `/operator` and its APIs; use a long random value distinct from the API key. The public game has no player access code. The Worker keeps each session in a Cloudflare Durable Object and never sends the model key to the browser. If you want the optional Tenstorrent/Qwen trial (`?qwen=1`), set a separate `TT_API_KEY` Worker secret; otherwise that trial is unavailable.

The operator page shows aggregate play and inference metrics and can verify/redeem reward claim references. A “New event” resets its displayed event analytics, game sessions, and **app-side** spending allowance; it does not refund provider charges. Configure your own reward fulfillment before inviting players to claim anything.

## How it is organized

- `lib/spells.mjs`: fixed 100-spell catalog and selection.
- `lib/judge.mjs`: AI prompts and structured-response validation; mock judge for local preview.
- `lib/counterspell.mjs`: game state and outcome rules.
- `server.mjs`: localhost server, simulated mode, and local live mode.
- `src/worker.mjs`: Cloudflare Worker, sessions, analytics, budget guard, and operator API.
- `public/`: browser UI and pixel-art assets.
- `test/`: Node test suite.

Game sessions may temporarily contain submitted counterspells and verdicts in Cloudflare Durable Object storage. The original game has no player accounts; a fork operator is responsible for their own privacy notice, retention, security, and reward terms.

If you discover a security issue, please report it privately to `zro@moonmath.ai` instead of filing a public exploit issue. Other fixes and remixes are welcome as pull requests.
