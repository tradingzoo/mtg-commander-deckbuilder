// Sealed product page shapes, trimmed from the real store pages and tcgcsv.com on 2026-11-17.
// Titles and store prices are real. TCGplayer market prices for FINAL FANTASY are the real ones that day;
// the others are made up for the tests.

const ext = (sealed) => (sealed ? [{ name: 'UPC', value: '1' }] : [{ name: 'Number', value: '1' }, { name: 'Rarity', value: 'R' }]);
const tcg = (groupId, rows) => ({
  products: { results: rows.map(([productId, name, , sealed = true]) => ({ productId, groupId, name, url: `https://www.tcgplayer.com/product/${productId}`, extendedData: ext(sealed) })) },
  prices: { results: rows.map(([productId, , marketPrice]) => ({ productId, marketPrice, subTypeName: 'Normal' })) },
});

export const TCG_GROUPS = { results: [
  { groupId: 24219, name: 'FINAL FANTASY', abbreviation: 'FIN' },
  { groupId: 24220, name: 'Commander: FINAL FANTASY', abbreviation: 'FIC' },
  { groupId: 24463, name: 'Lorwyn Eclipsed', abbreviation: 'ECL' },
  { groupId: 24464, name: 'Commander: Lorwyn Eclipsed', abbreviation: 'ECC' },
  { groupId: 24462, name: 'Art Series: Lorwyn Eclipsed', abbreviation: 'AECL' },
  { groupId: 67, name: 'Lorwyn', abbreviation: 'LRW' },
  { groupId: 24553, name: 'Marvel Super Heroes', abbreviation: 'MSH' },
  { groupId: 24554, name: 'Commander: Marvel Super Heroes', abbreviation: 'MSC' },
  { groupId: 24683, name: 'The Hobbit', abbreviation: 'HOB' },
] };

export const TCG = {
  24219: tcg(24219, [
    [618889, 'FINAL FANTASY - Play Booster Pack', 9.82], [618890, 'FINAL FANTASY - Play Booster Display', 253.39],
    [618891, 'FINAL FANTASY - Play Booster Display Case', 1488.28], [618892, 'FINAL FANTASY - Collector Booster Pack', 165.08],
    [618893, 'FINAL FANTASY - Collector Booster Display', 1549.53], [618899, 'FINAL FANTASY - Collector Booster Sample Pack', 10.18],
    [618900, 'FINAL FANTASY - Collector Booster Omega Pack', 169.96], [618894, 'FINAL FANTASY - Bundle', 120.7],
    [618895, 'FINAL FANTASY - Gift Bundle', 244.58], [618896, 'FINAL FANTASY - Collector Booster Display (Japanese)', 784.49],
    [600001, 'Cloud, Midgar Mercenary', 2.5, false],
  ]),
  24220: tcg(24220, [
    [618901, 'FINAL FANTASY Commander Deck - FINAL FANTASY VI Revival Trance', 80], [618902, 'FINAL FANTASY Commander Deck - FINAL FANTASY VII Limit Break', 95],
    [618903, 'FINAL FANTASY Commander Deck - FINAL FANTASY VII Limit Break (Collector\'s Edition)', 210],
  ]),
  24463: tcg(24463, [
    [656311, 'Lorwyn Eclipsed - Play Booster Pack', 5.2], [656312, 'Lorwyn Eclipsed - Play Booster Display', 150],
    [656313, 'Lorwyn Eclipsed - Play Booster Display Case', 880], [656320, 'Lorwyn Eclipsed 60-Card Theme Deck - Pirates', 20],
    [656321, 'Lorwyn Eclipsed 60-Card Theme Deck - Angels', 21], [656322, 'Lorwyn Eclipsed 60-Card Theme Deck Display', 110],
    [656330, 'Lorwyn Eclipsed - Bundle', 55],
  ]),
  24464: tcg(24464, [
    [656340, 'Lorwyn Eclipsed Commander Deck - Dance of the Elements', 48], [656341, 'Lorwyn Eclipsed Commander Deck - Blight Curse', 52],
    [656342, 'Lorwyn Eclipsed Commander Deck Display', 190], [656343, 'Lorwyn Eclipsed Commander Decks [Set of 2]', 100],
  ]),
  24462: tcg(24462, [[656399, 'Lorwyn Eclipsed - Art Series Pack', 3]]),
  67: tcg(67, [[1000, 'Lorwyn - Booster Box', 900]]),
  24553: tcg(24553, [[700001, 'Marvel Super Heroes - Play Booster Display', 140], [700002, 'Marvel Super Heroes - Gift Bundle', 90]]),
  24554: tcg(24554, [
    [700010, 'Marvel Super Heroes Commander Deck - Doom Prevails (Collector\'s Edition)', 260], [700011, 'Marvel Super Heroes Commander Deck - Doom Prevails', 55],
    [700012, 'Marvel Super Heroes Commander Kit - Doom Prevails', 30],
  ]),
  24683: tcg(24683, [[710001, 'The Hobbit - Play Booster Display', 165], [710002, 'The Hobbit - Collector Booster Display', 610]]),
};

