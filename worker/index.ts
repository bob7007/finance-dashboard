interface Env {
  COINGECKO_API_KEY: string;
  FINNHUB_API_KEY: string;
  ALPACA_API_KEY: string;
  ALPACA_API_SECRET: string;
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
  PLAID_TOKEN_ENCRYPTION_KEY: string;
  finance_dashboard_db: D1Database;
  APP_CACHE: KVNamespace;
}

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  image: string | null;
  current_price: number | null;
  price_change_percentage_24h: number | null;
}

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

type BrokerageQuoteSource = "alpaca" | "finnhub";

interface ExternalBrokerageQuote {
  price: number;
  source: BrokerageQuoteSource;
}

const COINGECKO_CATALOG_CACHE_KEY = "coingecko:catalog";
const COINGECKO_CATALOG_TTL_SECONDS = 24 * 60 * 60;

class CoinGeckoCatalogError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CoinGeckoCatalogError";
    this.status = status;
  }
}

type CryptoWalletType =
  | "exchange"
  | "hardware_wallet"
  | "software_wallet"
  | "other";

interface CryptoWalletInput {
  id: string;
  name: string;
  type: CryptoWalletType;
}

interface CryptoHoldingInput {
  id: string;
  symbol: string;
  name: string;
  coinGeckoId: string;
  quantity: number;
  costBasis: number;
}

interface CryptoWalletRow {
  id: string;
  name: string;
  type: CryptoWalletType;
}

interface CryptoHoldingRow {
  id: string;
  wallet_id: string;
  symbol: string;
  name: string;
  coingecko_id: string;
  quantity: number;
  cost_basis: number;
}

const CRYPTO_WALLET_TYPES = new Set<CryptoWalletType>([
  "exchange",
  "hardware_wallet",
  "software_wallet",
  "other",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseCryptoWallet(value: unknown):
  | { wallet: CryptoWalletInput }
  | { error: string } {
  if (!isRecord(value)) {
    return { error: "Wallet is required" };
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const type = value.type;

  if (!id) {
    return { error: "Wallet ID is required" };
  }

  if (!name) {
    return { error: "Wallet name is required" };
  }

  if (
    typeof type !== "string" ||
    !CRYPTO_WALLET_TYPES.has(type as CryptoWalletType)
  ) {
    return { error: "Wallet type is invalid" };
  }

  return {
    wallet: {
      id,
      name,
      type: type as CryptoWalletType,
    },
  };
}

function parseCryptoHoldings(value: unknown):
  | { holdings: CryptoHoldingInput[] }
  | { error: string } {
  if (!Array.isArray(value)) {
    return { error: "Holdings must be an array" };
  }

  if (value.length > 500) {
    return { error: "A maximum of 500 holdings may be imported at once" };
  }

  const holdings: CryptoHoldingInput[] = [];
  const holdingIds = new Set<string>();
  const coinGeckoIds = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const rowNumber = index + 1;
    const holding = value[index];

    if (!isRecord(holding)) {
      return { error: `Holding ${rowNumber} is invalid` };
    }

    const id = typeof holding.id === "string" ? holding.id.trim() : "";
    const symbol =
      typeof holding.symbol === "string"
        ? holding.symbol.trim().toUpperCase()
        : "";
    const name =
      typeof holding.name === "string" ? holding.name.trim() : "";
    const coinGeckoId =
      typeof holding.coinGeckoId === "string"
        ? holding.coinGeckoId.trim().toLowerCase()
        : "";
    const quantity = holding.quantity;
    const costBasis = holding.costBasis;

    if (!id || holdingIds.has(id)) {
      return { error: `Holding ${rowNumber} must have a unique ID` };
    }

    if (!symbol) {
      return { error: `Holding ${rowNumber} must have a symbol` };
    }

    if (!name) {
      return { error: `Holding ${rowNumber} must have a name` };
    }

    if (!coinGeckoId) {
      return { error: `Holding ${rowNumber} must have a CoinGecko ID` };
    }

    if (coinGeckoIds.has(coinGeckoId)) {
      return {
        error:
          `Holding ${rowNumber} duplicates CoinGecko ID "${coinGeckoId}". ` +
          "Each asset may appear only once per wallet.",
      };
    }

    if (
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return { error: `Holding ${rowNumber} has an invalid quantity` };
    }

    if (
      typeof costBasis !== "number" ||
      !Number.isFinite(costBasis) ||
      costBasis < 0
    ) {
      return { error: `Holding ${rowNumber} has an invalid cost basis` };
    }

    holdingIds.add(id);
    coinGeckoIds.add(coinGeckoId);
    holdings.push({
      id,
      symbol,
      name,
      coinGeckoId,
      quantity,
      costBasis,
    });
  }

  return { holdings };
}

function normalizeCryptoHolding(
  holding: CryptoHoldingRow
) {
  return {
    id: holding.id,
    walletId: holding.wallet_id,
    symbol: holding.symbol,
    name: holding.name,
    coinGeckoId: holding.coingecko_id.trim().toLowerCase(),
    quantity: holding.quantity,
    costBasis: holding.cost_basis,
  };
}

function prepareCryptoHoldingsInsert(
  database: D1Database,
  walletId: string,
  holdings: CryptoHoldingInput[],
  requireEmptyWallet: boolean
) {
  const emptyWalletClause = requireEmptyWallet
    ? `
      WHERE NOT EXISTS (
        SELECT 1
        FROM crypto_holdings
        WHERE wallet_id = ?
      )
    `
    : "";
  const statement = database.prepare(`
    INSERT INTO crypto_holdings (
      id,
      wallet_id,
      symbol,
      name,
      coingecko_id,
      quantity,
      cost_basis
    )
    SELECT
      json_extract(value, '$.id'),
      ?,
      json_extract(value, '$.symbol'),
      json_extract(value, '$.name'),
      json_extract(value, '$.coinGeckoId'),
      json_extract(value, '$.quantity'),
      json_extract(value, '$.costBasis')
    FROM json_each(?)
    ${emptyWalletClause}
  `);
  const serializedHoldings = JSON.stringify(holdings);

  return requireEmptyWallet
    ? statement.bind(walletId, serializedHoldings, walletId)
    : statement.bind(walletId, serializedHoldings);
}

function isConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("UNIQUE constraint failed") ||
      error.message.includes("FOREIGN KEY constraint failed"))
  );
}

