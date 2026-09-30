const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseDebtPaymentAmount
} = require('../src/utils/debtPayment');

test('parses amount with explicit currency', () => {
    const result =
        parseDebtPaymentAmount(
            '100 eur',
            'EUR'
        );

    assert.deepEqual(
        result,
        {
            amount: 100,
            currency: 'EUR'
        }
    );
});

test('uses debt currency when currency is omitted', () => {
    const result =
        parseDebtPaymentAmount(
            '250',
            'RSD'
        );

    assert.deepEqual(
        result,
        {
            amount: 250,
            currency: 'RSD'
        }
    );
});

test('accepts decimal comma', () => {
    const result =
        parseDebtPaymentAmount(
            '12,50 bam',
            'BAM'
        );

    assert.equal(
        result.amount,
        12.5
    );
});

test('rejects wrong currency', () => {
    const result =
        parseDebtPaymentAmount(
            '100 eur',
            'RSD'
        );

    assert.equal(
        result.error,
        'WRONG_CURRENCY'
    );
});

test('recognizes cancellation', () => {
    const result =
        parseDebtPaymentAmount(
            'otkazi',
            'EUR'
        );

    assert.equal(
        result.cancelled,
        true
    );
});
