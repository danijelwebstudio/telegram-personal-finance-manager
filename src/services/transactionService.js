const supabase = require('../db/supabase');
const { TRANSACTION_TYPES } = require('../utils/constants');

function normalizeAmount(amount) {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        throw new Error('Iznos mora biti broj veći od nule.');
    }

    return numericAmount;
}

async function recordTransaction(type, location, currency, amount, description, category = null) {
    const numericAmount = normalizeAmount(amount);

    const { data, error } = await supabase.rpc('record_transaction_atomic', {
        p_type: type,
        p_location: location,
        p_currency: currency,
        p_amount: numericAmount,
        p_description: description || null,
        p_category: category || null
    });

    if (error) {
        console.error('Atomic transaction error:', error);
        throw error;
    }

    return data;
}

async function addIncome(location, currency, amount, description, category = null) {
    return recordTransaction(
        TRANSACTION_TYPES.INCOME,
        location,
        currency,
        amount,
        description,
        category
    );
}

async function addExpense(location, currency, amount, description, category = null) {
    return recordTransaction(
        TRANSACTION_TYPES.EXPENSE,
        location,
        currency,
        amount,
        description,
        category
    );
}

module.exports = {
    addIncome,
    addExpense,
    recordTransaction
};
