// Store page shapes, trimmed from the real pages on 2026-11-16 (search "gimli").
// Prices and stock are what those pages showed then.

export const GIMLI = {
  object: 'card', name: 'Gimli of the Glittering Caves', type_line: 'Legendary Creature — Dwarf Warrior',
  scryfall_uri: 'https://scryfall.com/card/ltc/115/gimli-of-the-glittering-caves',
  image_uris: { normal: 'https://cards.scryfall.io/normal/front/c/f/cf8443b5.jpg' },
  prices: { usd: '1.10', usd_foil: null, eur: '0.95' },
  purchase_uris: { tcgplayer: 'https://www.tcgplayer.com/product/1', cardmarket: 'https://www.cardmarket.com/x' },
};

export const GIMLI_PRINTS = [
  { ...GIMLI, set_name: 'Tales of Middle-earth Commander', prices: { usd: '1.10', eur: '0.95' } },
  { ...GIMLI, set_name: 'Tales of Middle-earth Commander Extended Art', prices: { usd: '2.40', eur: null },
    purchase_uris: { tcgplayer: 'https://www.tcgplayer.com/product/2' } },
  { ...GIMLI, set_name: 'Promo', prices: { usd: null, eur: null } },
];

// 1st Pick: Shopify predictive search. Product titles are "Name [Set]", one product per printing.
export const FIRSTPICK_SUGGEST = {
  resources: { results: { products: [
    { available: true, handle: 'gimli-of-the-glittering-caves-the-lord-of-the-rings-tales-of-middle-earth-commander',
      title: 'Gimli of the Glittering Caves [The Lord of the Rings: Tales of Middle-Earth Commander]', price: '45.00',
      url: '/products/gimli-of-the-glittering-caves-the-lord-of-the-rings-tales-of-middle-earth-commander?_pos=1&_psq=gimli' },
    { available: true, handle: 'gimlis-axe-the-lord-of-the-rings-tales-of-middle-earth',
      title: "Gimli's Axe [The Lord of the Rings: Tales of Middle-Earth]", price: '6.50', url: '/products/gimlis-axe-the-lord-of-the-rings-tales-of-middle-earth?_pos=2' },
    { available: true, handle: 'gimli-mournful-avenger-the-lord-of-the-rings-tales-of-middle-earth',
      title: 'Gimli, Mournful Avenger [The Lord of the Rings: Tales of Middle-Earth]', price: '9.75', url: '/products/gimli-mournful-avenger?_pos=3' },
  ] } },
};

// Product .js: price is in satang. Each condition is a variant.
export const FIRSTPICK_PRODUCT = {
  title: 'Gimli of the Glittering Caves [The Lord of the Rings: Tales of Middle-Earth Commander]',
  handle: 'gimli-of-the-glittering-caves-the-lord-of-the-rings-tales-of-middle-earth-commander',
  url: '/products/gimli-of-the-glittering-caves-the-lord-of-the-rings-tales-of-middle-earth-commander',
  variants: [
    { title: 'Near Mint', available: true, price: 4500 },
    { title: 'Lightly Played', available: true, price: 4000 },
    { title: 'Moderately Played', available: false, price: 3800 },
    { title: 'Near Mint Foil', available: false, price: 9000 },
  ],
};

// Yannick: server-rendered search page. Only in-stock products get a card.
const yArticle = (slug, name, price, qtyTitle, options) => `<article class="row-product"><a class="row-image" href="/products/${slug}" tabindex="-1"><img src="https://x/i.jpg?w=1"></a><div class="product-card-body"><p class="row-name"><a href="/products/${slug}">${name}</a></p><div class="product-card-bottom"><div class="product-card-meta-row"><p class="row-meta">MTG Single</p><span class="stock-dots" role="img" title="${qtyTitle}"><span class="stock-dot stock-dot--green"></span></span></div><p class="product-stock-label product-stock-label--in">In stock</p><div class="product-inline-buy"><p class="product-card-price"><span class="product-card-price-amount"><span class="product-card-price-currency">฿</span><span>${price}</span><span class="product-card-price-decimals">.00</span></span></p><label class="product-variant-control"><select class="product-variant-select">${options.map(o => `<option value="1">${o}</option>`).join('')}</select></label></div></div></div></article>`;

export const YANNICK_HTML = `<!DOCTYPE html><html><body><main>
${yArticle('gimli-of-the-glittering-caves-115-ltc', 'Gimli of the Glittering Caves (115) (LTC)', '1,250', 'Low stock (1-2) — Total qty: 2', ['Non-Foil - NM'])}
${yArticle('gimlis-fury-131-ltr', 'Gimli&#x27;s Fury (131) (LTR)', '15', 'High stock (7+) — Total qty: 10+', ['Non-Foil - NM', 'Foil - NM'])}
${yArticle('gimli-of-the-glittering-caves-115-ltc-jp', 'Gimli of the Glittering Caves (115) (LTC) Japanese', '30', 'Total qty: 1', ['Non-Foil - NM'])}
</main></body></html>`;

export const YANNICK_SOLD_OUT_HTML = `<main><article class="row-product"><a class="row-image" href="#"></a><p class="row-name">Nothing in stock for this search.</p><p class="row-meta">We know <!-- -->3<!-- --> matching product<!-- -->s<!-- --> that <!-- -->are<!-- --> currently out of stock —<!-- --> <a href="/search">view them</a> and add to your wishlist to be first in line.</p></article></main>`;

// Sabai: Laravel + Inertia, page JSON HTML-escaped in a data-page attribute. Price is whole baht.
const sabaiPage = {
  component: 'Products',
  props: { filters: { search: 'Gimli of the Glittering Caves' }, datas: { total: 3, data: [
    { id: 179789, original_name: 'Gimli of the Glittering Caves', name: 'Gimli of the Glittering Caves (Extended Art)',
      expansion: 'The Lord of the Rings: Tales of Middle-earth Commander Decks Variants', variation: 'regular', quantity: 1, price: 720, status: 1 },
    { id: 179790, original_name: 'Gimli of the Glittering Caves', name: 'Gimli of the Glittering Caves',
      expansion: 'The Lord of the Rings: Tales of Middle-earth Commander Decks', variation: 'regular', quantity: 0, price: 60, status: 1 },
    { id: 96031, original_name: "Gimli's Reckless Might", name: "Gimli's Reckless Might", expansion: 'LTR', variation: 'foil', quantity: 4, price: 25, status: 1 },
  ] } },
};
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#039;');
export const SABAI_HTML = `<!DOCTYPE html><html><body><div id="app" data-page="${attr(JSON.stringify(sabaiPage))}"></div></body></html>`;

export const FX = { result: 'success', rates: { USD: 1, THB: 32.5, EUR: 0.86 } };
