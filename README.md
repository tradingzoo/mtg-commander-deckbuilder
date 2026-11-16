# Commander Deckbuilder

Type a commander and see what EDHREC's average deck runs: lands (basic and non-basic), creatures, instants, sorceries, artifacts, enchantments, planeswalkers, plus ramp, card draw, removal, board wipes, counterspells, tutors and the mana curve. Paste your own list to see the difference row by row.

It works on your phone as an installable web app (PWA).

## Run it on your computer (VS Code)

You need Node.js 18 or newer. There's nothing to install from npm.

```
npm run dev      # live data   → http://localhost:3000
npm run mock     # built-in test data, no internet needed
npm test         # 42 checks: card roles, decklist parsing, API routes
```

## Put it online (free)

1. Push this folder to a new GitHub repo.
2. On vercel.com, click **Add New → Project**, pick the repo and click **Deploy**. Leave the settings as they are: `vercel.json` already points to `public/`.
3. On your phone, open the Vercel URL. On iPhone, tap **Share → Add to Home Screen**; on Android, tap **⋮ → Install app**.

## How it works

| Part | File | Job |
|---|---|---|
| Page | `public/index.html`, `style.css`, `js/app.js` | Search, table, curve, compare |
| Card logic | `public/js/classify.js` | Parses decklists, decides each card's type and roles |
| EDHREC | `api/edhrec.js` | Gets the average deck and EDHREC's type counts (cached 12h) |
| Scryfall | `api/cards.js`, `api/autocomplete.js` | Card types, rules text, mana value, name suggestions |
| Dev server | `server.js` | Runs the same `/api` routes locally |

The site's own server calls EDHREC and Scryfall, so the browser never hits their cross-site limits.

## Known limits

- **Roles are worked out from rules text.** Some cards will land in the wrong bucket. Tap a row to see the cards it counted, and fix the patterns in `classify.js` (`RX` and `rolesOf`). A card can count as more than one role.
- **Type counts come from the front face.** A double-faced card such as an MDFC spell/land counts as its front type.
- **EDHREC has no official public API.** The `json.edhrec.com` pages the app reads could change without notice. If that happens, `api/edhrec.js` is the only file that needs fixing. Keep the 12-hour cache so the app stays light on their servers.
- **Partner pairs:** paste the pair's EDHREC link instead of a name.

Data from EDHREC and Scryfall. Not affiliated with Wizards of the Coast.