function isWalletAssetConstraintError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("UNIQUE constraint failed") &&
    error.message.includes("crypto_holdings.wallet_id") &&
    error.message.includes("crypto_holdings.coingecko_id")
  );
}

function normalizeCoinGeckoCoin(value: unknown): CoinGeckoCoin | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.symbol !== "string" ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  const id = value.id.trim().toLowerCase();
  const symbol = value.symbol.trim().toLowerCase();
  const name = value.name.trim();

  return id && symbol && name
    ? { id, symbol, name }
    : null;
}

function normalizeCoinGeckoCatalog(
  value: unknown,
  rejectInvalidEntries: boolean
) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const coins: CoinGeckoCoin[] = [];

  for (const valueEntry of value) {
    const coin = normalizeCoinGeckoCoin(valueEntry);

    if (!coin) {
      if (rejectInvalidEntries) {
        return null;
      }

      continue;
    }

    coins.push(coin);
  }

  return coins.length > 0 ? coins : null;
}

async function fetchCoinGeckoCatalogFromApi(env: Env) {
  if (!env.COINGECKO_API_KEY) {
    throw new CoinGeckoCatalogError(
      "CoinGecko catalog validation is not configured",
      500
    );
  }

  let response: Response;

  try {
    response = await fetch(
      "https://api.coingecko.com/api/v3/coins/list",
      {
        headers: {
          "x-cg-demo-api-key": env.COINGECKO_API_KEY,
        },
      }
    );
  } catch {
    throw new CoinGeckoCatalogError(
      "Unable to load CoinGecko asset validation data",
      502
    );
  }

  if (!response.ok) {
    throw new CoinGeckoCatalogError(
      "Unable to load CoinGecko asset validation data",
      502
    );
  }

  const data = (await response.json()) as unknown;

  const coins = normalizeCoinGeckoCatalog(data, false);

  if (!coins) {
    throw new CoinGeckoCatalogError(
      "CoinGecko returned invalid asset validation data",
      502
    );
  }

  return coins;
}

async function getCoinGeckoCatalog(
  env: Env,
  forceRefresh = false
) {
  if (!forceRefresh) {
    try {
      const cachedValue = await env.APP_CACHE.get(
        COINGECKO_CATALOG_CACHE_KEY,
        "json"
      );
      const cachedCoins = normalizeCoinGeckoCatalog(
        cachedValue,
        true
      );

      if (cachedCoins) {
        return cachedCoins;
      }
    } catch {
      // Malformed or unreadable cached JSON is treated as a cache miss.
    }
  }

  const coins = await fetchCoinGeckoCatalogFromApi(env);

  try {
    await env.APP_CACHE.put(
      COINGECKO_CATALOG_CACHE_KEY,
      JSON.stringify(coins),
      { expirationTtl: COINGECKO_CATALOG_TTL_SECONDS }
    );
  } catch {
    throw new CoinGeckoCatalogError(
      "Unable to update CoinGecko asset cache",
      500
    );
  }

  return coins;
}

async function getInvalidCoinGeckoIds(
  holdings: CryptoHoldingInput[],
  env: Env
) {
  if (holdings.length === 0) {
    return [];
  }

  const catalog = await getCoinGeckoCatalog(env);
  const validIds = new Set(
    catalog.map((coin) => coin.id)
  );
  const requestedIds = new Set(
    holdings.map((holding) => holding.coinGeckoId)
  );

  return Array.from(requestedIds)
    .filter((id) => !validIds.has(id))
    .sort();
}

async function fetchAlpacaBrokerageQuotes(
  symbols: string[],
  env: Env
) {
  const quotes: Record<string, ExternalBrokerageQuote> = {};

  if (!env.ALPACA_API_KEY || !env.ALPACA_API_SECRET) {
    return { quotes, requestSucceeded: false };
  }

  try {
    const tradesUrl = new URL(
      "https://data.alpaca.markets/v2/stocks/trades/latest"
    );
    tradesUrl.searchParams.set("symbols", symbols.join(","));
    tradesUrl.searchParams.set("feed", "iex");

    const response = await fetch(tradesUrl, {
      headers: {
        "APCA-API-KEY-ID": env.ALPACA_API_KEY,
        "APCA-API-SECRET-KEY": env.ALPACA_API_SECRET,
      },
    });

    if (!response.ok) {
      return { quotes, requestSucceeded: false };
    }

    const data = (await response.json()) as unknown;

    if (!isRecord(data) || !isRecord(data.trades)) {
      return { quotes, requestSucceeded: false };
    }

    const requestedSymbols = new Set(symbols);

    for (const [rawSymbol, trade] of Object.entries(data.trades)) {
      const symbol = rawSymbol.trim().toUpperCase();
      const price = isRecord(trade) ? trade.p : undefined;

      if (
        requestedSymbols.has(symbol) &&
        typeof price === "number" &&
        Number.isFinite(price) &&
        price > 0
      ) {
        quotes[symbol] = { price, source: "alpaca" };
      }
    }

    return { quotes, requestSucceeded: true };
  } catch {
    return { quotes, requestSucceeded: false };
  }
}

