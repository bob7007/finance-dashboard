export interface ResearchDefinition {
  title: string;
  description: string;
  details?: string[];
}

export type ResearchDefinitionMap = Record<string, ResearchDefinition>;

const define = (
  title: string,
  description: string,
  details?: string[],
): ResearchDefinition => ({ title, description, details });

export const RESEARCH_DEFINITIONS: ResearchDefinitionMap = {
  "Cash-To-Debt": define("Cash-To-Debt", "Cash-To-Debt ratio is calculated as Cash, Cash Equivalents, Marketable Securities divided by its Total Debt. It measures the financial strength of a company."),
  "Equity-to-Asset": define("Equity-to-Asset", "Equity to Asset ratio is calculated as shareholder equity divided by its total assets."),
  "Debt-to-Equity": define("Debt-to-Equity", "Debt-to-Equity is calculated by dividing the total debt applicable obligation by its shareholder equity. The ratio is used to evaluate a company's financial leverage."),
  "Debt-to-EBITDA": define("Debt-to-EBITDA", "Debt-to-EBITDA is the ratio of total debt for the latest quarter to EBITDA over the trailing twelve months. It measures a company's ability to pay off its debt."),
  "Interest Coverage": define("Interest Coverage", "Interest Coverage is a ratio that determines how easily a company can pay interest expenses on outstanding debt. It is calculated by dividing a company's Operating Income by its Interest Expense."),
  "Piotroski F-Score": define("Piotroski F-Score", "Piotroski F-Score is a number between 0-9 which is used to assess the strength of a company's financial position, developed by Joseph D. Piotroski. A score of 7 to 9 indicates strong financial health, while a score of 0 to 3 suggests potential financial weakness."),
  "Altman Z-Score": define("Altman Z-Score", "Altman Z-Score is a model designed to predict the likelihood of a company going bankrupt within the next two years, developed by the financial economist from NYU named Edward Altman. It can be considered the assessment of the distress of industrial corporations. A score of 1.8 or below signals distress, 3 or above indicates safety, and scores between 1.8 and 3 fall into the grey zone."),
  "Beneish M-Score": define("Beneish M-Score", "Beneish M-Score is a mathematical model that uses eight financial ratios weighted by coefficients to identify whether a company has manipulated its profits, created by Professor Messod Beneish. An M-Score above -1.78 suggests that the company is likely to be a manipulator, while a score of -1.78 or below suggests that the company is unlikely to be a manipulator."),
  "WACC vs ROIC": define("WACC vs ROIC", "WACC %, Weighted Average Cost of Capital, is the average rate a company is expected to pay to finance its assets, weighted by the proportion of debt and equity. It reflects the minimum return a company must earn on its existing asset base to satisfy its investors, both equity and debt holders."),

  "5-Day RSI": define("5-Day RSI", "5-Day RSI is a technical indicator that measures the speed and magnitude of a stock's recent price changes to detect overbought or oversold conditions in the price of the stock. It captures the average gain on up days and the average loss on down days over the past 5 days. If RSI is 70 or above, the stock is overbought, and if RSI is 30 or below, the stock is oversold."),
  "9-Day RSI": define("9-Day RSI", "9-Day RSI is a technical indicator that measures the speed and magnitude of a stock's recent price changes to detect overbought or oversold conditions in the price of the stock. It captures the average gain on up days and the average loss on down days over the past 9 days. If RSI is 70 or above, the stock is overbought, and if RSI is 30 or below, the stock is oversold."),
  "14-Day RSI": define("14-Day RSI", "14-Day RSI is a technical indicator that measures the speed and magnitude of a stock's recent price changes to detect overbought or oversold conditions in the price of the stock. It captures the average gain on up days and the average loss on down days over the past 14 days. If RSI is 70 or above, the stock is overbought, and if RSI is 30 or below, the stock is oversold."),
  "3-1 Month Momentum %": define("3-1 Month Momentum %", "3-1 Month Momentum % measures the stock's total return from 3 months ago to 1 month ago."),
  "6-1 Month Momentum %": define("6-1 Month Momentum %", "6-1 Month Momentum % measures the stock's total return from 6 months ago to 1 month ago."),
  "12-1 Month Momentum %": define("12-1 Month Momentum %", "12-1 Month Momentum % measures the stock's total return from 12 months ago to 1 month ago."),

  "PE Ratio": define("PE Ratio", "The PE Ratio (TTM) is a valuation ratio that measures a company's share price relative to its trailing twelve months earnings per share."),
  "Forward PE Ratio": define("Forward PE Ratio", "Forward PE is calculated by dividing a company's current stock price by its expected earnings per share (EPS) over the next 12 months. It reflects how much investors are willing to pay today for $1 of future earnings, based on analysts' earnings forecasts."),
  "PE Ratio without NRI": define("PE Ratio without NRI", "PE Ratio without NRI is calculated as the share price divided by earnings per share excluding non-recurring items (EPS without NRI). This ratio removes the impact of one-time gains or losses to provide a clearer view of a company's core earnings performance."),
  "Shiller PE Ratio": define("Shiller PE Ratio", "Shiller PE Ratio is the price earnings ratio based on average inflation-adjusted earnings from the previous 10 years, known as the Cyclically Adjusted PE Ratio (CAPE Ratio), or PE 10. It was first used by Professor Robert Shiller to measure the valuation of the overall market."),
  "Price-to-Owner-Earnings": define("Price-to-Owner-Earnings", "Price-to-Owner-Earnings is calculated as the share price divided by owner earnings per share. This ratio helps assess whether a company's stock price is justified based on the earnings available to shareholders after accounting for necessary capital expenditures."),
  "PEG Ratio": define("PEG Ratio", "PEG Ratio is calculated as the PE Ratio without NRI divided by the 5-Year EBITDA Growth Rate. For banks, it is calculated as the PB Ratio divided by the 5-Year Book Value Growth Rate. This ratio helps assess whether a stock is overvalued or undervalued relative to its expected growth."),
  "PS Ratio": define("PS Ratio", "PS Ratio (Price-to-Sales Ratio) is calculated as the share price divided by revenue per share. It can also be computed at the company level as: PS Ratio = Market Cap / Total Revenue. It indicates the value that financial markets have placed on each dollar of a company's sales or revenues."),
  "PB Ratio": define("PB Ratio", "PB Ratio (Price-to-Book Ratio) is calculated as the share price divided by the book value per share. It can also be derived at the company level using: PB Ratio = Market Cap / (Total Stockholders Equity - Preferred Stock). It measures the valuation of the stock relative to the underlying asset of the company."),
  "Price-to-Tangible-Book": define("Price-to-Tangible-Book", "Price-to-Tangible-Book is calculated as the share price divided by the tangible book value per share."),
  "Price-to-Free-Cash-Flow": define("Price-to-Free-Cash-Flow", "Price-to-Free-Cash-Flow is calculated as the share price divided by free cash flow per share. This ratio reflects how much investors are paying for each dollar of free cash flow."),
  "Price-to-Operating-Cash-Flow": define("Price-to-Operating-Cash-Flow", "Price-to-Operating-Cash-Flow is calculated as the share price divided by operating cash flow per share. It reflects how much investors are willing to pay for each dollar of cash generated from the company's core business operations."),
  "EV-to-EBIT": define("EV-to-EBIT", "EV-to-EBIT is calculated as Enterprise Value divided by its EBIT. It measures how much investors are willing to pay for each dollar of a company's operating profit, before the effects of financing and taxes."),
  "EV-to-Forward-EBIT": define("EV-to-Forward-EBIT", "EV-to-Forward-EBIT is calculated as enterprise value divided by the estimated EBIT. It indicates what a company is being valued at per each dollar of estimated EBIT."),
  "EV-to-EBITDA": define("EV-to-EBITDA", "EV-to-EBITDA is calculated as enterprise value divided by its EBITDA. It measures how much investors are willing to pay for each dollar of a company's core operating earnings before non-cash expenses, such as depreciation, and financing costs."),
  "EV-to-Forward-EBITDA": define("EV-to-Forward-EBITDA", "EV-to-Forward-EBITDA is calculated as enterprise value divided by the estimated EBITDA. It indicates what a company is being valued at per each dollar of estimated EBITDA."),
  "EV-to-Revenue": define("EV-to-Revenue", "EV-to-Revenue is calculated as enterprise value divided by its revenue. It shows how much investors are willing to pay for each dollar of revenue. A lower ratio may indicate the company is undervalued relative to its sales, while a higher ratio could suggest overvaluation."),
  "EV-to-Forward-Revenue": define("EV-to-Forward-Revenue", "EV-to-Forward-Revenue is calculated as enterprise value divided by the estimated Revenue. It indicates what a company is being valued at per each dollar of estimated Revenue."),
  "EV-to-FCF": define("EV-to-FCF", "EV-to-FCF is calculated as Enterprise Value divided by its Free Cash Flow. It measures how much investors are paying for each dollar of actual cash generated by the business, after necessary reinvestments. It reflects the company's valuation relative to its ability to generate cash that could be used to pay down debt, distribute dividends, or reinvest in the business."),
  "Price-to-GF-Value": define("Price-to-GF-Value", "Price-to-GF-Value measures how a stock's current market price compares to its GF Value, calculated by dividing the stock's current price by its GF Value. It helps to evaluate whether a stock is potentially undervalued or overvalued based on GuruFocus' proprietary valuation model of GF Value. A value above 1 suggests the stock is trading above its fair value and may be overvalued. A value below 1.00 suggests the stock is trading below its fair value and may be undervalued."),
  "Price-to-Projected-FCF": define("Price-to-Projected-FCF", "Price-to-Projected-FCF is calculated as price divided by Intrinsic Value: Projected FCF."),
  "Price-to-DCF (Earnings Based)": define("Price-to-DCF (Earnings Based)", "Price-to-DCF (Earnings Based) is calculated as price divided by Intrinsic Value: DCF (Earnings Based)."),
  "Price-to-DCF (FCF Based)": define("Price-to-DCF (FCF Based)", "Price-to-DCF (FCF Based) is calculated as price divided by Intrinsic Value: DCF (FCF Based)."),
  "Price-to-Median-PS-Value": define("Price-to-Median-PS-Value", "Price-to-Median-PS-Value is calculated as price divided by Median PS Value."),
  "Price-to-Peter-Lynch-Fair-Value": define("Price-to-Peter-Lynch-Fair-Value", "Price-to-Peter-Lynch-Fair-Value is calculated as price divided by Peter Lynch Fair Value."),
  "Price-to-Graham-Number": define("Price-to-Graham-Number", "Price-to-Graham-Number is calculated as price divided by Graham Number."),
  "Earnings Yield (Greenblatt) %": define("Earnings Yield (Greenblatt) %", "Earnings Yield (Joel Greenblatt) % is calculated as EBIT divided by Enterprise Value. It was introduced by Joel Greenblatt in his book, The Little That Beat the Market."),
  "FCF Yield %": define("FCF Yield %", "FCF Yield % is calculated as Free Cash Flow divided by Market Capitalization. It is a financial solvency ratio that compares the free cash flow a company is expected to earn against its market value."),
  "Forward Rate of Return (Yacktman) %": define("Forward Rate of Return (Yacktman) %", "Forward Rate of Return (Yacktman) % is defined as the normalized free cash flow yield plus real growth plus inflation. It is a concept that Don Yacktman uses in his investment approach."),

  "Gross Margin %": define("Gross Margin %", "Gross Margin % is calculated as gross profit divided by its revenue."),
  "Operating Margin %": define("Operating Margin %", "Operating Margin % is calculated as Operating Income divided by its Revenue."),
  "Net Margin %": define("Net Margin %", "Net Margin % is calculated as Net Income divided by its Revenue."),
  "EBITDA Margin %": define("EBITDA Margin %", "EBITDA Margin % is calculated as EBITDA divided by its Revenue."),
  "FCF Margin %": define("FCF Margin %", "FCF Margin % is calculated as Free Cash Flow divided by its Revenue."),
  "OCF Margin %": define("OCF Margin %", "OCF Margin % is calculated as Cash Flow from Operations divided by its Revenue."),
  "ROE %": define("ROE %", "ROE %, or Return on Equity, is a measure of a company's financial performance calculated as net income divided by the average total shareholders' equity over a period. It indicates how efficiently a company uses its equity to generate profits and serves as a key indicator of overall profitability."),
  "ROA %": define("ROA %", "ROA %, Return on assets, is calculated as Net Income divided by the average total assets over a period. It measures how well a company uses its assets."),
  "ROIC %": define("ROIC %", "ROIC %, Return on Invested Capital, is a financial ratio that measures how effectively a company uses its capital to generate profits. It is calculated as Net Operating Profit After Taxes (NOPAT) divided by the average Invested Capital over a period."),
  "3-Year ROIIC %": define("3-Year ROIIC %", "3-Year ROIIC %, 3-Year Return on Invested Incremental Capital is calculated as 3-Year Incremental Net Operating Profit After Taxes (NOPAT) divided by 3-Year Incremental Invested Capital. It measures how efficiently that profitability is earned per dollar of company capital over the past three years."),
  "ROC (Joel Greenblatt) %": define("ROC (Joel Greenblatt) %", "ROC (Joel Greenblatt) %, Return on Capital defined by Joel Greenblatt, is calculated as EBIT divided by the total of net fixed assets and net working capital. It measures how efficiently a company uses its capital to generate profit."),
  "ROCE %": define("ROCE %", "ROCE %, Return on Capital Employed, measures how well a company generates profits from its capital. It is calculated as EBIT divided by the average Capital Employed over a period, where Capital Employed is calculated as Total Assets minus Total Current Liabilities."),
  "Years of Profitability over Past 10-Year": define("Years of Profitability over Past 10-Year", "Years of Profitability over Past 10-Year is the number of years within the last 10 years in which the company reported positive net income."),
  "Moat Score": define("Moat Score", "Moat Score measures the strength and durability of a company's competitive advantages. It considers factors such as brand strength, customer switching costs, network effects, intellectual property, cost advantages, economies of scale, and barriers to entry. A higher score suggests the company may be better positioned to defend its market position and profitability over time."),
  "Tariff Resilience Score": define("Tariff Resilience Score", "Tariff Resilience Score measures how well a company may be able to withstand the financial and operational effects of tariffs and trade restrictions. It considers factors such as geographic diversification, supply-chain flexibility, pricing power, domestic production capacity, sourcing alternatives, and exposure to imported goods or components. A higher score indicates greater resilience to tariff-related disruptions and costs."),
};

export const VALUATION_DEFINITIONS: ResearchDefinitionMap = {
  "Possible Value Trap, Think Twice": define(
    "Possible Value Trap, Think Twice",
    "Companies that appear significantly undervalued based on their Price-to-GF-Value ratio, but whose fundamentals show signs of weakness.",
    [
      "Deteriorating Financial Health: A low Altman Z-Score indicates a higher risk of bankruptcy, or a low Piotroski F-Score may indicate weak financial health.",
      "Earnings Manipulation: A high Beneish M-Score indicates potential earnings manipulation, raising concerns about the reliability of reported financials.",
      "Stagnant or Declining Growth: Lack of revenue or earnings growth, or a recent slowdown, may signal limited future prospects.",
      "Investors should conduct thorough due diligence, examining financial statements and growth indicators, before assuming the apparent undervaluation represents an attractive opportunity.",
    ],
  ),
};
