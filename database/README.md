# Database migrations

Existing production database migration order:

1. `001_atomic_finance_operations.sql`
2. `002_exchange_hardening.sql`
3. `003_partial_debt_payments.sql`
4. `004_wallet_seed.sql`

The bot uses the Supabase service-role key only on the server. RLS is enabled by the security migration and the financial write operations are performed through restricted PostgreSQL RPC functions.

`004_wallet_seed.sql` is idempotent and ensures the daily wallet can hold BAM as well as the already configured currencies.

For the current existing database, do not rerun old migrations just for the sake of it. Apply only migrations that have not already been applied.
