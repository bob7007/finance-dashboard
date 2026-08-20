# Finance Dashboard Project

## Goal

This is a private personal finance dashboard.

The long-term application will aggregate:

- bank accounts
- credit cards
- loans/debt
- investment accounts
- investment holdings
- transactions
- research data

The application is read-only. It will never initiate trades, transfers, payments, or ACH transactions.

## Current stack

Frontend:
- React
- TypeScript
- Vite

Backend:
- Cloudflare Workers
- TypeScript

Database:
- Cloudflare D1

Financial data:
- Plaid

Authentication later:
- Cloudflare Access

## Local development

The application runs locally through the Cloudflare/Vite development environment.

Main frontend files currently include:

- src/App.tsx
- src/App.css
- src/index.css

Worker backend:

- worker/index.ts

## Current backend state

Plaid Sandbox is working.

We have successfully implemented:

GET /api/plaid/link-token

POST /api/plaid/exchange

GET /api/accounts

GET /api/investments

GET /api/portfolio

Plaid access tokens are persisted in local Cloudflare D1.

The normalized /api/portfolio endpoint returns:

- totalValue
- accounts[]
- holdings[]

Each normalized holding contains fields such as:

- ticker
- name
- accountName
- quantity
- price
- value
- costBasis
- gain
- gainPercent
- securityType

## Current UI state

The Portfolio screen already works and has a dark finance-terminal style.

It includes:

- top application header
- navigation bar
- portfolio title
- investment summary cards
- investment account cards
- holdings table
- Add Institution button

The existing UI styling should be preserved.

## Development rules

IMPORTANT:

1. Prefer small incremental changes.
2. Do not rewrite entire files unless absolutely necessary.
3. Do not redesign existing working UI unless explicitly requested.
4. Preserve existing CSS and layout unless the task specifically requires changing it.
5. Before making changes, inspect the relevant existing files.
6. Modify the minimum number of files necessary.
7. Do not delete working code unrelated to the requested task.
8. Do not modify worker/index.ts unless the requested task requires backend changes.
9. Do not modify Plaid integration unless explicitly requested.
10. Do not modify D1 migrations unless explicitly requested.
11. Do not expose Plaid access tokens to the frontend.
12. Do not log secrets.
13. Do not run destructive Git commands.
14. Do not commit unless explicitly requested.
15. After completing a change, report exactly which files changed and what changed in each.
16. Keep changes easy for the developer to verify manually in the browser.

## Working style

We are developing this incrementally.

For UI work:

- make one small feature at a time
- preserve the existing visual design
- test existing behavior after changes
- avoid broad refactors while adding small features

If a request is ambiguous, inspect the code first and ask before making a large architectural change.

## Command Execution Safety

Do not run or request approval to run build, deploy, install, server, or infrastructure commands.

In particular, NEVER execute or request approval for:

- `npm run build`
- `npm build`
- `npm run dev`
- `npm run deploy`
- `npm install`
- `npx wrangler ...`
- Cloudflare deployment or D1 commands
- Git commits, pushes, resets, rebases, or other destructive Git operations

If one of these commands would normally be useful after a change, only tell the user which command they may run manually.

Do not present the command through an execution/approval prompt.

For example, instead of attempting to execute:

`npm run build`

say:

"Changes are complete. You may run `npm run build` manually if you want to verify the build."

The user is responsible for executing build, deploy, install, infrastructure, and Git write commands.

Codex may inspect files and make explicitly requested source-code edits, but command execution must remain user-controlled unless the user explicitly instructs Codex to run a specific command in that same request.