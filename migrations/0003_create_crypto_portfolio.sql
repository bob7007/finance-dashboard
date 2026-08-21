CREATE TABLE crypto_wallets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE crypto_holdings (
  id TEXT PRIMARY KEY,
  wallet_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  coingecko_id TEXT NOT NULL,
  quantity REAL NOT NULL,
  cost_basis REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id)
    REFERENCES crypto_wallets(id)
    ON DELETE CASCADE
);

CREATE INDEX idx_crypto_holdings_wallet_id
  ON crypto_holdings(wallet_id);