// Shopify /collections/{handle}/products.json (prices in baht, as strings).
const shop = (title, price, available = true, extra = {}) => ({
  title, handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), product_type: 'MTG Sealed', variants: [{ title: 'Default Title', price, available }], ...extra,
});
export const POWER9_SEALED = { products: [
  shop('Final Fantasy Collector Booster Box', '49000.00', false),
  shop('BOOSTER BOX BATTLE FOR ZENDIKAR', '5000.00'),
  shop('Final Fantasy Play Booster Box', '7900.00'),
] };
export const FIRSTPICK_SEALED = { products: [
  shop('Lorwyn Eclipsed Commander Deck - Blight Curse', '1750.00'),
  shop('Lorwyn Eclipsed - Play Booster Display', '5400.00'),
  shop('Lorwyn Eclipsed - Theme Deck Pirates', '850.00'),
  shop('Dragon Shield Matte Sleeves', '450.00', true, { product_type: 'Accessories' }),
] };
export const FIRSTPICK_DECKS = { products: [shop('Lorwyn Eclipsed Commander Deck - Blight Curse', '1750.00')] };
export const BIGBEAR_SEALED = { products: [
  shop("Marvel Super Heroes Commander Deck - Doom Prevails (Collector's Edition) -", '7450.00'),
  shop('The Hobbit - Play Booster Display -', '6100.00'),
  shop('Riftbound - Origins Booster Box', '3900.00', true, { product_type: 'Riftbound Sealed' }),
  shop('Final Fantasy Commander Deck - Revival Trance', '2400.00'),
] };

// Nox TCG /api/products?category=sealed-product
export const NOX_SEALED = { count: 3, next: null, results: [
  { id: 38, category_name: 'Sealed Product', name: "Battle for Baldur's Gate Commander Deck - Party Time", sell_price: 5500, stock_qty: 1 },
  { id: 74, category_name: 'Sealed Product', name: 'Final Fantasy - Bundle', sell_price: 3500, stock_qty: 2 },
  { id: 90, category_name: 'Sealed Product', name: 'Final Fantasy - Gift Bundle', sell_price: 9000, stock_qty: 0 },
] };

// LeveLmax tomorrowlion.com/sealed tile (classes trimmed).
const lvl = (name, meta, price, qty) => `<div class="group"><div class="grid aspect-[4/3]"><img src="/api/card-photos/product_1.webp" alt="${name}" class="max-h-full" loading="lazy"/></div><div class="flex"><p class="text-sm font-semibold leading-snug text-fg">${name}</p><p class="text-xs text-muted">${meta}</p><div class="mt-auto flex"><div><p class="tnum text-base font-bold gold-text">฿ ${price}</p><p class="text-[11px] text-faint">เหลือ <!-- -->${qty}<!-- --> ชิ้น</p></div><button type="button" aria-label="หยิบ ${name} ใส่ตะกร้า" class="grid"><svg width="18"></svg></button></div></div></div>`;
export const LEVELMAX_SEALED = `<html><body><main><img src="/logo.png" alt="LeveLmax"/>${lvl('Marvel Super Heroes Play Booster Box', 'Marvel Super Heroes · <!-- -->Booster Box', '5,690', 1)}${lvl('warhammer Pack 4', 'Bundle', '39,000', 2)}</main></body></html>`;

// Yannick /collections/s/mtg-sealed tile.
const yan = (href, name, price, label = 'Only 1 left', mod = 'low') => `<article class="row-product product-card"><a class="row-image" href="${href}"><img alt="${name}"></a><div class="product-card-body"><p class="row-name"><a href="${href}">${name}</a></p><div class="product-card-bottom"><div class="product-card-meta-row"><p class="row-meta">MTG Sealed</p><span class="stock-dots" role="img" title="Low stock (1-2) — Total qty: 1"></span></div><p class="product-stock-label product-stock-label--${mod}">${label}</p><div class="product-inline-buy"><p class="product-card-price" aria-label="Price ฿${price}.00"><span class="product-card-price-amount" aria-hidden="true"><span class="product-card-price-currency">฿</span><span>${price}</span><span class="product-card-price-decimals">.<!-- -->00</span></span></p></div></div></div></article>`;
export const YANNICK_SEALED = `<html><body><p>2<!-- --> products</p>${yan('/products/commander-2019-set-of-4', 'Commander 2019 - Set of 4', '5950')}${yan('/products/lorwyn-eclipsed-bundle', 'Lorwyn Eclipsed - Bundle', '1600', 'In stock', 'in')}${yan('/products/old', 'Lorwyn Eclipsed - Play Booster Pack', '200', 'Sold out', 'out')}</body></html>`;

// Sabai /products/sealed (data-page JSON).
const sabaiPage = { props: { datas: { total: 2, per_page: 100, last_page: 1, data: [
  { id: 5748168, original_name: 'The Hobbit Collector Booster Box', name: 'The Hobbit Collector Booster Box', category: 'sealed', type: 'Booster Boxes', quantity: 6, price: 27000, status: 1 },
  { id: 5748169, original_name: 'Final Fantasy Collector Booster Box (Japanese)', name: 'Final Fantasy Collector Booster Box (Japanese)', category: 'sealed', quantity: 1, price: 26000, status: 1 },
] } } };
export const SABAI_SEALED = `<div id="app" data-page="${JSON.stringify(sabaiPage).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div>`;