async function fetchFinnhubBrokerageQuotes(
  symbols: string[],
  env: Env
) {
  const quotes: Record<string, ExternalBrokerageQuote> = {};

  if (symbols.length === 0) {
    return { quotes, requestSucceeded: true };
  }

  if (!env.FINNHUB_API_KEY) {
    return { quotes, requestSucceeded: false };
  }

  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const quoteUrl = new URL(
          "https://finnhub.io/api/v1/quote"
        );
        quoteUrl.searchParams.set("symbol", symbol);

        const response = await fetch(quoteUrl, {
          headers: {
            "X-Finnhub-Token": env.FINNHUB_API_KEY,
          },
        });

        if (!response.ok) {
          return { symbol, requestSucceeded: false };
        }

        const quote = (await response.json()) as unknown;
        const price = isRecord(quote) ? quote.c : undefined;

        return typeof price === "number" &&
          Number.isFinite(price) &&
          price > 0
          ? { symbol, price, requestSucceeded: true }
          : { symbol, requestSucceeded: true };
      } catch {
        return { symbol, requestSucceeded: false };
      }
    })
  );

  for (const result of results) {
    if ("price" in result && result.price !== undefined) {
      quotes[result.symbol] = {
        price: result.price,
        source: "finnhub",
      };
    }
  }

  return {
    quotes,
    requestSucceeded: results.some(
      (result) => result.requestSucceeded
    ),
  };
}

interface PlaidAccount {
  account_id: string;
  name: string;
  official_name: string | null;
  type: string;
  subtype: string | null;
  mask: string | null;

  balances: {
    available: number | null;
    current: number | null;
    limit: number | null;
    iso_currency_code: string | null;
  };
}

interface PlaidHolding {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price: number | null;
  institution_price_as_of: string | null;
  institution_value: number | null;
  cost_basis: number | null;
  iso_currency_code: string | null;
}

interface PlaidSecurity {
  security_id: string;
  proxy_security_id: string | null;
  ticker_symbol: string | null;
  name: string | null;
  type: string | null;
  subtype: string | null;
  is_cash_equivalent: boolean;
}

interface PlaidInvestmentsResponse {
  accounts?: PlaidAccount[];
  holdings?: PlaidHolding[];
  securities?: PlaidSecurity[];

  error_type?: string;
  error_code?: string;
  error_message?: string;
}

interface StoredPlaidItem {
  item_id: string;
  access_token: string | null;
  encrypted_access_token: string | null;
  access_token_iv: string | null;
}

const PLAID_TOKEN_IV_BYTES = 12;

function base64ToBytes(
  value: string,
  fieldName: string
) {
  let binary: string;

  try {
    binary = atob(value);
  } catch {
    throw new Error(
      `${fieldName} must be valid Base64`
    );
  }

  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function getPlaidTokenEncryptionKey(
  env: Env
) {
  if (!env.PLAID_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "PLAID_TOKEN_ENCRYPTION_KEY is missing"
    );
  }

  const keyBytes = base64ToBytes(
    env.PLAID_TOKEN_ENCRYPTION_KEY,
    "PLAID_TOKEN_ENCRYPTION_KEY"
  );

  if (keyBytes.byteLength !== 32) {
    throw new Error(
      "PLAID_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes"
    );
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptPlaidAccessToken(
  accessToken: string,
  env: Env
) {
  const key =
    await getPlaidTokenEncryptionKey(env);

  const iv = crypto.getRandomValues(
    new Uint8Array(PLAID_TOKEN_IV_BYTES)
  );

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    new TextEncoder().encode(accessToken)
  );

  return {
    ciphertext: bytesToBase64(
      new Uint8Array(ciphertext)
    ),
    iv: bytesToBase64(iv),
  };
}

async function getPlaidAccessToken(
  item: StoredPlaidItem,
  env: Env
) {
  if (
    item.encrypted_access_token ||
    item.access_token_iv
  ) {
    if (
      !item.encrypted_access_token ||
      !item.access_token_iv
    ) {
      throw new Error(
        `Encrypted token data is incomplete for Item ${item.item_id}`
      );
    }

    const key =
      await getPlaidTokenEncryptionKey(env);
    const iv = base64ToBytes(
      item.access_token_iv,
      "access_token_iv"
    );

    if (iv.byteLength !== PLAID_TOKEN_IV_BYTES) {
      throw new Error(
        "access_token_iv must decode to exactly 12 bytes"
      );
    }

    const ciphertext = base64ToBytes(
      item.encrypted_access_token,
      "encrypted_access_token"
    );

    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv,
        },
        key,
        ciphertext
      );

      return new TextDecoder().decode(plaintext);
    } catch {
      throw new Error(
        `Unable to decrypt token for Item ${item.item_id}`
      );
    }
  }

  if (item.access_token) {
    return item.access_token;
  }

  throw new Error(
    `No Plaid access token is stored for Item ${item.item_id}`
  );
}

