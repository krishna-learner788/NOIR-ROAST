-- NOIR ROAST — development seed.
-- ALL VALUES BELOW ARE PROVISIONAL PLACEHOLDERS (price_status / weight_status = 'provisional').
-- Names, origins and tasting notes come from the existing site copy; prices are placeholders;
-- weights come from the existing site copy and are unconfirmed; stock is NULL (= not tracked,
-- we do not invent stock). Keep in sync with src/data/products.js (tests/seed-parity.test.js).
-- Never run this against a production database.

insert into public.products
  (id, name, origin, roast_level, roast_label, tasting_notes, price_paise, price_status,
   weight_grams, weight_status, stock_quantity, is_active, sort_order,
   image_src, image_alt, image_width, image_height, image_position)
values
  ('noir-reserve', 'Noir Reserve', 'Yirgacheffe, Ethiopia', 5, 'Dark',
   array['Dark cherry', 'Bittersweet cocoa', 'Smoked copper'], 89900, 'provisional',
   250, 'provisional', null, true, 10,
   '/images/roast-noir.jpg', 'Dark roasted coffee beans scattered on a slate surface', 1400, 933, null),
  ('copper-hour', 'Copper Hour', 'Huila, Colombia', 3, 'Medium',
   array['Toasted hazelnut', 'Brown sugar', 'Orange peel'], 79900, 'provisional',
   250, 'provisional', null, true, 20,
   '/images/roast-copper.jpg', 'Ground coffee and whole beans on a dark wooden board, seen from above', 1400, 933, null),
  ('first-light', 'First Light', 'Antigua, Guatemala', 2, 'Light',
   array['Honey', 'Red apple', 'Jasmine'], 84900, 'provisional',
   250, 'provisional', null, true, 30,
   '/images/roast-light.jpg', 'Portafilters holding whole beans and freshly ground coffee on a pale steel counter', 1000, 1500, '50% 78%')
on conflict (id) do nothing;
