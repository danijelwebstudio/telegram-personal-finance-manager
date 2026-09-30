-- Idempotent wallet seed used by the current personal workflow.
-- Safe to run more than once.

INSERT INTO public.wallets (location, currency, balance)
SELECT
    'NS_DAILY'::public.location_type,
    'BAM'::public.currency_type,
    0
WHERE NOT EXISTS (
    SELECT 1
    FROM public.wallets
    WHERE location = 'NS_DAILY'::public.location_type
      AND currency = 'BAM'::public.currency_type
);
