const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseExpense
} = require('../src/utils/parser');

test('parses standard EUR entry', () => {
    const result =
        parseExpense(
            'Sajt 1100 eur'
        );

    assert.equal(
        result.amount,
        1100
    );

    assert.equal(
        result.currency,
        'EUR'
    );
});

test('parses BAM entry', () => {
    const result =
        parseExpense(
            'Hrana 20 bam'
        );

    assert.equal(
        result.amount,
        20
    );

    assert.equal(
        result.currency,
        'BAM'
    );
});
