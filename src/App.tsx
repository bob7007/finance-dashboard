import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import "./App.css";

interface PortfolioAccount {
  itemId: string;
  accountId: string;
  name: string;
  subtype: string | null;
  mask: string | null;
  value: number;
  currency: string | null;
}

interface PortfolioHolding {
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
}

interface PortfolioResponse {
  totalValue: number;
  plaidEnvironment: string;
  accounts: PortfolioAccount[];
  holdings: PortfolioHolding[];
}

interface CryptoHolding {
  id: string;
  coinGeckoId: string;
  walletId: string;
  symbol: string;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis: number;
  gain: number;
  gainPercent: number;
  change24h: number;
}

interface ImportedCryptoHolding {
  symbol: string;
  name?: string;
  coinGeckoId: string;
  quantity: number;
  costBasis?: number;
}

interface CryptoPriceResponse {
  prices: Record<
    string,
    {
      symbol: string;
      name: string;
      price: number;
      change24h: number;
    }
  >;
}

interface CoinGeckoCoin {
  id: string;
  symbol: string;
  name: string;
}

interface CoinGeckoCatalogResponse {
  coins: CoinGeckoCoin[];
}

interface StoredCryptoHolding {
  id: string;
  walletId: string;
  symbol: string;
  name: string;
  coinGeckoId: string;
  quantity: number;
  costBasis: number;
}

interface CryptoPortfolioResponse {
  wallets: CryptoWallet[];
  holdings: StoredCryptoHolding[];
}

interface CryptoWallet {
  id: string;
  name: string;
  type:
    | "exchange"
    | "hardware_wallet"
    | "software_wallet"
    | "other";
}

function formatCurrency(
  value: number | null,
  currency = "USD"
) {
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8,
  }).format(value);
}

function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function hydrateCryptoHolding(
  holding: StoredCryptoHolding
): CryptoHolding {
  return {
    ...holding,
    price: 0,
    value: 0,
    gain: 0,
    gainPercent: 0,
    change24h: 0,
  };
}

async function readApiResponse<T extends object>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const data = (await response.json()) as T | { error?: string };

  if (!response.ok) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : fallbackError
    );
  }

  return data as T;
}

