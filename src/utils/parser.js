// src/utils/parser.js

function parseExpense(text) {
    // Traži brojeve i valutu (rsd, eur, bam)
    const amountMatch = text.match(/(\d+(?:\.\d+)?)/);
    const currencyMatch = text.match(/(rsd|eur|bam)/i);

    if (!amountMatch || !currencyMatch) return null;

    return {
        amount: parseFloat(amountMatch[1]),
        currency: currencyMatch[1].toUpperCase(),
        description: text.replace(amountMatch[0], '').replace(currencyMatch[0], '').trim() || 'Bez opisa'
    };
}

module.exports = { parseExpense };