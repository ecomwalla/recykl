-- A handful of sample catalog products so the seller page has something to
-- pick from. Real product management (create/edit) isn't built yet.

insert into products (brand, model, grade, spec, owner_type) values
  ('Acme', 'Widget Pro', 'A', 'Standard spec', 'seller'),
  ('Acme', 'Widget Lite', 'B', 'Economy spec', 'seller'),
  ('Globex', 'Gizmo X1', 'A', 'Industrial spec', 'house'),
  ('Initech', 'Bolt 200', 'C', 'Salvage spec', 'house');