function App() {
  const [portfolio, setPortfolio] =
    useState<PortfolioResponse | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const [linkToken, setLinkToken] =
    useState<string | null>(null);

  const [connectionStatus, setConnectionStatus] =
    useState("");

  const [selectedAccountKey, setSelectedAccountKey] =
    useState<string | null>(null);

  const [portfolioCategory, setPortfolioCategory] =
    useState<"brokerage" | "crypto">("brokerage");

  const [selectedCryptoWalletId, setSelectedCryptoWalletId] =
    useState<string | null>(null);

  const [cryptoWallets, setCryptoWallets] =
    useState<CryptoWallet[]>([]);

  const [cryptoHoldings, setCryptoHoldings] =
    useState<CryptoHolding[]>([]);

  const [cryptoOwnershipLoading, setCryptoOwnershipLoading] =
    useState(true);

  const [cryptoOwnershipError, setCryptoOwnershipError] =
    useState("");

  const [cryptoPricingError, setCryptoPricingError] =
    useState("");

  const [cryptoPricesLoading, setCryptoPricesLoading] =
    useState(false);

  const [coinGeckoCoins, setCoinGeckoCoins] =
    useState<CoinGeckoCoin[]>([]);

  const [coinGeckoCatalogLoaded, setCoinGeckoCatalogLoaded] =
    useState(false);

  const [coinGeckoCatalogLoading, setCoinGeckoCatalogLoading] =
    useState(false);

  const [coinGeckoCatalogError, setCoinGeckoCatalogError] =
    useState("");

  const coinGeckoCatalogRequest =
    useRef<Promise<CoinGeckoCoin[]> | null>(null);

  const validCoinGeckoIds = useMemo(
    () =>
      new Set(
        coinGeckoCoins.map((coin) =>
          coin.id.trim().toLowerCase()
        )
      ),
    [coinGeckoCoins]
  );

  const cryptoPriceRequestInFlight = useRef(false);
  const pendingCryptoPriceRefresh =
    useRef<CryptoHolding[] | null>(null);
  const refreshCryptoPricesRef = useRef<
    ((holdings: CryptoHolding[], queueIfBusy?: boolean) => Promise<void>) |
      null
  >(null);
  const cryptoPriceAbortController =
    useRef<AbortController | null>(null);

  const [walletOrder, setWalletOrder] =
    useState<string[]>([]);

  const [openWalletMenuId, setOpenWalletMenuId] =
    useState<string | null>(null);

  const [editingWalletId, setEditingWalletId] =
    useState<string | null>(null);

  const [deleteWalletId, setDeleteWalletId] =
    useState<string | null>(null);

  const [deleteValidationMessage, setDeleteValidationMessage] =
    useState("");

  const [holdingToRemoveId, setHoldingToRemoveId] =
    useState<string | null>(null);

  const [cryptoMutationError, setCryptoMutationError] =
    useState("");

  const [cryptoMutationPending, setCryptoMutationPending] =
    useState(false);

  const [isRemoveAllHoldingsOpen, setIsRemoveAllHoldingsOpen] =
    useState(false);

  const [isAddWalletOpen, setIsAddWalletOpen] =
    useState(false);

  const [walletName, setWalletName] =
    useState("");

  const [walletType, setWalletType] =
    useState<CryptoWallet["type"]>(
      "hardware_wallet"
    );

  const [walletValidationMessage, setWalletValidationMessage] =
    useState("");

  const [importedHoldings, setImportedHoldings] =
    useState<ImportedCryptoHolding[]>([]);

  const [holdingImportError, setHoldingImportError] =
    useState("");

  const [selectedImportFileName, setSelectedImportFileName] =
    useState("");

  const [importInputKey, setImportInputKey] =
    useState(0);

  const [walletSubmitPending, setWalletSubmitPending] =
    useState(false);

  const loadCoinGeckoCatalog = useCallback(async () => {
    if (coinGeckoCatalogLoaded) {
      return coinGeckoCoins;
    }

    if (coinGeckoCatalogRequest.current) {
      return coinGeckoCatalogRequest.current;
    }

    setCoinGeckoCatalogLoading(true);
    setCoinGeckoCatalogError("");

    const catalogRequest = (async () => {
      const response = await fetch("/api/crypto/coins");
      const data = await readApiResponse<CoinGeckoCatalogResponse>(
        response,
        "Unable to load CoinGecko asset validation data"
      );

      if (!Array.isArray(data.coins)) {
        throw new Error(
          "Unable to load CoinGecko asset validation data"
        );
      }

      const coins = data.coins
        .filter(
          (coin) =>
            typeof coin.id === "string" &&
            typeof coin.symbol === "string" &&
            typeof coin.name === "string"
        )
        .map((coin) => ({
          id: coin.id.trim().toLowerCase(),
          symbol: coin.symbol.trim().toLowerCase(),
          name: coin.name.trim(),
        }))
        .filter(
          (coin) => coin.id && coin.symbol && coin.name
        );

      setCoinGeckoCoins(coins);
      setCoinGeckoCatalogLoaded(true);
      return coins;
    })();

    coinGeckoCatalogRequest.current = catalogRequest;

    try {
      return await catalogRequest;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load CoinGecko asset validation data";
      setCoinGeckoCatalogError(message);
      throw error;
    } finally {
      coinGeckoCatalogRequest.current = null;
      setCoinGeckoCatalogLoading(false);
    }
  }, [coinGeckoCatalogLoaded, coinGeckoCoins]);

  // --------------------------------------------------
  // Load normalized portfolio
  // --------------------------------------------------
  const loadPortfolio = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response =
        await fetch("/api/portfolio");

      const data =
        (await response.json()) as
          | PortfolioResponse
          | {
              error?: string;
            };

      if (
        !response.ok ||
        !("holdings" in data)
      ) {
        throw new Error(
          "error" in data
            ? data.error
            : "Unable to load portfolio"
        );
      }

      setPortfolio(data);
    } catch (err) {
      console.error(
        "Portfolio load error:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load portfolio"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCryptoPortfolio = useCallback(async () => {
    try {
      setCryptoOwnershipLoading(true);

      const response = await fetch("/api/crypto");
      const data = await readApiResponse<CryptoPortfolioResponse>(
        response,
        "Unable to load saved crypto portfolio"
      );

      setCryptoWallets(data.wallets);
      const holdings =
        data.holdings.map(hydrateCryptoHolding);

      setCryptoHoldings(holdings);
      setWalletOrder(
        data.wallets.map((wallet) => wallet.id)
      );
      setCryptoOwnershipError("");
      return holdings;
    } catch (error) {
      setCryptoOwnershipError(
        error instanceof Error
          ? error.message
          : "Unable to load saved crypto portfolio"
      );
      return null;
    } finally {
      setCryptoOwnershipLoading(false);
    }
  }, []);

  const refreshCryptoPrices = useCallback(
    async (
      holdings: CryptoHolding[],
      queueIfBusy = false
    ) => {
      if (cryptoPriceRequestInFlight.current) {
        if (queueIfBusy) {
          pendingCryptoPriceRefresh.current = holdings;
        }
        return;
      }

      const requiredCoinGeckoIds = Array.from(
        new Set(
          holdings.map(
            (holding) => holding.coinGeckoId
          )
        )
      )
        .sort()
        .join(",");

      if (!requiredCoinGeckoIds) {
        return;
      }

      cryptoPriceRequestInFlight.current = true;
      setCryptoPricesLoading(true);
      const controller = new AbortController();
      cryptoPriceAbortController.current = controller;

      try {
        const searchParams = new URLSearchParams({
          ids: requiredCoinGeckoIds,
        });
        const response = await fetch(
          `/api/crypto/prices?${searchParams.toString()}`,
          { signal: controller.signal }
        );
        const data =
          (await response.json()) as
            | CryptoPriceResponse
            | { error?: string };

        if (!response.ok || !("prices" in data)) {
          throw new Error(
            "error" in data && data.error
              ? data.error
              : "Unable to load crypto prices"
          );
        }

        setCryptoHoldings((current) =>
          current.map((holding) => {
            const marketData =
              data.prices[holding.coinGeckoId];

            if (!marketData) {
              return {
                ...holding,
                price: 0,
                value: 0,
                gain: 0,
                gainPercent: 0,
                change24h: 0,
              };
            }

            const value =
              holding.quantity * marketData.price;
            const gain = value - holding.costBasis;
            const gainPercent =
              holding.costBasis === 0
                ? 0
                : (gain / holding.costBasis) * 100;

            return {
              ...holding,
              price: marketData.price,
              value,
              gain,
              gainPercent,
              change24h: marketData.change24h,
            };
          })
        );
        setCryptoPricingError("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCryptoPricingError(
          error instanceof Error
            ? error.message
            : "Unable to load crypto prices"
        );
      } finally {
        if (cryptoPriceAbortController.current === controller) {
          cryptoPriceAbortController.current = null;
          cryptoPriceRequestInFlight.current = false;
          setCryptoPricesLoading(false);

          const pendingHoldings =
            pendingCryptoPriceRefresh.current;
          pendingCryptoPriceRefresh.current = null;

          if (pendingHoldings) {
            void refreshCryptoPricesRef.current?.(
              pendingHoldings,
              true
            );
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    refreshCryptoPricesRef.current = refreshCryptoPrices;

    return () => {
      refreshCryptoPricesRef.current = null;
    };
  }, [refreshCryptoPrices]);

  // --------------------------------------------------
  // Get Plaid Link token
  // --------------------------------------------------
  useEffect(() => {
    const initializePlaid = async () => {
      try {
        const response = await fetch(
          "/api/plaid/link-token"
        );

        const data =
          (await response.json()) as {
            link_token?: string;
            error_message?: string;
          };

        if (
          !response.ok ||
          !data.link_token
        ) {
          console.error(
            "Unable to initialize Plaid:",
            data
          );

          return;
        }

        setLinkToken(
          data.link_token
        );
      } catch (err) {
        console.error(
          "Plaid initialization error:",
          err
        );
      }
    };

    initializePlaid();
  }, []);

  // --------------------------------------------------
  // Load portfolio on page load
  // --------------------------------------------------
  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    const loadSavedCryptoPortfolio = async () => {
      const holdings = await loadCryptoPortfolio();

      if (holdings && holdings.length > 0) {
        await refreshCryptoPrices(holdings, true);
      }
    };

    void loadSavedCryptoPortfolio();

    return () => {
      pendingCryptoPriceRefresh.current = null;
      cryptoPriceAbortController.current?.abort();
    };
  }, [loadCryptoPortfolio, refreshCryptoPrices]);

  // --------------------------------------------------
  // Plaid Link
  // --------------------------------------------------
  const { open, ready } =
    usePlaidLink({
      token: linkToken,

      onSuccess: async (
        publicToken
      ) => {
        try {
          setConnectionStatus(
            "Saving account..."
          );

          const response =
            await fetch(
              "/api/plaid/exchange",
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  public_token:
                    publicToken,
                }),
              }
            );

          const data =
            (await response.json()) as {
              success?: boolean;
              error?: string;
            };

          if (
            !response.ok ||
            !data.success
          ) {
            throw new Error(
              data.error ??
                "Unable to save account"
            );
          }

          setConnectionStatus(
            "Account connected"
          );

          await loadPortfolio();
        } catch (err) {
          console.error(
            "Plaid exchange error:",
            err
          );

          setConnectionStatus(
            "Connection failed"
          );
        }
      },

      onExit: (error) => {
        if (error) {
          console.error(
            "Plaid Link error:",
            error
          );
        }
      },
    });

  const investmentAccountCount =
    portfolio?.accounts.length ?? 0;

  const positionCount =
    portfolio?.holdings.length ?? 0;

  const filteredHoldings =
    selectedAccountKey === null
      ? portfolio?.holdings ?? []
      : portfolio?.holdings.filter(
          (holding) =>
            `${holding.itemId}:${holding.accountId}` ===
            selectedAccountKey
        ) ?? [];

  const cryptoTotalValue =
    cryptoHoldings.reduce(
      (total, holding) => total + holding.value,
      0
    );

  const cryptoAssetCount = new Set(
    cryptoHoldings.map(
      (holding) => holding.coinGeckoId
    )
  ).size;

  const filteredCryptoHoldings =
    selectedCryptoWalletId === null
      ? cryptoHoldings
      : cryptoHoldings.filter(
          (holding) =>
            holding.walletId ===
            selectedCryptoWalletId
        );

  const orderedWallets = walletOrder
    .map((walletId) =>
      cryptoWallets.find(
        (wallet) => wallet.id === walletId
      )
    )
    .filter(
      (wallet): wallet is CryptoWallet =>
        Boolean(wallet)
    );

    const editingWallet = editingWalletId
      ? cryptoWallets.find(
          (wallet) => wallet.id === editingWalletId
        )
      : undefined;

    const editingWalletHoldings = editingWallet
      ? cryptoHoldings.filter(
          (holding) =>
            holding.walletId === editingWallet.id
        )
      : [];

    const holdingToRemove = holdingToRemoveId
      ? cryptoHoldings.find(
          (holding) => holding.id === holdingToRemoveId
        )
      : undefined;

    const holdingToRemoveWallet = holdingToRemove
      ? cryptoWallets.find(
          (wallet) =>
            wallet.id === holdingToRemove.walletId
        )
      : undefined;

    const deleteWalletHoldingCount = deleteWalletId
        ? cryptoHoldings.filter(
          (holding) =>
            holding.walletId === deleteWalletId
        ).length
      : 0;

  const getWalletValue = (walletId: string) =>
    cryptoHoldings
      .filter(
        (holding) => holding.walletId === walletId
      )
      .reduce(
        (total, holding) => total + holding.value,
        0
      );

  const resetWalletForm = () => {
    setWalletName("");
    setWalletType("hardware_wallet");
    setWalletValidationMessage("");
    setEditingWalletId(null);
    setImportedHoldings([]);
    setHoldingImportError("");
    setSelectedImportFileName("");
    setImportInputKey((key) => key + 1);
    setIsRemoveAllHoldingsOpen(false);
  };

  const openAddWalletModal = () => {
    resetWalletForm();
    setIsAddWalletOpen(true);
    void loadCoinGeckoCatalog().catch(() => undefined);
  };

  const openEditWalletModal = (
    wallet: CryptoWallet
  ) => {
    setEditingWalletId(wallet.id);
    setWalletName(wallet.name);
    setWalletType(wallet.type);
    setWalletValidationMessage("");
    setImportedHoldings([]);
    setHoldingImportError("");
    setSelectedImportFileName("");
    setImportInputKey((key) => key + 1);
    setOpenWalletMenuId(null);
    setIsAddWalletOpen(true);

    const walletHasHoldings = cryptoHoldings.some(
      (holding) => holding.walletId === wallet.id
    );

    if (!walletHasHoldings) {
      void loadCoinGeckoCatalog().catch(() => undefined);
    }
  };

  const handleHoldingCsvChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    setImportedHoldings([]);
    setHoldingImportError("");
    setSelectedImportFileName(file?.name ?? "");

    if (!file) {
      return;
    }

    try {
      const catalog = coinGeckoCatalogLoaded
        ? coinGeckoCoins
        : await loadCoinGeckoCatalog();
      const catalogIds = coinGeckoCatalogLoaded
        ? validCoinGeckoIds
        : new Set(
            catalog.map((coin) =>
              coin.id.trim().toLowerCase()
            )
          );
      const lines = (await file.text())
        .replace(/^\uFEFF/, "")
        .split(/\r?\n/)
        .filter((line) => line.trim());

      if (lines.length < 2) {
        throw new Error(
          "CSV must contain a header and at least one holding row."
        );
      }

      const headers = lines[0]
        .split(",")
        .map((header) => header.trim().toLowerCase());
      const symbolIndex = headers.indexOf("symbol");
      const coinGeckoIdIndex = headers.indexOf("coingeckoid");
      const quantityIndex = headers.indexOf("quantity");
      const nameIndex = headers.indexOf("name");
      const costBasisIndex = headers.indexOf("costbasis");

      if (
        symbolIndex === -1 ||
        coinGeckoIdIndex === -1 ||
        quantityIndex === -1
      ) {
        throw new Error(
          "CSV must contain symbol, coinGeckoId, and quantity columns."
        );
      }

      const parsedHoldings: ImportedCryptoHolding[] = [];
      const seenCoinGeckoIds = new Set<string>();

      for (let index = 1; index < lines.length; index += 1) {
        const rowNumber = index + 1;
        const values = lines[index]
          .split(",")
          .map((value) => value.trim());
        const symbol = values[symbolIndex]?.toUpperCase() ?? "";
        const coinGeckoId =
          values[coinGeckoIdIndex]?.trim().toLowerCase() ?? "";
        const quantityText = values[quantityIndex] ?? "";
        const quantity = Number(quantityText);
        const name = values[nameIndex]?.trim();
        const costBasisText =
          costBasisIndex === -1
            ? ""
            : values[costBasisIndex] ?? "";
        const costBasis =
          costBasisText === ""
            ? undefined
            : Number(costBasisText);

        if (!symbol) {
          throw new Error(
            `Row ${rowNumber} has an empty symbol.`
          );
        }

        if (!coinGeckoId) {
          throw new Error(
            `Row ${rowNumber} is missing a CoinGecko ID.`
          );
        }

        if (seenCoinGeckoIds.has(coinGeckoId)) {
          throw new Error(
            `Row ${rowNumber} contains duplicate CoinGecko ID "${coinGeckoId}". ` +
              "Each asset may appear only once per wallet."
          );
        }

        if (!catalogIds.has(coinGeckoId)) {
          throw new Error(
            `Row ${rowNumber} contains unknown CoinGecko ID "${coinGeckoId}". ` +
              "Verify the asset's CoinGecko ID and try again."
          );
        }

        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(
            `Row ${rowNumber} has an invalid quantity.`
          );
        }

        if (
          costBasisText !== "" &&
          (!Number.isFinite(costBasis) ||
            (costBasis as number) < 0)
        ) {
          throw new Error(
            `Row ${rowNumber} has an invalid cost basis.`
          );
        }

        seenCoinGeckoIds.add(coinGeckoId);
        parsedHoldings.push({
          symbol,
          name: name || undefined,
          coinGeckoId,
          quantity,
          costBasis,
        });
      }

      setImportedHoldings(parsedHoldings);
    } catch (error) {
      setSelectedImportFileName("");
      setHoldingImportError(
        error instanceof Error
          ? error.message
          : "Unable to parse CSV."
      );
    }
  };

  const handleAddWallet = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    const trimmedName = walletName.trim();

    if (!trimmedName) {
      setWalletValidationMessage(
        "Wallet name is required."
      );
      return;
    }

    const isDuplicate = cryptoWallets.some(
      (wallet) =>
        wallet.id !== editingWalletId &&
        wallet.name.toLowerCase() ===
        trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      setWalletValidationMessage(
        "A wallet with this name already exists."
      );
      return;
    }

    if (
      editingWalletId &&
      importedHoldings.length > 0 &&
      editingWalletHoldings.length > 0
    ) {
      setWalletValidationMessage(
        "Remove all existing holdings before importing a CSV."
      );
      return;
    }

    setWalletSubmitPending(true);
    setWalletValidationMessage("");

    try {
      if (editingWalletId) {
        const updateResponse = await fetch(
          `/api/crypto/wallets/${encodeURIComponent(editingWalletId)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: trimmedName,
              type: walletType,
            }),
          }
        );
        const updateData = await readApiResponse<{
          wallet: CryptoWallet;
        }>(updateResponse, "Unable to update wallet");

        setCryptoWallets((wallets) =>
          wallets.map((wallet) =>
            wallet.id === editingWalletId
              ? updateData.wallet
              : wallet
          )
        );

        if (importedHoldings.length > 0) {
          const holdings = importedHoldings.map((holding) => ({
            id: crypto.randomUUID(),
            coinGeckoId: holding.coinGeckoId,
            symbol: holding.symbol,
            name: holding.name ?? holding.symbol,
            quantity: holding.quantity,
            costBasis: holding.costBasis ?? 0,
          }));
          const importResponse = await fetch(
            `/api/crypto/wallets/${encodeURIComponent(editingWalletId)}/holdings`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ holdings }),
            }
          );
          const importData = await readApiResponse<{
            holdings: StoredCryptoHolding[];
          }>(importResponse, "Unable to import holdings");
          const addedHoldings =
            importData.holdings.map(hydrateCryptoHolding);

          setCryptoHoldings((current) => [
            ...current,
            ...addedHoldings,
          ]);

          if (addedHoldings.length > 0) {
            await refreshCryptoPrices([
              ...cryptoHoldings,
              ...addedHoldings,
            ], true);
          }
        }
      } else {
        const wallet: CryptoWallet = {
          id: crypto.randomUUID(),
          name: trimmedName,
          type: walletType,
        };
        const holdings = importedHoldings.map((holding) => ({
          id: crypto.randomUUID(),
          coinGeckoId: holding.coinGeckoId,
          symbol: holding.symbol,
          name: holding.name ?? holding.symbol,
          quantity: holding.quantity,
          costBasis: holding.costBasis ?? 0,
        }));
        const response = await fetch("/api/crypto/wallets", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ wallet, holdings }),
        });
        const data = await readApiResponse<{
          wallet: CryptoWallet;
          holdings: StoredCryptoHolding[];
        }>(response, "Unable to create wallet");
        const addedHoldings =
          data.holdings.map(hydrateCryptoHolding);

        setCryptoWallets((wallets) => [
          ...wallets,
          data.wallet,
        ]);
        setWalletOrder((order) => [
          ...order,
          data.wallet.id,
        ]);
        setCryptoHoldings((current) => [
          ...current,
          ...addedHoldings,
        ]);

        if (addedHoldings.length > 0) {
          await refreshCryptoPrices([
            ...cryptoHoldings,
            ...addedHoldings,
          ], true);
        }
      }

      setCryptoOwnershipError("");
      resetWalletForm();
      setIsAddWalletOpen(false);
    } catch (error) {
      setWalletValidationMessage(
        error instanceof Error
          ? error.message
          : "Unable to save wallet"
      );
    } finally {
      setWalletSubmitPending(false);
    }
  };

  const openDeleteWalletModal = (
    walletId: string
  ) => {
    const wallet = cryptoWallets.find(
      (candidate) => candidate.id === walletId
    );

    const holdingsCount =
      cryptoHoldings.filter(
        (holding) => holding.walletId === walletId
      ).length;

    setOpenWalletMenuId(null);

    if (holdingsCount > 0 && wallet) {
      openEditWalletModal(wallet);
      setWalletValidationMessage(
        "Remove all holdings before deleting this wallet."
      );
      return;
    }

    setDeleteValidationMessage("");
    setDeleteWalletId(walletId);
  };

  const confirmDeleteWallet = async () => {
    if (!deleteWalletId) {
      return;
    }

    const holdingsCount =
      cryptoHoldings.filter(
        (holding) =>
          holding.walletId === deleteWalletId
      ).length;

    if (holdingsCount > 0) {
      setDeleteValidationMessage(
        "Remove all holdings before deleting this wallet."
      );
      return;
    }

    setCryptoMutationPending(true);
    setDeleteValidationMessage("");

    try {
      const response = await fetch(
        `/api/crypto/wallets/${encodeURIComponent(deleteWalletId)}`,
        { method: "DELETE" }
      );
      await readApiResponse<{ success: boolean }>(
        response,
        "Unable to delete wallet"
      );

      setCryptoWallets((wallets) =>
        wallets.filter(
          (wallet) => wallet.id !== deleteWalletId
        )
      );
      setWalletOrder((order) =>
        order.filter((walletId) =>
          walletId !== deleteWalletId
        )
      );

      if (selectedCryptoWalletId === deleteWalletId) {
        setSelectedCryptoWalletId(null);
      }

      setCryptoOwnershipError("");
      setDeleteWalletId(null);
    } catch (error) {
      setDeleteValidationMessage(
        error instanceof Error
          ? error.message
          : "Unable to delete wallet"
      );
    } finally {
      setCryptoMutationPending(false);
    }
  };

  const confirmHoldingRemoval = async () => {
    if (!holdingToRemoveId) {
      return;
    }

    const holding = cryptoHoldings.find(
      (current) => current.id === holdingToRemoveId
    );

    setCryptoMutationPending(true);
    setCryptoMutationError("");

    try {
      const response = await fetch(
        `/api/crypto/holdings/${encodeURIComponent(holdingToRemoveId)}`,
        { method: "DELETE" }
      );
      await readApiResponse<{ success: boolean }>(
        response,
        "Unable to remove holding"
      );

      setCryptoHoldings((current) =>
        current.filter(
          (holding) => holding.id !== holdingToRemoveId
        )
      );

      if (
        holding &&
        cryptoHoldings.filter(
          (current) =>
            current.walletId === holding.walletId &&
            current.id !== holdingToRemoveId
        ).length === 0
      ) {
        setWalletValidationMessage("");
      }

      setCryptoOwnershipError("");
      setHoldingToRemoveId(null);
    } catch (error) {
      setCryptoMutationError(
        error instanceof Error
          ? error.message
          : "Unable to remove holding"
      );
    } finally {
      setCryptoMutationPending(false);
    }
  };

  const confirmRemoveAllHoldings = async () => {
    if (!editingWalletId) {
      setIsRemoveAllHoldingsOpen(false);
      return;
    }

    setCryptoMutationPending(true);
    setCryptoMutationError("");

    try {
      const response = await fetch(
        `/api/crypto/wallets/${encodeURIComponent(editingWalletId)}/holdings`,
        { method: "DELETE" }
      );
      await readApiResponse<{ success: boolean }>(
        response,
        "Unable to remove holdings"
      );

      setCryptoHoldings((current) =>
        current.filter(
          (holding) => holding.walletId !== editingWalletId
        )
      );
      setCryptoOwnershipError("");
      setWalletValidationMessage("");
      setIsRemoveAllHoldingsOpen(false);
    } catch (error) {
      setCryptoMutationError(
        error instanceof Error
          ? error.message
          : "Unable to remove holdings"
      );
    } finally {
      setCryptoMutationPending(false);
    }
  };

  const handleDeleteFromEdit = () => {
    if (!editingWalletId) {
      return;
    }

    const walletId = editingWalletId;
    resetWalletForm();
    setIsAddWalletOpen(false);
    openDeleteWalletModal(walletId);
  };

  const getWalletTypeLabel = (
    type: CryptoWallet["type"]
  ) =>
    type === "hardware_wallet"
      ? "Hardware Wallet"
      : type === "software_wallet"
        ? "Software Wallet"
        : type === "exchange"
          ? "Exchange"
          : "Other";

  const latestPriceDate =
    useMemo(() => {
      if (!portfolio) {
        return null;
      }

      const dates =
        portfolio.holdings
          .map(
            (holding) =>
              holding.priceAsOf
          )
          .filter(
            (
              date
            ): date is string =>
              Boolean(date)
          )
          .sort();

      return dates.at(-1) ?? null;
    }, [portfolio]);

  return (
    <div
      className="app-shell"
      onClick={() => setOpenWalletMenuId(null)}
    >
      {/* --------------------------------------------
          Header
      --------------------------------------------- */}
      <header className="topbar">
        <div>
          <div className="brand">
            FINANCE TERMINAL
          </div>

          <div className="environment-badge">
            PLAID {portfolio?.plaidEnvironment?.toUpperCase() ?? "..."}
          </div>
        </div>

        <div className="topbar-actions">
          {connectionStatus && (
            <span className="connection-status">
              {connectionStatus}
            </span>
          )}

          <button
            className="refresh-button"
            onClick={loadPortfolio}
          >
            Refresh
          </button>

          <button
            className="connect-button"
            disabled={!ready}
            onClick={() => open()}
          >
            + Add Institution
          </button>
        </div>
      </header>

      {/* --------------------------------------------
          Navigation
      --------------------------------------------- */}
      <nav className="navigation">
        <button>Overview</button>
        <button>Accounts</button>

        <button className="active">
          Portfolio
        </button>

        <button>
          Transactions
        </button>

        <button>Research</button>
        <button>Settings</button>
      </nav>

      <main className="content">
        {/* ------------------------------------------
            Page title
        ------------------------------------------- */}
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              INVESTMENTS
            </p>

            <h1>Portfolio</h1>

            <p className="page-description">
              Investment accounts and
              holdings retrieved through
              Plaid.
            </p>
          </div>

          {portfolioCategory === "brokerage" &&
            latestPriceDate && (
            <div className="price-date">
              Institution prices as of{" "}
              <strong>
                {latestPriceDate}
              </strong>
            </div>
          )}
        </div>

        <div className="portfolio-category-nav">
          <button
            className={
              portfolioCategory === "brokerage"
                ? "active"
                : ""
            }
            onClick={() =>
              setPortfolioCategory("brokerage")
            }
          >
            Brokerage
          </button>

          <button
            className={
              portfolioCategory === "crypto"
                ? "active"
                : ""
            }
            onClick={() =>
              setPortfolioCategory("crypto")
            }
          >
            Crypto
          </button>
        </div>

        {loading && (
          <div className="state-message">
            Loading portfolio...
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          portfolio && (
            <>
              {/* ------------------------------------
                  Summary cards
              ------------------------------------- */}
              {portfolioCategory === "brokerage" ? (
                <section className="summary-grid">
                  <div className="summary-card primary-card">
                    <span className="summary-label">
                      Total Investment
                      Value
                    </span>

                    <strong className="summary-value">
                      {formatCurrency(
                        portfolio.totalValue
                      )}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Investment Accounts
                    </span>

                    <strong className="summary-value small">
                      {
                        investmentAccountCount
                      }
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Positions
                    </span>

                    <strong className="summary-value small">
                      {positionCount}
                    </strong>
                  </div>
                </section>
              ) : (
                <section className="summary-grid">
                  <div className="summary-card primary-card">
                    <span className="summary-label">
                      Total Crypto Value
                    </span>

                    <strong className="summary-value">
                      {formatCurrency(
                        cryptoTotalValue
                      )}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Wallets
                    </span>

                    <strong className="summary-value small">
                      {cryptoWallets.length}
                    </strong>
                  </div>

                  <div className="summary-card">
                    <span className="summary-label">
                      Assets
                    </span>

                    <strong className="summary-value small">
                      {cryptoAssetCount}
                    </strong>
                  </div>
                </section>
              )}

              {/* ------------------------------------
                  Accounts
              ------------------------------------- */}
              {portfolioCategory === "brokerage" && (
              <section className="section">
                <div className="section-header">
                  <div>
                    <p className="section-eyebrow">
                      ACCOUNTS
                    </p>

                    <h2>
                      Investment Accounts
                    </h2>
                  </div>
                </div>

                <div className="account-grid">
                  {portfolio.accounts.map(
                    (account) => (
                      <div
                        className={`account-card ${
                          selectedAccountKey ===
                          `${account.itemId}:${account.accountId}`
                            ? "selected"
                            : ""
                        }`}
                        key={
                          `${account.itemId}:${account.accountId}`
                        }
                        onClick={() =>
                          setSelectedAccountKey(
                            selectedAccountKey ===
                              `${account.itemId}:${account.accountId}`
                              ? null
                              : `${account.itemId}:${account.accountId}`
                          )
                        }
                      >
                        <div className="account-card-top">
                          <div>
                            <div className="account-name">
                              {
                                account.name
                              }
                            </div>

                            <div className="account-meta">
                              {account.subtype ??
                                "Investment"}

                              {account.mask
                                ? ` •••• ${account.mask}`
                                : ""}
                            </div>
                          </div>

                          <span className="account-type">
                            {
                              account.subtype
                            }
                          </span>
                        </div>

                        <div className="account-balance">
                          {formatCurrency(
                            account.value,
                            account.currency ??
                              "USD"
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </section>
              )}

              {portfolioCategory === "crypto" && (
                <section className="section">
                  <div className="section-header">
                    <div>
                      <p className="section-eyebrow">
                        WALLETS
                      </p>

                      <h2>Wallets</h2>
                    </div>

                    <button
                      className="add-wallet-button"
                      onClick={openAddWalletModal}
                    >
                      + Add Wallet
                    </button>
                  </div>

                  <div className="account-grid">
                    {orderedWallets.map(
                      (wallet) => (
                        <div
                          className={`account-card ${
                            selectedCryptoWalletId ===
                            wallet.id
                              ? "selected"
                              : ""
                          }`}
                          key={wallet.id}
                          onClick={() =>
                            setSelectedCryptoWalletId(
                              selectedCryptoWalletId ===
                                wallet.id
                                ? null
                                : wallet.id
                            )
                          }
                        >
                          <div className="wallet-card-controls">
                            <button
                              className="wallet-drag-handle"
                              type="button"
                              aria-label={`Reorder ${wallet.name}`}
                              onClick={(event) =>
                                event.stopPropagation()
                              }
                            >
                              ⠿
                            </button>

                            <div className="wallet-menu-wrapper">
                              <button
                                className="wallet-menu-button"
                                type="button"
                                aria-label={`Actions for ${wallet.name}`}
                                aria-expanded={
                                  openWalletMenuId ===
                                  wallet.id
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setOpenWalletMenuId(
                                    openWalletMenuId ===
                                      wallet.id
                                      ? null
                                      : wallet.id
                                  );
                                }}
                              >
                                ⋮
                              </button>

                              {openWalletMenuId ===
                                wallet.id && (
                                <div
                                  className="wallet-menu"
                                  onClick={(event) =>
                                    event.stopPropagation()
                                  }
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openEditWalletModal(
                                        wallet
                                      );
                                    }}
                                  >
                                    Edit Wallet
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      openDeleteWalletModal(
                                        wallet.id
                                      );
                                    }}
                                  >
                                    Delete Wallet
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="account-card-top">
                            <div className="account-name">
                              {wallet.name}
                            </div>

                            <span className="account-type">
                              {getWalletTypeLabel(
                                wallet.type
                              )}
                            </span>
                          </div>

                          <div className="account-balance">
                            {formatCurrency(
                              getWalletValue(
                                wallet.id
                              )
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>
              )}

              {/* ------------------------------------
                  Holdings table
              ------------------------------------- */}
              <section className="section">
                <div className="section-header">
                  <div>
                    <p className="section-eyebrow">
                      {portfolioCategory === "crypto"
                        ? "CRYPTO ASSETS"
                        : "POSITIONS"}
                    </p>

                    <h2>
                      {portfolioCategory === "crypto"
                        ? "Crypto Holdings"
                        : "Holdings"}
                    </h2>
                  </div>

                  {portfolioCategory === "crypto" && (
                    <button
                      className="add-wallet-button"
                      type="button"
                      disabled={
                        cryptoPricesLoading ||
                        cryptoHoldings.length === 0
                      }
                      onClick={() =>
                        void refreshCryptoPrices(cryptoHoldings)
                      }
                    >
                      {cryptoPricesLoading
                        ? "Refreshing..."
                        : "Refresh Prices"}
                    </button>
                  )}
                </div>

                {portfolioCategory === "crypto" &&
                  cryptoOwnershipLoading && (
                  <p className="wallet-delete-message">
                    Loading saved crypto portfolio...
                  </p>
                )}

                {portfolioCategory === "crypto" &&
                  cryptoOwnershipError && (
                  <p className="wallet-validation-message">
                    {cryptoOwnershipError}
                  </p>
                )}

                {portfolioCategory === "crypto" &&
                  cryptoPricingError && (
                  <p className="wallet-validation-message">
                    Live pricing unavailable: {cryptoPricingError}
                  </p>
                )}

                <div className="table-container">
                  {portfolioCategory === "brokerage" ? (
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Security</th>
                        <th>Account</th>
                        <th className="numeric">
                          Quantity
                        </th>
                        <th className="numeric">
                          Price
                        </th>
                        <th className="numeric">
                          Value
                        </th>
                        <th className="numeric">
                          Cost Basis
                        </th>
                        <th className="numeric">
                          Gain / Loss
                        </th>
                        <th className="numeric">
                          Return
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredHoldings.map(
                        (holding) => {
                          const gainClass =
                            holding.gain ===
                            null
                              ? ""
                              : holding.gain >
                                  0
                                ? "positive"
                                : holding.gain <
                                    0
                                  ? "negative"
                                  : "";

                          return (
                            <tr
                              key={`${holding.itemId}-${holding.accountId}-${holding.securityId}`}
                            >
                              <td>
                                <span className="ticker">
                                  {
                                    holding.ticker
                                  }
                                </span>
                              </td>

                              <td>
                                <div className="security-name">
                                  {
                                    holding.name
                                  }
                                </div>

                                <div className="security-type">
                                  {holding.securityType ??
                                    "Security"}
                                </div>
                              </td>

                              <td>
                                <span className="account-pill">
                                  {
                                    holding.accountName
                                  }
                                </span>
                              </td>

                              <td className="numeric">
                                {formatQuantity(
                                  holding.quantity
                                )}
                              </td>

                              <td className="numeric">
                                {formatCurrency(
                                  holding.price,
                                  holding.currency ??
                                    "USD"
                                )}
                              </td>

                              <td className="numeric value-cell">
                                {formatCurrency(
                                  holding.value,
                                  holding.currency ??
                                    "USD"
                                )}
                              </td>

                              <td className="numeric">
                                {formatCurrency(
                                  holding.costBasis,
                                  holding.currency ??
                                    "USD"
                                )}
                              </td>

                              <td
                                className={`numeric ${gainClass}`}
                              >
                                {holding.gain !==
                                null
                                  ? `${holding.gain >= 0 ? "+" : ""}${formatCurrency(
                                      holding.gain,
                                      holding.currency ??
                                        "USD"
                                    )}`
                                  : "—"}
                              </td>

                              <td
                                className={`numeric ${gainClass}`}
                              >
                                {formatPercent(
                                  holding.gainPercent
                                )}
                              </td>
                            </tr>
                          );
                        }
                      )}
                    </tbody>
                  </table>
                  ) : (
                  <table className="holdings-table">
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Asset</th>
                        <th>Wallet</th>
                        <th className="numeric">Quantity</th>
                        <th className="numeric">Price</th>
                        <th className="numeric">Value</th>
                        <th className="numeric">Cost Basis</th>
                        <th className="numeric">Gain / Loss</th>
                        <th className="numeric">Return</th>
                        <th className="numeric">24H</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredCryptoHoldings.map(
                        (holding) => (
                          <tr key={holding.id}>
                            <td>
                              <span className="ticker">
                                {holding.symbol}
                              </span>
                            </td>

                            <td>
                              <div className="security-name">
                                {holding.name}
                              </div>
                              <div className="security-type">
                                {holding.coinGeckoId}
                              </div>
                            </td>

                            <td>
                              <span className="account-pill">
                                {cryptoWallets.find(
                                  (wallet) =>
                                    wallet.id ===
                                    holding.walletId
                                )?.name ?? "Wallet"}
                              </span>
                            </td>

                            <td className="numeric">
                              {formatQuantity(
                                holding.quantity
                              )}
                            </td>

                            <td className="numeric">
                              {formatCurrency(
                                holding.price
                              )}
                            </td>

                            <td className="numeric value-cell">
                              {formatCurrency(
                                holding.value
                              )}
                            </td>

                            <td className="numeric">
                              {formatCurrency(
                                holding.costBasis
                              )}
                            </td>

                            <td
                              className={`numeric ${
                                holding.gain >= 0
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {holding.gain >= 0
                                ? "+"
                                : ""}
                              {formatCurrency(
                                holding.gain
                              )}
                            </td>

                            <td
                              className={`numeric ${
                                holding.gainPercent >= 0
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {formatPercent(
                                holding.gainPercent
                              )}
                            </td>

                            <td
                              className={`numeric ${
                                holding.change24h >= 0
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {formatPercent(
                                holding.change24h
                              )}
                            </td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                  )}
                </div>
              </section>
            </>
          )}
      </main>

      {isAddWalletOpen && (
        <div
          className="wallet-modal-backdrop"
          onClick={() => {
            resetWalletForm();
            setIsAddWalletOpen(false);
          }}
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-wallet-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  CRYPTO
                </p>

                <h2 id="add-wallet-title">
                  {editingWalletId
                    ? "Edit Wallet"
                    : "Add Wallet"}
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Add Wallet"
                onClick={() => {
                  resetWalletForm();
                  setIsAddWalletOpen(false);
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleAddWallet}>
              <label className="wallet-form-field">
                <span>Wallet Name</span>
                <input
                  autoFocus
                  value={walletName}
                  onChange={(event) =>
                    setWalletName(event.target.value)
                  }
                />
              </label>

              <label className="wallet-form-field">
                <span>Type</span>
                <select
                  value={walletType}
                  onChange={(event) =>
                    setWalletType(
                      event.target.value as CryptoWallet["type"]
                    )
                  }
                >
                  <option value="hardware_wallet">
                    Hardware Wallet
                  </option>
                  <option value="software_wallet">
                    Software Wallet
                  </option>
                  <option value="exchange">
                    Exchange
                  </option>
                  <option value="other">
                    Other
                  </option>
                </select>
              </label>

              {(!editingWallet ||
                editingWalletHoldings.length === 0) && (
                <section className="wallet-import-section">
                  <div className="wallet-import-header">
                    <span>Import Holdings</span>
                    <span>Optional CSV file</span>
                  </div>

                  <label className="wallet-file-input">
                    <span>Choose CSV</span>
                    <input
                      key={importInputKey}
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleHoldingCsvChange}
                      disabled={coinGeckoCatalogLoading}
                    />
                  </label>

                  {coinGeckoCatalogLoading && (
                    <p className="wallet-import-file-name">
                      Loading CoinGecko asset catalog...
                    </p>
                  )}

                  {coinGeckoCatalogError &&
                    !coinGeckoCatalogLoading && (
                      <p className="wallet-validation-message">
                        {coinGeckoCatalogError}. Try again before importing
                        holdings. You can still save an empty wallet.
                      </p>
                    )}

                  {selectedImportFileName && (
                    <p className="wallet-import-file-name">
                      {selectedImportFileName}
                    </p>
                  )}

                  {holdingImportError && (
                    <p className="wallet-validation-message">
                      {holdingImportError}
                    </p>
                  )}

                  {importedHoldings.length > 0 && (
                    <div className="wallet-import-preview">
                      <div className="wallet-holdings-header">
                        <span>Holdings to import</span>
                        <span>
                          {importedHoldings.length}
                        </span>
                      </div>

                      {importedHoldings.map(
                        (holding, index) => (
                          <div
                            className="wallet-holding-row"
                            key={`${holding.symbol}-${index}`}
                          >
                            <div>
                              <strong>{holding.symbol}</strong>
                              <span>
                                {formatQuantity(
                                  holding.quantity
                                )} {holding.symbol}
                              </span>
                              <span>{holding.coinGeckoId}</span>
                            </div>

                            {holding.costBasis !==
                              undefined && (
                              <span>
                                Cost basis {formatCurrency(
                                  holding.costBasis
                                )}
                              </span>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </section>
              )}

              {editingWallet && (
                <section className="wallet-holdings-section">
                  <div className="wallet-holdings-header">
                    <span>Holdings</span>
                    <span>
                      {editingWalletHoldings.length} {editingWalletHoldings.length === 1 ? "holding" : "holdings"}
                    </span>
                  </div>

                  {editingWalletHoldings.length > 0 ? (
                    <>
                      <div className="wallet-holdings-list">
                        {editingWalletHoldings.map(
                          (holding) => (
                            <div
                              className="wallet-holding-row"
                              key={holding.id}
                            >
                              <div>
                                <strong>{holding.symbol}</strong>
                                <span>
                                  {formatQuantity(
                                    holding.quantity
                                  )} {holding.symbol}
                                </span>
                              </div>

                              <button
                                className="wallet-remove-holding-button"
                                type="button"
                                onClick={() => {
                                  setCryptoMutationError("");
                                  setHoldingToRemoveId(
                                    holding.id
                                  );
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          )
                        )}
                      </div>

                      <button
                        className="wallet-delete-action wallet-remove-all-action"
                        type="button"
                        onClick={() => {
                          setCryptoMutationError("");
                          setIsRemoveAllHoldingsOpen(true);
                        }}
                      >
                        Remove All Holdings
                      </button>
                    </>
                  ) : (
                    <p className="wallet-delete-message">
                      No holdings in this wallet.
                    </p>
                  )}
                </section>
              )}

              {walletValidationMessage && (
                <p className="wallet-validation-message">
                  {walletValidationMessage}
                </p>
              )}

              <div className="wallet-modal-actions">
                <button
                  className="wallet-cancel-button"
                  type="button"
                  onClick={() => {
                    resetWalletForm();
                    setIsAddWalletOpen(false);
                  }}
                >
                  Cancel
                </button>

                {editingWallet &&
                  editingWalletHoldings.length === 0 && (
                  <button
                    className="wallet-delete-action"
                    type="button"
                    onClick={handleDeleteFromEdit}
                  >
                    Delete Wallet
                  </button>
                )}

                <button
                  className="wallet-submit-button"
                  type="submit"
                  disabled={
                    walletSubmitPending ||
                    (selectedImportFileName !== "" &&
                      (!coinGeckoCatalogLoaded ||
                        coinGeckoCatalogLoading))
                  }
                >
                  {walletSubmitPending
                    ? "Saving..."
                    : editingWalletId
                      ? "Save Changes"
                      : "Add Wallet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteWalletId && (
        <div
          className="wallet-modal-backdrop"
          onClick={() =>
            setDeleteWalletId(null)
          }
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-wallet-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  CRYPTO
                </p>

                <h2 id="delete-wallet-title">
                  Delete Wallet
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Delete Wallet"
                onClick={() =>
                  setDeleteWalletId(null)
                }
              >
                ×
              </button>
            </div>

            <p className="wallet-delete-message">
              Delete "
              {cryptoWallets.find(
                (wallet) =>
                  wallet.id === deleteWalletId
              )?.name ?? "this wallet"}
              "?
            </p>

            {deleteValidationMessage ||
            deleteWalletHoldingCount > 0 ? (
              <p className="wallet-validation-message">
                {deleteValidationMessage ||
                  "Remove all holdings before deleting this wallet."}
              </p>
            ) : (
              <p className="wallet-delete-message">
                This wallet has no holdings.
              </p>
            )}

            <div className="wallet-modal-actions">
              <button
                className="wallet-cancel-button"
                type="button"
                onClick={() =>
                  setDeleteWalletId(null)
                }
              >
                Cancel
              </button>

              {deleteWalletHoldingCount === 0 && (
                <button
                  className="wallet-submit-button"
                  type="button"
                  onClick={confirmDeleteWallet}
                  disabled={cryptoMutationPending}
                >
                  Delete Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {holdingToRemove && (
        <div
          className="wallet-modal-backdrop"
          onClick={() =>
            setHoldingToRemoveId(null)
          }
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-holding-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  HOLDINGS
                </p>

                <h2 id="remove-holding-title">
                  Remove {holdingToRemove.symbol}?
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Remove Holding"
                onClick={() =>
                  setHoldingToRemoveId(null)
                }
              >
                ×
              </button>
            </div>

            <p className="wallet-delete-message">
              This will remove this holding from {holdingToRemoveWallet?.name ?? "the wallet"}.
            </p>

            {cryptoMutationError && (
              <p className="wallet-validation-message">
                {cryptoMutationError}
              </p>
            )}

            <div className="wallet-modal-actions">
              <button
                className="wallet-cancel-button"
                type="button"
                onClick={() =>
                  setHoldingToRemoveId(null)
                }
              >
                Cancel
              </button>

              <button
                className="wallet-submit-button"
                type="button"
                onClick={confirmHoldingRemoval}
                disabled={cryptoMutationPending}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {isRemoveAllHoldingsOpen &&
        editingWallet &&
        editingWalletHoldings.length > 0 && (
        <div
          className="wallet-modal-backdrop"
          onClick={() =>
            setIsRemoveAllHoldingsOpen(false)
          }
        >
          <div
            className="wallet-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-all-holdings-title"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="wallet-modal-header">
              <div>
                <p className="section-eyebrow">
                  HOLDINGS
                </p>

                <h2 id="remove-all-holdings-title">
                  Remove all holdings from {editingWallet.name}?
                </h2>
              </div>

              <button
                className="wallet-modal-close"
                type="button"
                aria-label="Close Remove All Holdings"
                onClick={() =>
                  setIsRemoveAllHoldingsOpen(false)
                }
              >
                ×
              </button>
            </div>

            <p className="wallet-delete-message">
              This will remove all {editingWalletHoldings.length}{" "}
              {editingWalletHoldings.length === 1
                ? "holding"
                : "holdings"} from this wallet.
              <br />
              This action cannot be undone.
            </p>

            {cryptoMutationError && (
              <p className="wallet-validation-message">
                {cryptoMutationError}
              </p>
            )}

            <div className="wallet-modal-actions">
              <button
                className="wallet-cancel-button"
                type="button"
                onClick={() =>
                  setIsRemoveAllHoldingsOpen(false)
                }
              >
                Cancel
              </button>

              <button
                className="wallet-delete-action"
                type="button"
                onClick={confirmRemoveAllHoldings}
                disabled={cryptoMutationPending}
              >
                Remove All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
