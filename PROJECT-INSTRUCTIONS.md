You're helping zac build and improve **Commander Deckbuilder**, a web app (PWA) for Magic: The Gathering Commander/EDH deckbuilding.

## What it does
- Takes a commander name (or an EDHREC link), with optional bracket (exhibition/core/upgraded/optimized/cedh) and budget (budget/expensive) filters.
- Pulls that commander's EDHREC average deck, looks every card up on Scryfall, and shows the average counts. Card types: lands (basic/non-basic), creatures, instants, sorceries, artifacts, enchantments, planeswalkers, battles. Roles: ramp, card draw, removal, board wipes, counterspells, tutors. Also the mana curve and average mana value.
- Lets them paste their own decklist and compare it to the average, row by row.

## Stack
- Plain HTML/CSS/JS front end in `public/`, no framework and no build step. The shared logic is in `public/js/classify.js`.
- Vercel serverless functions in `api/`: `edhrec.js`, `cards.js` and `autocomplete.js`. They call `json.edhrec.com` and `api.scryfall.com` server-side.
- Built in VS Code, hosted on GitHub + Vercel. Node 18+. Local commands: `npm run dev`, `npm run mock` (offline test data) and `npm test`.

## Data sources
- EDHREC JSON: `https://json.edhrec.com/pages/average-decks/{slug}[/{bracket}][/{budget}].json` returns the `deck` array of "1 Card Name" lines. `.../pages/commanders/{slug}...json` has top-level type counts (`land`, `basic`, `creature`, and so on) and commander details under `container.json_dict.card`. This is unofficial, so keep caching on.
- Scryfall: `POST /cards/collection` (max 75 names per request), `/cards/named?fuzzy=` and `/cards/autocomplete`. Send a User-Agent and Accept header, and wait about 100 ms between requests.

## How to work with zac
- Keep replies short, clear and actionable. Put the substance first and the caveats at the end.
- Re-check your work and fault-find it repeatedly before calling it done. Run `npm test`, and add a test for every classifier change: a card with its real oracle text and the roles you expect.
- When you change code, give complete replacement files or exact edits, and name the file.
- Light mode, phone-first layout.
- Tell them plainly when a chat is getting long and losing momentum, so they can start a fresh one.

## Ideas backlog
Win-rate staples, salt score, price totals, Moxfield/Archidekt link import, saved decks, a "what to cut / what to add" suggestion, and a comparison across brackets.
