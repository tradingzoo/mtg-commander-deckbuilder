// Singles deals: for the 500 most-played Commander cards (EDHREC rank via Scryfall), check every Thai store and
// compare each in-stock copy with the US price of that exact printing and finish (Scryfall's daily
// TCGplayer price). A copy is left out when we can't tell which printing it is.
import { getJson } from './_lib.js';
import { STORES, checkStore, norm } from './_stores.js';
import { pool, words } from './_sealed.js';

export const BATCH = 5; // cards per request; each card hits all 7 stores

const memo = new Map();
async function cached(key, ms, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value;
  const value = await fn();
  memo.set(key, { at: Date.now(), value });
  return value;
}
export const clearSinglesMemo = () => memo.clear();

export const TOP_N = 500;

// The 500 most-played Commander cards: Scryfall's search sorted by EDHREC rank (175 a page, basics left out).
// If Scryfall is down, EDHREC's own top 100 list instead.
export function namesFromPages(pages, n = TOP_N) {
  return [...new Set(pages.flatMap(p => (p?.data || []).map(c => c.name)))].slice(0, n);
}

export const topCards = () => cached('top', 24 * 3600 * 1000, async () => {
  const pages = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent('f:commander game:paper -t:basic')}&order=edhrec`;
  for (let i = 0; url && i < Math.ceil(TOP_N / 175); i++) {
    const r = await getJson(url).catch(() => null);
    if (!r?.ok) break;
    pages.push(r.body);
    url = r.body?.has_more ? r.body.next_page : null;
  }
  const names = namesFromPages(pages);
  if (names.length >= 100) return names;
  const r = await getJson('https://json.edhrec.com/pages/top/year.json');
  if (!r.ok) throw new Error('EDHREC did not respond');
  const lists = r.body?.container?.json_dict?.cardlists || [];
  return [...new Set(lists.flatMap(l => (l.cardviews || []).map(c => c.name)))].slice(0, 100);
});

// ---------- What is this store copy? ----------
const PLAYED = /\b(lp|mp|hp|dmg|sp|ex|vg|gd|lightly|moderately|heavily|played|damaged|poor|excellent|good)\b/i;
const OTHER_LANG = /japanese|\bjp\b|\bjpn\b|chinese|korean|french|german|italian|spanish|portuguese|russian|phyrexian/i;

export function copyInfo(listing) {
  const text = `${listing.name} ${listing.finish} ${listing.set}`;
  const finish = String(listing.finish || '');
  return {
    foil: /etched/i.test(text) ? 'etched' : /\bfoil\b/i.test(text.replace(/non[-\s]?foil/gi, '')) ? 'foil' : 'nonfoil',
    played: PLAYED.test(finish.replace(/near mint|\bnm\b/gi, '')),
    otherLang: OTHER_LANG.test(`${listing.name} ${finish}`),
    // Yannick's product links end in "-{number}-{set}", e.g. ".../gimli-of-the-glittering-caves-115-ltc".
    fromUrl: (String(listing.url || '').match(/-(\d+[a-z]?)-([a-z0-9]{3,6})$/) || []).slice(1),
    treat: {
      extendedart: /extended art/i.test(text),
      borderless: /borderless/i.test(text),
      showcase: /showcase/i.test(text),
      retro: /retro|old frame|1997 frame/i.test(text),
      fullart: /full art/i.test(text),
    },
  };
}

const treatsOf = (p) => ({
  extendedart: (p.frame_effects || []).includes('extendedart'),
  borderless: p.border_color === 'borderless',
  showcase: (p.frame_effects || []).includes('showcase'),
  retro: p.frame === '1997' || p.frame === '1993',
  fullart: !!p.full_art,
});

// Which Scryfall printings could this set text mean? Exact set code or name first, then the
// longest set name the text contains ("The Lord of the Rings: Tales of Middle-Earth Commander" -> ltc).
export function printsForSet(setText, prints) {
  const s = words(String(setText || '').replace(/\bvariants?\b/gi, ''));
  if (!s) return [];
  const exact = prints.filter(p => p.set === s || words(p.set_name) === s);
  if (exact.length) return exact;
  const names = [...new Set(prints.map(p => words(p.set_name)))].filter(n => n.length >= 4 && ` ${s} `.includes(` ${n} `));
  if (!names.length) return [];
  const best = names.sort((a, b) => b.length - a.length)[0];
  return prints.filter(p => words(p.set_name) === best);
}

const priceOf = (p, foil) => {
  const v = foil === 'etched' ? p.prices?.usd_etched : foil === 'foil' ? p.prices?.usd_foil : p.prices?.usd;
  return v == null ? null : Number(v);
};

// The printing this copy is, or null when it's not clear. Returns { print, usd }.
export function matchPrint(listing, prints) {
  const c = copyInfo(listing);
  if (c.played || c.otherLang) return null;
  let cands = [];
  // A collector number in the link is exact, so it settles the printing on its own.
  const byNumber = c.fromUrl.length ? prints.filter(p => p.set === c.fromUrl[1] && p.collector_number === c.fromUrl[0]) : [];
  cands = byNumber.length ? byNumber : printsForSet(listing.set, prints);
  cands = cands.filter(p => (p.lang || 'en') === 'en' && (p.finishes || []).includes(c.foil) && priceOf(p, c.foil) != null);
  // A treatment named on the listing must match; a listing that names none means the plain version.
  if (!byNumber.length) {
    const named = Object.keys(c.treat).filter(k => c.treat[k]);
    if (named.length) {
      // "(Extended Art)" etc. on the listing: only printings with that treatment.
      cands = cands.filter(p => { const t = treatsOf(p); return named.every(k => t[k]); });
    } else if (cands.length > 1) {
      // Nothing named: the plain printing if there is one. Old frames (Prophecy) count as plain when that's all there is.
      const plain = cands.filter(p => { const t = treatsOf(p); return !Object.values(t).some(Boolean); });
      if (plain.length) cands = plain;
    }
  }
  if (!cands.length) return null;
  const usds = cands.map(p => priceOf(p, c.foil));
  const lo = Math.min(...usds), hi = Math.max(...usds);
  // Several printings left: only fine when they cost about the same, then use the cheaper (stricter) price.
  if (cands.length > 1 && hi > lo * 1.1 + 0.25) return null;
  const print = cands[usds.indexOf(lo)];
  return { print, usd: lo, foil: c.foil };
}

// ---------- One batch of cards ----------
async function printsFor(name) {
  return cached(`p:${name}`, 6 * 3600 * 1000, async () => {
    const out = [];
    let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${name}" game:paper`)}&unique=prints`;
    for (let i = 0; url && i < 3; i++) {
      const r = await getJson(url);
      if (!r.ok) break;
      out.push(...(r.body?.data || []));
      url = r.body?.has_more ? r.body.next_page : null;
    }
    return out;
  });
}

export async function singlesBatch(names, { usdToThb }) {
  const perCard = await pool(names, 2, async (name) => {
    const [prints, stores] = await Promise.all([
      printsFor(name).catch(() => []),
      Promise.all(STORES.map(s => checkStore(s, name.split(' // ')[0]))),
    ]);
    const offers = [];
    for (const s of stores) {
      for (const l of s.listings || []) {
        if (!l.inStock || !l.price) continue;
        const m = matchPrint(l, prints);
        const refThb = m && usdToThb ? Math.round(m.usd * usdToThb) : null;
        offers.push({
          title: name, detail: [l.set, l.finish].filter(Boolean).join(' · '),
          store: s.name, storeId: s.id, area: s.area, price: l.price, qty: l.qty, url: l.url,
          ref: m ? { usd: m.usd, thb: refThb, source: 'market', name: `${m.print.set_name} #${m.print.collector_number}${m.foil !== 'nonfoil' ? ` (${m.foil})` : ''}`,
            url: m.print.purchase_uris?.tcgplayer || m.print.scryfall_uri } : null,
          discountPct: refThb ? Math.round(((refThb - l.price) / refThb) * 1000) / 10 : null,
        });
      }
    }
    return { name, offers, failed: stores.filter(s => !s.ok).map(s => s.id) };
  });
  return perCard;
}
