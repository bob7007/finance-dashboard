interface Env {
  PLAID_CLIENT_ID: string;
  PLAID_SECRET: string;
  PLAID_ENV: string;
  PLAID_TOKEN_ENCRYPTION_KEY: string;
  finance_dashboard_db: D1Database;
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