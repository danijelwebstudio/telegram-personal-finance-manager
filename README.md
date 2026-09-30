# Money Manager Telegram Bot

A private Telegram-based personal finance system built for a real multi-currency cash workflow.

The project started because generic budgeting apps did not match the way I actually manage physical cash across different currencies and locations. The bot is used directly through Telegram and keeps PostgreSQL/Supabase as the source of truth.

## What it handles

- Income and expenses in RSD, EUR and BAM
- Physical money locations such as daily wallet and safes
- Transfers between locations
- Currency exchange with real-world returned change
- Effective exchange-rate tracking
- Debts and receivables
- Full and partial debt payments
- Atomic wallet + ledger updates in PostgreSQL
- Daily-wage tracking
- Current and previous-month reports
- Automatic report on the first day of each month
- Telegram user whitelist
- Render-compatible health server

## Real-world exchange example

Instead of pretending that all cash handed to an exchange office was converted, the bot models returned change:

```text
/zamijeni džep dao 12000 rsd dobio 100 eur kusur 200 rsd
```

Result:

```text
Given:              12,000 RSD
Returned change:       200 RSD
Actually exchanged: 11,800 RSD
Received:              100 EUR
Effective rate:        118 RSD/EUR
```

The EUR stays in the same physical wallet first. If it is later placed into a safe, that is recorded as a separate transfer:

```text
/prebaci iz džep u ns sef 100 eur
```

This distinction keeps the digital model aligned with what physically happened to the cash.

## Debt workflow

Create a receivable:

```text
/dug Klijent 500 eur Website
```

Create money you owe:

```text
/dug Faks -6000 rsd Ispiti
```

Then:

```text
/isplati
```

Select the debt and choose either:

- `SVE` for the full remaining amount
- `DIO` for a partial payment

Every payment updates the wallet, transaction ledger, debt remaining amount and debt-payment history in one PostgreSQL transaction.

## Daily wage tracking

```text
Dnevnica 4000 rsd BalkanBet
```

Entries containing `Dnevnica` are categorized for monthly reporting. Reports show the number of recorded work days, total daily-wage income and descriptions of recorded work.

## Reports

Current month:

```text
/izvjestaj
```

Previous month:

```text
/izvjestaj prosli
```

The scheduler sends the completed previous-month report on the first day of each month at 09:00 Europe/Belgrade.

Currencies are reported separately. RSD, EUR and BAM are never incorrectly added into one total.

## Architecture

```text
Telegram
   |
 Telegraf
   |
Command / callback handlers
   |
Service layer
   |
Supabase JS
   |
PostgreSQL RPC functions
   |
wallets / transactions / transfers / debts / debt_payments
```

Financial operations that affect more than one record are handled atomically in PostgreSQL so a wallet balance cannot be changed without the related ledger/debt record being updated in the same operation.

## Security

- Telegram access is restricted through `ALLOWED_USER_IDS`.
- Secrets live in `.env`, which must never be committed.
- Server-side Supabase access uses the service-role key.
- RLS is enabled on finance tables.
- Atomic write RPC functions are not executable by `anon` or `authenticated`; execution is granted only to `service_role`.

## Environment variables

Create `.env` in the project root:

```text
TELEGRAM_BOT_TOKEN=
ALLOWED_USER_IDS=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NODE_ENV=production
PORT=3000
```

Never commit the real `.env`.

## Run locally

```bash
npm ci
npm start
```

Only one polling instance of the Telegram bot may use the same bot token at the same time. Suspend the production Render instance while testing locally.

## Tests

```bash
npm test
```

Tests cover the money-input parser, currency-exchange calculations and partial-debt payment input.

## Database

Migration files live in `database/`.

For the existing production database, apply only migrations that have not already been run.

## Why this project exists

This is not a generic finance-app clone. It was designed around an actual personal workflow, then changed after real usage exposed edge cases that generic models missed: physical wallet locations, multiple cash currencies, returned exchange-office change, moving exchanged cash into a safe later, and partial debt repayment.
