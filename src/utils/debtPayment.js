function parseDebtPaymentAmount(
    text,
    expectedCurrency
) {
    const clean =
        String(text || '')
            .trim()
            .toLowerCase();

    if (
        clean === 'otkazi' ||
        clean === 'otkaži' ||
        clean === 'odustani'
    ) {
        return {
            cancelled: true
        };
    }

    const match = clean.match(
        /^(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)?$/i
    );

    if (!match) {
        return null;
    }

    const amount =
        Number(match[1].replace(',', '.'));

    const currency =
        match[2]
            ? match[2].toUpperCase()
            : expectedCurrency;

    if (
        !Number.isFinite(amount) ||
        amount <= 0
    ) {
        return null;
    }

    if (
        currency !==
        String(expectedCurrency).toUpperCase()
    ) {
        return {
            error: 'WRONG_CURRENCY',
            currency
        };
    }

    return {
        amount,
        currency
    };
}

module.exports = {
    parseDebtPaymentAmount
};
