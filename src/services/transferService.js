const supabase = require('../db/supabase');

function positiveNumber(value, fieldName) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        throw new Error(`${fieldName} mora biti broj veći od nule.`);
    }

    return number;
}

async function moveMoney(
    fromLoc,
    fromCur,
    toLoc,
    toCur,
    fromAmount,
    toAmount = null,
    exchangeRate = null,
    note = 'Transfer između lokacija'
) {
    const sourceAmount = positiveNumber(fromAmount, 'Izvorni iznos');
    const destinationAmount = positiveNumber(
        toAmount ?? fromAmount,
        'Odredišni iznos'
    );

    const rate =
        exchangeRate === null || exchangeRate === undefined
            ? null
            : positiveNumber(exchangeRate, 'Kurs');

    const { data, error } = await supabase.rpc('atomic_transfer', {
        p_from_location: fromLoc,
        p_from_currency: fromCur,
        p_from_amount: sourceAmount,
        p_to_location: toLoc,
        p_to_currency: toCur,
        p_to_amount: destinationAmount,
        p_exchange_rate: rate,
        p_note: note
    });

    if (error) {
        console.error('Atomic transfer error:', error);
        throw error;
    }

    return data;
}

module.exports = {
    moveMoney
};
