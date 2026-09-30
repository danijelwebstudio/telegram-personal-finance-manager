-- MoneyManager - safer atomic transfers / currency exchange
-- Run once in Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.atomic_transfer(
    p_from_location public.location_type,
    p_from_currency public.currency_type,
    p_from_amount numeric,
    p_to_location public.location_type,
    p_to_currency public.currency_type,
    p_to_amount numeric,
    p_exchange_rate numeric DEFAULT NULL,
    p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_transfer_id uuid;
    v_from_balance numeric;
    v_destination_exists boolean;
BEGIN
    IF p_from_amount IS NULL OR p_from_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_FROM_AMOUNT';
    END IF;

    IF p_to_amount IS NULL OR p_to_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_TO_AMOUNT';
    END IF;

    IF p_exchange_rate IS NOT NULL AND p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'INVALID_EXCHANGE_RATE';
    END IF;

    IF p_from_location = p_to_location
       AND p_from_currency = p_to_currency THEN
        RAISE EXCEPTION 'SOURCE_AND_DESTINATION_ARE_THE_SAME';
    END IF;

    -- Lock both involved wallets in deterministic order.
    PERFORM 1
    FROM public.wallets
    WHERE (
        location = p_from_location
        AND currency = p_from_currency
    ) OR (
        location = p_to_location
        AND currency = p_to_currency
    )
    ORDER BY location::text, currency::text
    FOR UPDATE;

    SELECT balance
    INTO v_from_balance
    FROM public.wallets
    WHERE location = p_from_location
      AND currency = p_from_currency;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'SOURCE_WALLET_NOT_FOUND: % %',
            p_from_location,
            p_from_currency;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.wallets
        WHERE location = p_to_location
          AND currency = p_to_currency
    )
    INTO v_destination_exists;

    IF NOT v_destination_exists THEN
        RAISE EXCEPTION
            'DESTINATION_WALLET_NOT_FOUND: % %',
            p_to_location,
            p_to_currency;
    END IF;

    IF v_from_balance < p_from_amount THEN
        RAISE EXCEPTION
            'INSUFFICIENT_FUNDS: % % (available: %, requested: %)',
            p_from_location,
            p_from_currency,
            v_from_balance,
            p_from_amount;
    END IF;

    UPDATE public.wallets
    SET
        balance = balance - p_from_amount,
        updated_at = now()
    WHERE location = p_from_location
      AND currency = p_from_currency;

    UPDATE public.wallets
    SET
        balance = balance + p_to_amount,
        updated_at = now()
    WHERE location = p_to_location
      AND currency = p_to_currency;

    INSERT INTO public.transfers (
        from_location,
        from_currency,
        from_amount,
        to_location,
        to_currency,
        to_amount,
        exchange_rate,
        note
    )
    VALUES (
        p_from_location,
        p_from_currency,
        p_from_amount,
        p_to_location,
        p_to_currency,
        p_to_amount,
        p_exchange_rate,
        NULLIF(trim(COALESCE(p_note, '')), '')
    )
    RETURNING id INTO v_transfer_id;

    RETURN v_transfer_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.atomic_transfer(
    public.location_type,
    public.currency_type,
    numeric,
    public.location_type,
    public.currency_type,
    numeric,
    numeric,
    text
) FROM PUBLIC, anon, authenticated;

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

COMMIT;
