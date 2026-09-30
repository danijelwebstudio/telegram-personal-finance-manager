-- MoneyManager - atomic full and partial debt payments
-- Existing project: run this file once in Supabase SQL Editor.

BEGIN;

CREATE OR REPLACE FUNCTION public.pay_debt_atomic(
    p_debt_id uuid,
    p_amount numeric DEFAULT NULL,
    p_location public.location_type DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_debt public.debts%ROWTYPE;
    v_payment_amount numeric;
    v_new_remaining numeric;
    v_location public.location_type;
    v_wallet_balance numeric;
    v_transaction_id uuid;
    v_new_status public.debt_status;
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
       OR v_debt.remaining_amount <= 0 THEN
        RAISE EXCEPTION 'DEBT_ALREADY_SETTLED';
    END IF;

    v_payment_amount := COALESCE(p_amount, v_debt.remaining_amount);

    IF v_payment_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_AMOUNT';
    END IF;

    IF v_payment_amount > v_debt.remaining_amount THEN
        RAISE EXCEPTION
            'PAYMENT_EXCEEDS_REMAINING: remaining %, requested %',
            v_debt.remaining_amount,
            v_payment_amount;
    END IF;

    v_location := COALESCE(
        p_location,
        v_debt.linked_location,
        'NS_DAILY'::public.location_type
    );

    SELECT balance
    INTO v_wallet_balance
    FROM public.wallets
    WHERE location = v_location
      AND currency = v_debt.currency
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'WALLET_NOT_FOUND: % %',
            v_location,
            v_debt.currency;
    END IF;

    IF v_debt.direction = 'I_OWE'::public.debt_direction THEN
        IF v_wallet_balance < v_payment_amount THEN
            RAISE EXCEPTION
                'INSUFFICIENT_FUNDS: available %, requested %',
                v_wallet_balance,
                v_payment_amount;
        END IF;

        UPDATE public.wallets
        SET
            balance = balance - v_payment_amount,
            updated_at = now()
        WHERE location = v_location
          AND currency = v_debt.currency;

        INSERT INTO public.transactions (
            type,
            location,
            currency,
            amount,
            description,
            category
        )
        VALUES (
            'EXPENSE'::public.transaction_type,
            v_location,
            v_debt.currency,
            v_payment_amount,
            'Isplata duga: ' || v_debt.counterparty,
            'DEBT'
        )
        RETURNING id INTO v_transaction_id;
    ELSE
        UPDATE public.wallets
        SET
            balance = balance + v_payment_amount,
            updated_at = now()
        WHERE location = v_location
          AND currency = v_debt.currency;

        INSERT INTO public.transactions (
            type,
            location,
            currency,
            amount,
            description,
            category
        )
        VALUES (
            'INCOME'::public.transaction_type,
            v_location,
            v_debt.currency,
            v_payment_amount,
            'Naplata duga: ' || v_debt.counterparty,
            'DEBT'
        )
        RETURNING id INTO v_transaction_id;
    END IF;

    v_new_remaining :=
        v_debt.remaining_amount - v_payment_amount;

    IF v_new_remaining = 0 THEN
        v_new_status :=
            'SETTLED'::public.debt_status;
    ELSE
        v_new_status :=
            'PARTIALLY_PAID'::public.debt_status;
    END IF;

    INSERT INTO public.debt_payments (
        debt_id,
        amount,
        note,
        paid_at
    )
    VALUES (
        v_debt.id,
        v_payment_amount,
        CASE
            WHEN v_new_remaining = 0
                THEN 'Potpuna isplata preko Telegram bota'
            ELSE 'Parcijalna isplata preko Telegram bota'
        END,
        now()
    );

    UPDATE public.debts
    SET
        remaining_amount = v_new_remaining,
        status = v_new_status,
        updated_at = now()
    WHERE id = v_debt.id;

    RETURN jsonb_build_object(
        'id', v_debt.id,
        'direction', v_debt.direction,
        'counterparty', v_debt.counterparty,
        'currency', v_debt.currency,
        'amount', v_payment_amount,
        'remaining_amount', v_new_remaining,
        'status', v_new_status,
        'location', v_location,
        'transaction_id', v_transaction_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_debt_atomic(
    uuid,
    numeric,
    public.location_type
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.pay_debt_atomic(
    uuid,
    numeric,
    public.location_type
) TO service_role;

COMMIT;
