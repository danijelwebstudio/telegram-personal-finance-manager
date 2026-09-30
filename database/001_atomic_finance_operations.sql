-- MoneyManager - atomic finance operations + private database hardening
-- Run this file ONCE in Supabase SQL Editor.
--
-- The bot uses the Supabase service-role key on the server.
-- RLS is enabled without client policies so anon/authenticated clients cannot
-- read or mutate private financial data.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. PRIVATE TABLES
-- ---------------------------------------------------------------------------

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- 2. ATOMIC INCOME / EXPENSE
--    Wallet update + transaction history are one PostgreSQL transaction.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_transaction_atomic(
    p_type public.transaction_type,
    p_location public.location_type,
    p_currency public.currency_type,
    p_amount numeric,
    p_description text DEFAULT NULL,
    p_category text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_transaction_id uuid;
    v_current_balance numeric;
BEGIN
    IF p_type NOT IN (
        'INCOME'::public.transaction_type,
        'EXPENSE'::public.transaction_type
    ) THEN
        RAISE EXCEPTION 'INVALID_TRANSACTION_TYPE: only INCOME or EXPENSE is allowed';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: amount must be greater than zero';
    END IF;

    SELECT balance
    INTO v_current_balance
    FROM public.wallets
    WHERE location = p_location
      AND currency = p_currency
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: % %', p_location, p_currency;
    END IF;

    IF p_type = 'EXPENSE'::public.transaction_type
       AND v_current_balance < p_amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_FUNDS: % % (available: %, requested: %)',
            p_location,
            p_currency,
            v_current_balance,
            p_amount;
    END IF;

    UPDATE public.wallets
    SET
        balance = CASE
            WHEN p_type = 'INCOME'::public.transaction_type
                THEN balance + p_amount
            ELSE balance - p_amount
        END,
        updated_at = now()
    WHERE location = p_location
      AND currency = p_currency;

    INSERT INTO public.transactions (
        type,
        location,
        currency,
        amount,
        description,
        category
    )
    VALUES (
        p_type,
        p_location,
        p_currency,
        p_amount,
        NULLIF(trim(COALESCE(p_description, '')), ''),
        NULLIF(trim(COALESCE(p_category, '')), '')
    )
    RETURNING id INTO v_transaction_id;

    RETURN v_transaction_id;
END;
$function$;


-- ---------------------------------------------------------------------------
-- 3. ATOMIC DEBT SETTLEMENT
--    Debt status + wallet update + transaction + debt_payments are one unit.
--
--    If there were previous partial payments, only remaining_amount is settled.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_debt_atomic(
    p_debt_id uuid,
    p_location public.location_type DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_debt public.debts%ROWTYPE;
    v_location public.location_type;
    v_amount numeric;
    v_current_balance numeric;
    v_transaction_type public.transaction_type;
    v_transaction_id uuid;
BEGIN
    SELECT *
    INTO v_debt
    FROM public.debts
    WHERE id = p_debt_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'DEBT_NOT_FOUND';
    END IF;

    IF v_debt.status = 'SETTLED'::public.debt_status
       OR COALESCE(v_debt.remaining_amount, 0) <= 0 THEN
        RAISE EXCEPTION 'DEBT_ALREADY_SETTLED';
    END IF;

    v_amount := v_debt.remaining_amount;

    v_location := COALESCE(
        p_location,
        v_debt.linked_location,
        'NS_DAILY'::public.location_type
    );

    SELECT balance
    INTO v_current_balance
    FROM public.wallets
    WHERE location = v_location
      AND currency = v_debt.currency
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'WALLET_NOT_FOUND: % %', v_location, v_debt.currency;
    END IF;

    IF v_debt.direction = 'I_OWE'::public.debt_direction THEN
        IF v_current_balance < v_amount THEN
            RAISE EXCEPTION
                'INSUFFICIENT_FUNDS: % % (available: %, requested: %)',
                v_location,
                v_debt.currency,
                v_current_balance,
                v_amount;
        END IF;

        UPDATE public.wallets
        SET
            balance = balance - v_amount,
            updated_at = now()
        WHERE location = v_location
          AND currency = v_debt.currency;

        v_transaction_type := 'EXPENSE'::public.transaction_type;
    ELSE
        UPDATE public.wallets
        SET
            balance = balance + v_amount,
            updated_at = now()
        WHERE location = v_location
          AND currency = v_debt.currency;

        v_transaction_type := 'INCOME'::public.transaction_type;
    END IF;

    INSERT INTO public.transactions (
        type,
        location,
        currency,
        amount,
        description,
        category
    )
    VALUES (
        v_transaction_type,
        v_location,
        v_debt.currency,
        v_amount,
        CASE
            WHEN v_debt.direction = 'I_OWE'::public.debt_direction
                THEN 'Isplata duga: ' || v_debt.counterparty
            ELSE 'Naplata duga: ' || v_debt.counterparty
        END,
        'DEBT'
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO public.debt_payments (
        debt_id,
        amount,
        note,
        paid_at
    )
    VALUES (
        v_debt.id,
        v_amount,
        'Potpuno zatvaranje duga preko Telegram bota',
        now()
    );

    UPDATE public.debts
    SET
        remaining_amount = 0,
        status = 'SETTLED'::public.debt_status,
        updated_at = now()
    WHERE id = v_debt.id;

    RETURN jsonb_build_object(
        'id', v_debt.id,
        'direction', v_debt.direction,
        'counterparty', v_debt.counterparty,
        'currency', v_debt.currency,
        'amount', v_amount,
        'location', v_location,
        'transaction_id', v_transaction_id
    );
END;
$function$;


-- ---------------------------------------------------------------------------
-- 4. RPC PERMISSIONS
--    Only the server-side service role should execute finance mutation RPCs.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.record_transaction_atomic(
    public.transaction_type,
    public.location_type,
    public.currency_type,
    numeric,
    text,
    text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.record_transaction_atomic(
    public.transaction_type,
    public.location_type,
    public.currency_type,
    numeric,
    text,
    text
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_transaction_atomic(
    public.transaction_type,
    public.location_type,
    public.currency_type,
    numeric,
    text,
    text
) TO service_role;


REVOKE ALL ON FUNCTION public.settle_debt_atomic(
    uuid,
    public.location_type
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.settle_debt_atomic(
    uuid,
    public.location_type
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.settle_debt_atomic(
    uuid,
    public.location_type
) TO service_role;


-- Existing transfer RPC is already atomic. Restrict it to the server as well.
REVOKE ALL ON FUNCTION public.atomic_transfer(
    public.location_type,
    public.currency_type,
    numeric,
    public.location_type,
    public.currency_type,
    numeric,
    numeric,
    text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.atomic_transfer(
    public.location_type,
    public.currency_type,
    numeric,
    public.location_type,
    public.currency_type,
    numeric,
    numeric,
    text
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.atomic_transfer(
    public.location_type,
    public.currency_type,
    numeric,
    public.location_type,
    public.currency_type,
    numeric,
    numeric,
    text
) TO service_role;


-- Old balance-only functions are kept for compatibility, but are no longer
-- intended to be called directly by the bot.
REVOKE ALL ON FUNCTION public.increment_balance(
    public.location_type,
    public.currency_type,
    numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.increment_balance(
    public.location_type,
    public.currency_type,
    numeric
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_balance(
    public.location_type,
    public.currency_type,
    numeric
) TO service_role;


REVOKE ALL ON FUNCTION public.decrement_balance(
    public.location_type,
    public.currency_type,
    numeric
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.decrement_balance(
    public.location_type,
    public.currency_type,
    numeric
) FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.decrement_balance(
    public.location_type,
    public.currency_type,
    numeric
) TO service_role;

COMMIT;