function getPlaidBaseUrl(env: Env) {
  if (env.PLAID_ENV === "sandbox") {
    return "https://sandbox.plaid.com";
  }

  if (env.PLAID_ENV === "production") {
    return "https://production.plaid.com";
  }

  throw new Error(
    `Unsupported PLAID_ENV: ${env.PLAID_ENV}`
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const redirectUri =
      env.PLAID_ENV === "production"
        ? "https://terminal.7007solutions.com/oauth-return"
        : undefined;

    // --------------------------------------------------
    // Get current brokerage quotes from Alpaca, Finnhub fallback
    // --------------------------------------------------
    if (
      url.pathname === "/api/brokerage/quotes" &&
      request.method === "GET"
    ) {
      const requestedSymbols =
        url.searchParams
          .get("symbols")
          ?.split(",")
          .map((symbol) => symbol.trim().toUpperCase())
          .filter(Boolean) ?? [];
      const symbols = Array.from(new Set(requestedSymbols));

      if (symbols.length === 0) {
        return Response.json(
          { error: "At least one ticker symbol is required" },
          { status: 400 }
        );
      }

      if (
        symbols.length > 100 ||
        symbols.some(
          (symbol) =>
            symbol.length > 20 ||
            !/^[A-Z0-9][A-Z0-9.-]*$/.test(symbol)
        )
      ) {
        return Response.json(
          { error: "One or more ticker symbols are invalid" },
          { status: 400 }
        );
      }

      const alpacaResult = await fetchAlpacaBrokerageQuotes(
        symbols,
        env
      );
      const unresolvedSymbols = symbols.filter(
        (symbol) => !alpacaResult.quotes[symbol]
      );
      const finnhubResult = await fetchFinnhubBrokerageQuotes(
        unresolvedSymbols,
        env
      );

      if (
        !alpacaResult.requestSucceeded &&
        !finnhubResult.requestSucceeded
      ) {
        return Response.json(
          { error: "Unable to retrieve brokerage prices" },
          { status: 502 }
        );
      }

      const quotes = {
        ...alpacaResult.quotes,
        ...finnhubResult.quotes,
      };

      return Response.json({ quotes });
    }

    // --------------------------------------------------
    // Get the CoinGecko asset catalog used for CSV validation
    // --------------------------------------------------
    if (
      url.pathname === "/api/crypto/coins" &&
      request.method === "GET"
    ) {
      try {
        const coins = await getCoinGeckoCatalog(env);
        return Response.json({ coins });
      } catch (error) {
        if (error instanceof CoinGeckoCatalogError) {
          return Response.json(
            { error: error.message },
            { status: error.status }
          );
        }

        console.error("CoinGecko catalog error");
        return Response.json(
          { error: "Unable to load CoinGecko asset validation data" },
          { status: 502 }
        );
      }
    }

    // --------------------------------------------------
    // Force-refresh the cached CoinGecko asset catalog
    // --------------------------------------------------
    if (
      url.pathname === "/api/crypto/coins/refresh" &&
      request.method === "POST"
    ) {
      try {
        const coins = await getCoinGeckoCatalog(env, true);
        return Response.json({ coins });
      } catch (error) {
        if (error instanceof CoinGeckoCatalogError) {
          return Response.json(
            { error: error.message },
            { status: error.status }
          );
        }

        console.error("CoinGecko catalog refresh error");
        return Response.json(
          { error: "Unable to refresh CoinGecko asset validation data" },
          { status: 502 }
        );
      }
    }

    // --------------------------------------------------
    // Get normalized crypto market prices
    // --------------------------------------------------
    if (
      url.pathname === "/api/crypto/prices" &&
      request.method === "GET"
    ) {
      const requestedIds =
        url.searchParams
          .get("ids")
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) ?? [];
      const coinGeckoIds = Array.from(
        new Set(requestedIds)
      );

      if (coinGeckoIds.length === 0) {
        return Response.json(
          { error: "At least one CoinGecko ID is required" },
          { status: 400 }
        );
      }

      if (
        coinGeckoIds.length > 100 ||
        coinGeckoIds.some(
          (id) =>
            id.length > 100 ||
            !/^[a-z0-9-]+$/.test(id)
        )
      ) {
        return Response.json(
          { error: "One or more CoinGecko IDs are invalid" },
          { status: 400 }
        );
      }

      if (!env.COINGECKO_API_KEY) {
        return Response.json(
          { error: "Crypto pricing is not configured" },
          { status: 500 }
        );
      }

      try {
        const coinGeckoUrl = new URL(
          "https://api.coingecko.com/api/v3/coins/markets"
        );
        coinGeckoUrl.search = new URLSearchParams({
          vs_currency: "usd",
          ids: coinGeckoIds.join(","),
        }).toString();

        const response = await fetch(coinGeckoUrl, {
          headers: {
            "x-cg-demo-api-key": env.COINGECKO_API_KEY,
          },
        });

        if (!response.ok) {
          return Response.json(
            { error: "Unable to retrieve crypto prices" },
            { status: response.status }
          );
        }

        const marketData =
          (await response.json()) as CoinGeckoMarket[];
        const prices: Record<
          string,
          {
            symbol: string;
            name: string;
            image: string | null;
            price: number;
            change24h: number;
          }
        > = {};

        for (const coin of marketData) {
          if (
            !coinGeckoIds.includes(coin.id) ||
            !Number.isFinite(coin.current_price)
          ) {
            continue;
          }

          prices[coin.id] = {
            symbol: coin.symbol.toUpperCase(),
            name: coin.name,
            image:
              typeof coin.image === "string" &&
              coin.image.startsWith("https://")
                ? coin.image
                : null,
            price: coin.current_price as number,
            change24h: Number.isFinite(
              coin.price_change_percentage_24h
            )
              ? (coin.price_change_percentage_24h as number)
              : 0,
          };
        }

        return Response.json({ prices });
      } catch (error) {
        console.error(
          "Crypto pricing error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to retrieve crypto prices" },
          { status: 502 }
        );
      }
    }

    // --------------------------------------------------
    // Get persisted crypto ownership data
    // --------------------------------------------------
    if (
      url.pathname === "/api/crypto" &&
      request.method === "GET"
    ) {
      try {
        const [walletResult, holdingResult] = await Promise.all([
          env.finance_dashboard_db
            .prepare(`
              SELECT id, name, type
              FROM crypto_wallets
              ORDER BY created_at, id
            `)
            .all<CryptoWalletRow>(),
          env.finance_dashboard_db
            .prepare(`
              SELECT
                id,
                wallet_id,
                symbol,
                name,
                coingecko_id,
                quantity,
                cost_basis
              FROM crypto_holdings
              ORDER BY created_at, id
            `)
            .all<CryptoHoldingRow>(),
        ]);

        return Response.json({
          wallets: walletResult.results,
          holdings: holdingResult.results.map(
            normalizeCryptoHolding
          ),
        });
      } catch (error) {
        console.error(
          "Crypto portfolio load error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to load saved crypto portfolio" },
          { status: 500 }
        );
      }
    }

    // --------------------------------------------------
    // Create wallet with optional holdings
    // --------------------------------------------------
    if (
      url.pathname === "/api/crypto/wallets" &&
      request.method === "POST"
    ) {
      try {
        const body = (await request.json()) as unknown;

        if (!isRecord(body)) {
          return Response.json(
            { error: "Request body is invalid" },
            { status: 400 }
          );
        }

        const walletResult = parseCryptoWallet(body.wallet);
        const holdingResult = parseCryptoHoldings(
          body.holdings ?? []
        );

        if ("error" in walletResult) {
          return Response.json(
            { error: walletResult.error },
            { status: 400 }
          );
        }

        if ("error" in holdingResult) {
          return Response.json(
            { error: holdingResult.error },
            { status: 400 }
          );
        }

        const { wallet } = walletResult;
        const { holdings } = holdingResult;
        const invalidCoinGeckoIds =
          await getInvalidCoinGeckoIds(holdings, env);

        if (invalidCoinGeckoIds.length > 0) {
          return Response.json(
            {
              error:
                `Invalid CoinGecko IDs: ${invalidCoinGeckoIds.join(", ")}`,
            },
            { status: 400 }
          );
        }

        const statements: D1PreparedStatement[] = [
          env.finance_dashboard_db
            .prepare(`
              INSERT INTO crypto_wallets (id, name, type)
              VALUES (?, ?, ?)
            `)
            .bind(wallet.id, wallet.name, wallet.type),
        ];

        if (holdings.length > 0) {
          statements.push(
            prepareCryptoHoldingsInsert(
              env.finance_dashboard_db,
              wallet.id,
              holdings,
              false
            )
          );
        }

        await env.finance_dashboard_db.batch(statements);

        return Response.json(
          {
            wallet,
            holdings: holdings.map((holding) => ({
              ...holding,
              walletId: wallet.id,
            })),
          },
          { status: 201 }
        );
      } catch (error) {
        if (error instanceof CoinGeckoCatalogError) {
          return Response.json(
            { error: error.message },
            { status: error.status }
          );
        }

        if (isWalletAssetConstraintError(error)) {
          return Response.json(
            { error: "This wallet already contains that asset." },
            { status: 409 }
          );
        }

        if (isConstraintError(error)) {
          return Response.json(
            { error: "Wallet or holding already exists" },
            { status: 409 }
          );
        }

        console.error(
          "Crypto wallet creation error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to create wallet" },
          { status: 500 }
        );
      }
    }

    const cryptoWalletHoldingsMatch =
      url.pathname.match(
        /^\/api\/crypto\/wallets\/([^/]+)\/holdings$/
      );

    // --------------------------------------------------
    // Import holdings into an empty wallet
    // --------------------------------------------------
    if (
      cryptoWalletHoldingsMatch &&
      request.method === "POST"
    ) {
      const walletId = cryptoWalletHoldingsMatch[1];

      try {
        const body = (await request.json()) as unknown;
        const holdingResult = parseCryptoHoldings(
          isRecord(body) ? body.holdings : undefined
        );

        if ("error" in holdingResult) {
          return Response.json(
            { error: holdingResult.error },
            { status: 400 }
          );
        }

        if (holdingResult.holdings.length === 0) {
          return Response.json(
            { error: "At least one holding is required" },
            { status: 400 }
          );
        }

        const invalidCoinGeckoIds =
          await getInvalidCoinGeckoIds(
            holdingResult.holdings,
            env
          );

        if (invalidCoinGeckoIds.length > 0) {
          return Response.json(
            {
              error:
                `Invalid CoinGecko IDs: ${invalidCoinGeckoIds.join(", ")}`,
            },
            { status: 400 }
          );
        }

        const wallet = await env.finance_dashboard_db
          .prepare(`
            SELECT id
            FROM crypto_wallets
            WHERE id = ?
          `)
          .bind(walletId)
          .first<{ id: string }>();

        if (!wallet) {
          return Response.json(
            { error: "Wallet not found" },
            { status: 404 }
          );
        }

        const holdings = holdingResult.holdings;
        const insertResult = await prepareCryptoHoldingsInsert(
          env.finance_dashboard_db,
          walletId,
          holdings,
          true
        ).run();

        if (insertResult.meta.changes !== holdings.length) {
          return Response.json(
            {
              error:
                "Remove all existing holdings before importing a CSV.",
            },
            { status: 409 }
          );
        }

        return Response.json(
          {
            holdings: holdings.map((holding) => ({
              ...holding,
              walletId,
            })),
          },
          { status: 201 }
        );
      } catch (error) {
        if (error instanceof CoinGeckoCatalogError) {
          return Response.json(
            { error: error.message },
            { status: error.status }
          );
        }

        if (isWalletAssetConstraintError(error)) {
          return Response.json(
            { error: "This wallet already contains that asset." },
            { status: 409 }
          );
        }

        if (isConstraintError(error)) {
          return Response.json(
            { error: "One or more holdings already exist" },
            { status: 409 }
          );
        }

        console.error(
          "Crypto holdings import error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to import holdings" },
          { status: 500 }
        );
      }
    }

    // --------------------------------------------------
    // Remove all holdings from one wallet
    // --------------------------------------------------
    if (
      cryptoWalletHoldingsMatch &&
      request.method === "DELETE"
    ) {
      const walletId = cryptoWalletHoldingsMatch[1];

      try {
        const wallet = await env.finance_dashboard_db
          .prepare("SELECT id FROM crypto_wallets WHERE id = ?")
          .bind(walletId)
          .first<{ id: string }>();

        if (!wallet) {
          return Response.json(
            { error: "Wallet not found" },
            { status: 404 }
          );
        }

        await env.finance_dashboard_db
          .prepare("DELETE FROM crypto_holdings WHERE wallet_id = ?")
          .bind(walletId)
          .run();

        return Response.json({ success: true });
      } catch (error) {
        console.error(
          "Crypto holdings removal error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to remove holdings" },
          { status: 500 }
        );
      }
    }

    const cryptoWalletMatch =
      url.pathname.match(/^\/api\/crypto\/wallets\/([^/]+)$/);

    // --------------------------------------------------
    // Update wallet metadata
    // --------------------------------------------------
    if (cryptoWalletMatch && request.method === "PUT") {
      const walletId = cryptoWalletMatch[1];

      try {
        const body = (await request.json()) as unknown;
        const walletResult = parseCryptoWallet({
          ...(isRecord(body) ? body : {}),
          id: walletId,
        });

        if ("error" in walletResult) {
          return Response.json(
            { error: walletResult.error },
            { status: 400 }
          );
        }

        const result = await env.finance_dashboard_db
          .prepare(`
            UPDATE crypto_wallets
            SET name = ?, type = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(
            walletResult.wallet.name,
            walletResult.wallet.type,
            walletId
          )
          .run();

        if (result.meta.changes === 0) {
          return Response.json(
            { error: "Wallet not found" },
            { status: 404 }
          );
        }

        return Response.json({ wallet: walletResult.wallet });
      } catch (error) {
        console.error(
          "Crypto wallet update error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to update wallet" },
          { status: 500 }
        );
      }
    }

    // --------------------------------------------------
    // Delete an empty wallet
    // --------------------------------------------------
    if (cryptoWalletMatch && request.method === "DELETE") {
      const walletId = cryptoWalletMatch[1];

      try {
        const result = await env.finance_dashboard_db
          .prepare(`
            DELETE FROM crypto_wallets
            WHERE id = ?
              AND NOT EXISTS (
                SELECT 1
                FROM crypto_holdings
                WHERE wallet_id = ?
              )
          `)
          .bind(walletId, walletId)
          .run();

        if (result.meta.changes === 0) {
          const wallet = await env.finance_dashboard_db
            .prepare("SELECT id FROM crypto_wallets WHERE id = ?")
            .bind(walletId)
            .first<{ id: string }>();

          return Response.json(
            {
              error: wallet
                ? "Remove all holdings before deleting this wallet."
                : "Wallet not found",
            },
            { status: wallet ? 409 : 404 }
          );
        }

        return Response.json({ success: true });
      } catch (error) {
        console.error(
          "Crypto wallet deletion error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to delete wallet" },
          { status: 500 }
        );
      }
    }

    const cryptoHoldingMatch =
      url.pathname.match(/^\/api\/crypto\/holdings\/([^/]+)$/);

    // --------------------------------------------------
    // Remove one holding by its unique ID
    // --------------------------------------------------
    if (cryptoHoldingMatch && request.method === "DELETE") {
      const holdingId = cryptoHoldingMatch[1];

      try {
        const result = await env.finance_dashboard_db
          .prepare("DELETE FROM crypto_holdings WHERE id = ?")
          .bind(holdingId)
          .run();

        if (result.meta.changes === 0) {
          return Response.json(
            { error: "Holding not found" },
            { status: 404 }
          );
        }

        return Response.json({ success: true });
      } catch (error) {
        console.error(
          "Crypto holding deletion error:",
          error instanceof Error ? error.message : "Unknown error"
        );

        return Response.json(
          { error: "Unable to remove holding" },
          { status: 500 }
        );
      }
    }

    // --------------------------------------------------
    // Create Plaid Link token
    // --------------------------------------------------
    if (
      url.pathname === "/api/plaid/link-token" &&
      request.method === "GET"
    ) {
      const response = await fetch(
        `${getPlaidBaseUrl(env)}/link/token/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: env.PLAID_CLIENT_ID,
            secret: env.PLAID_SECRET,

            client_name: "Personal Finance Dashboard",

            user: {
              client_user_id: "personal-finance-user",
            },

            products: ["transactions"],
            additional_consented_products: [
              "investments",
              "liabilities"
            ],

            transactions: {
              days_requested: 30,
            },

            country_codes: ["US"],
            language: "en",
            redirect_uri:redirectUri,
          }),
        }
      );

      const data = await response.json();

      return Response.json(data, {
        status: response.status,
      });
    }

    // --------------------------------------------------
    // Get raw investment holdings
    // Debug endpoint
    // --------------------------------------------------
    if (
      url.pathname === "/api/investments" &&
      request.method === "GET"
    ) {
      try {
        const result = await env.finance_dashboard_db
          .prepare(`
            SELECT
              item_id,
              access_token,
              encrypted_access_token,
              access_token_iv
            FROM plaid_items
          `)
          .all<StoredPlaidItem>();

        const accounts: PlaidAccount[] = [];
        const holdings: PlaidHolding[] = [];
        const securities: PlaidSecurity[] = [];

        for (const item of result.results) {
          const accessToken =
            await getPlaidAccessToken(item, env);

          const response = await fetch(
            `${getPlaidBaseUrl(env)}/investments/holdings/get`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: env.PLAID_CLIENT_ID,
                secret: env.PLAID_SECRET,
                access_token: accessToken,
              }),
            }
          );

          const data =
            (await response.json()) as PlaidInvestmentsResponse;

          if (!response.ok) {
            console.log(
              `No investments for Item ${item.item_id}:`,
              data.error_message
            );

            continue;
          }

          accounts.push(...(data.accounts ?? []));
          holdings.push(...(data.holdings ?? []));
          securities.push(...(data.securities ?? []));
        }

        return Response.json({
          accounts,
          holdings,
          securities,
        });
      } catch (error) {
        console.error("Investments error:", error);

        return Response.json(
          {
            error: "Unable to retrieve investments",
          },
          {
            status: 500,
          }
        );
      }
    }

    // --------------------------------------------------
    // Get normalized portfolio
    // This is what React will use
    // --------------------------------------------------
    if (
      url.pathname === "/api/portfolio" &&
      request.method === "GET"
    ) {
      try {
        const result = await env.finance_dashboard_db
          .prepare(`
            SELECT
              item_id,
              access_token,
              encrypted_access_token,
              access_token_iv
            FROM plaid_items
          `)
          .all<StoredPlaidItem>();

        const portfolioAccounts: Array<{
          itemId: string;
          accountId: string;
          name: string;
          subtype: string | null;
          mask: string | null;
          value: number;
          currency: string | null;
        }> = [];

        const portfolioHoldings: Array<{
          itemId: string;
          accountId: string;
          accountName: string;

          securityId: string;

          ticker: string;
          name: string;
          securityType: string | null;

          quantity: number;

          price: number | null;
          priceAsOf: string | null;

          value: number | null;
          costBasis: number | null;

          gain: number | null;
          gainPercent: number | null;

          currency: string | null;
        }> = [];

        for (const item of result.results) {
          const accessToken =
            await getPlaidAccessToken(item, env);

          const response = await fetch(
            `${getPlaidBaseUrl(env)}/investments/holdings/get`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                client_id: env.PLAID_CLIENT_ID,
                secret: env.PLAID_SECRET,
                access_token: accessToken,
              }),
            }
          );

          const data =
            (await response.json()) as PlaidInvestmentsResponse;

          if (!response.ok) {
            console.log(
              `Skipping non-investment Item ${item.item_id}:`,
              data.error_message
            );

            continue;
          }

          const allAccounts = data.accounts ?? [];
          const holdings = data.holdings ?? [];
          const securities = data.securities ?? [];

          // Only actual investment accounts belong
          // in the portfolio.
          const investmentAccounts =
            allAccounts.filter(
              (account) => account.type === "investment"
            );

          const investmentAccountIds = new Set(
            investmentAccounts.map(
              (account) => account.account_id
            )
          );

          // --------------------------------------------------
          // Build security lookup
          // security_id -> security information
          // --------------------------------------------------
          const securityMap = new Map<
            string,
            PlaidSecurity
          >();

          for (const security of securities) {
            securityMap.set(
              security.security_id,
              security
            );
          }

          // --------------------------------------------------
          // Normalize investment accounts
          // --------------------------------------------------
          for (const account of investmentAccounts) {
            portfolioAccounts.push({
              itemId: item.item_id,

              accountId: account.account_id,

              name: account.name,

              subtype: account.subtype,

              mask: account.mask,

              value:
                account.balances.current ?? 0,

              currency:
                account.balances.iso_currency_code,
            });
          }

          // --------------------------------------------------
          // Normalize holdings
          // --------------------------------------------------
          for (const holding of holdings) {
            // Ignore holdings belonging to
            // non-investment accounts.
            if (
              !investmentAccountIds.has(
                holding.account_id
              )
            ) {
              continue;
            }

            const account =
              investmentAccounts.find(
                (account) =>
                  account.account_id ===
                  holding.account_id
              );

            const security =
              securityMap.get(
                holding.security_id
              );

            // Some securities use a proxy security.
            // Example: a fund may point to another
            // security record containing the ticker.
            const proxySecurity =
              security?.proxy_security_id
                ? securityMap.get(
                    security.proxy_security_id
                  )
                : undefined;

            let ticker =
              security?.ticker_symbol ??
              proxySecurity?.ticker_symbol ??
              "";

            if (
              !ticker &&
              security?.is_cash_equivalent
            ) {
              ticker = "CASH";
            }

            if (!ticker) {
              ticker = "—";
            }

            const name =
              security?.name ??
              proxySecurity?.name ??
              "Unknown Security";

            const value =
              holding.institution_value;

            const costBasis =
              holding.cost_basis;

            let gain: number | null = null;
            let gainPercent: number | null =
              null;

            if (
              value !== null &&
              costBasis !== null
            ) {
              gain = value - costBasis;

              if (costBasis !== 0) {
                gainPercent =
                  (gain / costBasis) * 100;
              }
            }

            portfolioHoldings.push({
              itemId: item.item_id,

              accountId:
                holding.account_id,

              accountName:
                account?.name ??
                "Investment Account",

              securityId:
                holding.security_id,

              ticker,

              name,

              securityType:
                security?.type ??
                proxySecurity?.type ??
                null,

              quantity:
                holding.quantity,

              price:
                holding.institution_price,

              priceAsOf:
                holding.institution_price_as_of,

              value,

              costBasis,

              gain,

              gainPercent,

              currency:
                holding.iso_currency_code,
            });
          }
        }

        // Largest positions first
        portfolioHoldings.sort(
          (a, b) =>
            (b.value ?? 0) -
            (a.value ?? 0)
        );

        const totalValue =
          portfolioAccounts.reduce(
            (total, account) =>
              total + account.value,
            0
          );

        return Response.json({
          totalValue,

          plaidEnvironment: env.PLAID_ENV,

          accounts: portfolioAccounts,

          holdings: portfolioHoldings,
        });
      } catch (error) {
        console.error(
          "Portfolio error:",
          error
        );

        return Response.json(
          {
            error:
              "Unable to retrieve portfolio",
          },
          {
            status: 500,
          }
        );
      }
    }

    // --------------------------------------------------
    // Exchange public_token for access_token
    // and save connection in D1
    // --------------------------------------------------
    if (
      url.pathname === "/api/plaid/exchange" &&
      request.method === "POST"
    ) {
      const body =
        (await request.json()) as {
          public_token?: string;
        };

      if (!body.public_token) {
        return Response.json(
          {
            error:
              "public_token is required",
          },
          {
            status: 400,
          }
        );
      }

      const response = await fetch(
        `${getPlaidBaseUrl(env)}/item/public_token/exchange`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            client_id:
              env.PLAID_CLIENT_ID,

            secret:
              env.PLAID_SECRET,

            public_token:
              body.public_token,
          }),
        }
      );

      const data =
        (await response.json()) as {
          access_token?: string;
          item_id?: string;
          request_id?: string;
          error_type?: string;
          error_code?: string;
          error_message?: string;
        };

      if (
        !response.ok ||
        !data.access_token ||
        !data.item_id
      ) {
        return Response.json(data, {
          status: response.status,
        });
      }

      try {
        const encryptedToken =
          await encryptPlaidAccessToken(
            data.access_token,
            env
          );

        await env.finance_dashboard_db
          .prepare(`
            INSERT INTO plaid_items (
              item_id,
              access_token,
              encrypted_access_token,
              access_token_iv
            )
            VALUES (?, NULL, ?, ?)
          `)
          .bind(
            data.item_id,
            encryptedToken.ciphertext,
            encryptedToken.iv
          )
          .run();
      } catch (error) {
        console.error(
          "Unable to encrypt Plaid access token:",
          error
        );

        return Response.json(
          {
            error:
              "Unable to securely store Plaid access token",
          },
          {
            status: 500,
          }
        );
      }

      // Never expose access_token to React
      return Response.json({
        success: true,
        item_id: data.item_id,
      });
    }

    // --------------------------------------------------
    // Get connected Plaid accounts
    // --------------------------------------------------
    if (
      url.pathname === "/api/accounts" &&
      request.method === "GET"
    ) {
      try {
        const result =
          await env.finance_dashboard_db
            .prepare(`
              SELECT
                item_id,
                access_token,
                encrypted_access_token,
                access_token_iv
              FROM plaid_items
            `)
            .all<StoredPlaidItem>();

        if (
          result.results.length === 0
        ) {
          return Response.json({
            accounts: [],
          });
        }

        const allAccounts: Array<
          PlaidAccount & {
            item_id: string;
          }
        > = [];

        for (
          const item of result.results
        ) {
          const accessToken =
            await getPlaidAccessToken(item, env);

          const response = await fetch(
            `${getPlaidBaseUrl(env)}/accounts/get`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                client_id:
                  env.PLAID_CLIENT_ID,

                secret:
                  env.PLAID_SECRET,

                access_token:
                  accessToken,
              }),
            }
          );

          const data =
            (await response.json()) as {
              accounts?: PlaidAccount[];
              error_message?: string;
            };

          if (!response.ok) {
            console.error(
              "Plaid accounts error:",
              data.error_message
            );

            continue;
          }

          if (data.accounts) {
            allAccounts.push(
              ...data.accounts.map(
                (account) => ({
                  ...account,
                  item_id: item.item_id,
                })
              )
            );
          }
        }

        return Response.json({
          accounts: allAccounts,
        });
      } catch (error) {
        console.error(
          "Accounts error:",
          error
        );

        return Response.json(
          {
            error:
              "Unable to retrieve accounts",
          },
          {
            status: 500,
          }
        );
      }
    }

    // --------------------------------------------------
    // Unknown API route
    // --------------------------------------------------
    return Response.json(
      {
        error: "Not found",
      },
      {
        status: 404,
      }
    );
  },
} satisfies ExportedHandler<Env>;
