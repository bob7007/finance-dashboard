CREATE TABLE plaid_items_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  access_token TEXT,
  encrypted_access_token TEXT,
  access_token_iv TEXT,
  institution_id TEXT,
  institution_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO plaid_items_v2 (
  id,
  item_id,
  access_token,
  institution_id,
  institution_name,
  created_at
)
SELECT
  id,
  item_id,
  access_token,
  institution_id,
  institution_name,
  created_at
FROM plaid_items;

DROP TABLE plaid_items;

ALTER TABLE plaid_items_v2 RENAME TO plaid_items;
