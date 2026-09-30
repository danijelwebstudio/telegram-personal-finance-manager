const test = require('node:test');
const assert = require('node:assert/strict');

const {
    parseExchangeCommand,
    validateExchange
} = require('../src/utils/exchange');

test('exchange with change calculates actual exchanged amount', () => {
    const result = parseExchangeCommand(
        '/zamijeni džep dao 12000 rsd dobio 100 eur kusur 200 rsd'
    );

    assert.equal(result.location, 'NS_DAILY');
    assert.equal(result.givenAmount, 12000);
    assert.equal(result.changeAmount, 200);
    assert.equal(result.exchangedAmount, 11800);
    assert.equal(result.receivedAmount, 100);
    assert.equal(result.exchangeRate, 118);
});

test('exchange without change uses full given amount', () => {
    const result = parseExchangeCommand(
        '/zamijeni džep dao 11800 rsd dobio 100 eur'
    );

    assert.equal(result.exchangedAmount, 11800);
    assert.equal(result.changeAmount, 0);
    assert.equal(result.exchangeRate, 118);
});

test('exchange accepts decimal comma', () => {
    const result = parseExchangeCommand(
        '/zamijeni džep dao 118,50 bam dobio 60 eur'
    );

    assert.equal(result.givenAmount, 118.5);
    assert.equal(result.receivedAmount, 60);
});

test('exchange rejects change in a different currency', () => {
    const result = parseExchangeCommand(
        '/zamijeni džep dao 12000 rsd dobio 100 eur kusur 2 eur'
    );

    assert.ok(result.error);
});

test('exchange rejects same source and destination currency', () => {
    const result = parseExchangeCommand(
        '/zamijeni džep dao 100 eur dobio 100 eur'
    );

    const validation =
        validateExchange(result);

    assert.equal(
        validation.valid,
        false
    );

    assert.equal(
        validation.error,
        'SAME_CURRENCY'
    );
});

test('exchange rejects unknown wallet alias', () => {
    const result = parseExchangeCommand(
        '/zamijeni nepoznato dao 100 rsd dobio 1 eur'
    );

    const validation =
        validateExchange(result);

    assert.equal(
        validation.valid,
        false
    );

    assert.equal(
        validation.error,
        'UNKNOWN_LOCATION'
    );
});
