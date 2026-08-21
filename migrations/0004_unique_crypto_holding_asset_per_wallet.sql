UPDATE crypto_holdings
SET coingecko_id = LOWER(TRIM(coingecko_id));

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_crypto_holdings_wallet_coingecko
ON crypto_holdings(wallet_id, coingecko_id COLLATE NOCASE);
