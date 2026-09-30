const supabase = require('../db/supabase');

async function addDebt(
    userId,
    person,
    amount,
    currency,
    description,
    direction
) {
    const normalizedAmount =
        Math.abs(Number(amount));

    if (
        !Number.isFinite(normalizedAmount) ||
        normalizedAmount <= 0
    ) {
        throw new Error(
            'Iznos duga mora biti veći od nule.'
        );
    }

    const { data, error } = await supabase
        .from('debts')
        .insert([
            {
                direction,
                counterparty: person,
                currency,
                original_amount:
                    normalizedAmount,
                remaining_amount:
                    normalizedAmount,
                status: 'ACTIVE',
                description:
                    description || null,
                linked_location:
                    direction === 'I_OWE'
                        ? 'NS_DAILY'
                        : null
            }
        ])
        .select()
        .single();

    if (error) {
        console.error(
            'Supabase debt insert error:',
            error
        );

        throw error;
    }

    return data;
}

async function getDebtById(debtId) {
    const { data, error } = await supabase
        .from('debts')
        .select('*')
        .eq('id', debtId)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

async function payDebt(
    debtId,
    amount = null,
    location = null
) {
    const rpcArgs = {
        p_debt_id: debtId,
        p_amount:
            amount === null
                ? null
                : Number(amount),
        p_location: location
    };

    const { data, error } =
        await supabase.rpc(
            'pay_debt_atomic',
            rpcArgs
        );

    if (error) {
        console.error(
            'Atomic debt payment error:',
            error
        );

        throw error;
    }

    return data;
}

async function settleDebt(
    debtId,
    location = null
) {
    return payDebt(
        debtId,
        null,
        location
    );
}

module.exports = {
    addDebt,
    getDebtById,
    payDebt,
    settleDebt
};
