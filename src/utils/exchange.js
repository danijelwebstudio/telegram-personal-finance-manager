const { LOCATION_ALIASES } = require('./constants');

function parseDecimal(value) {
    return Number(
        String(value).replace(',', '.')
    );
}

function resolveLocation(value) {
    return LOCATION_ALIASES[
        String(value).trim().toLowerCase()
    ];
}

function parseExchangeCommand(messageText) {
    const text = String(messageText || '')
        .replace(/^\/zamijeni(?:@\w+)?/i, '')
        .trim()
        .toLowerCase();

    const withChangeMatch = text.match(
        /^(.+?)\s+dao\s+(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)\s+dobio\s+(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)\s+kusur\s+(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)$/i
    );

    if (withChangeMatch) {
        const location =
            resolveLocation(withChangeMatch[1]);

        const givenAmount =
            parseDecimal(withChangeMatch[2]);

        const fromCurrency =
            withChangeMatch[3].toUpperCase();

        const receivedAmount =
            parseDecimal(withChangeMatch[4]);

        const toCurrency =
            withChangeMatch[5].toUpperCase();

        const changeAmount =
            parseDecimal(withChangeMatch[6]);

        const changeCurrency =
            withChangeMatch[7].toUpperCase();

        if (changeCurrency !== fromCurrency) {
            return {
                error:
                    'Kusur mora biti u istoj valuti kao novac koji si dao.'
            };
        }

        const exchangedAmount =
            Number(
                (givenAmount - changeAmount).toFixed(2)
            );

        if (exchangedAmount <= 0) {
            return {
                error:
                    'Kusur ne može biti jednak ili veći od iznosa koji si dao.'
            };
        }

        return {
            location,
            givenAmount,
            changeAmount,
            exchangedAmount,
            fromCurrency,
            receivedAmount,
            toCurrency,
            exchangeRate:
                exchangedAmount / receivedAmount
        };
    }

    const withoutChangeMatch = text.match(
        /^(.+?)\s+dao\s+(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)\s+dobio\s+(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)$/i
    );

    if (withoutChangeMatch) {
        const location =
            resolveLocation(withoutChangeMatch[1]);

        const givenAmount =
            parseDecimal(withoutChangeMatch[2]);

        const fromCurrency =
            withoutChangeMatch[3].toUpperCase();

        const receivedAmount =
            parseDecimal(withoutChangeMatch[4]);

        const toCurrency =
            withoutChangeMatch[5].toUpperCase();

        return {
            location,
            givenAmount,
            changeAmount: 0,
            exchangedAmount: givenAmount,
            fromCurrency,
            receivedAmount,
            toCurrency,
            exchangeRate:
                givenAmount / receivedAmount
        };
    }

    return null;
}

function validateExchange(exchange) {
    if (!exchange) {
        return {
            valid: false,
            error: 'FORMAT'
        };
    }

    if (exchange.error) {
        return {
            valid: false,
            error: exchange.error
        };
    }

    if (!exchange.location) {
        return {
            valid: false,
            error: 'UNKNOWN_LOCATION'
        };
    }

    if (
        !Number.isFinite(exchange.givenAmount) ||
        !Number.isFinite(exchange.receivedAmount) ||
        !Number.isFinite(exchange.changeAmount) ||
        !Number.isFinite(exchange.exchangedAmount) ||
        exchange.givenAmount <= 0 ||
        exchange.receivedAmount <= 0 ||
        exchange.changeAmount < 0 ||
        exchange.exchangedAmount <= 0
    ) {
        return {
            valid: false,
            error: 'INVALID_AMOUNT'
        };
    }

    if (
        exchange.fromCurrency ===
        exchange.toCurrency
    ) {
        return {
            valid: false,
            error: 'SAME_CURRENCY'
        };
    }

    return {
        valid: true,
        error: null
    };
}

module.exports = {
    parseExchangeCommand,
    validateExchange
};
