require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');

const authMiddleware = require('./middleware/auth');
const { parseExpense } = require('./utils/parser');
const {
    parseExchangeCommand,
    validateExchange
} = require('./utils/exchange');
const {
    parseDebtPaymentAmount
} = require('./utils/debtPayment');

const {
    addIncome,
    addExpense
} = require('./services/transactionService');

const {
    getDebtById,
    payDebt
} = require('./services/debtService');

const {
    moveMoney
} = require('./services/transferService');

const {
    LOCATIONS
} = require('./utils/constants');

const {
    handleStanje,
    handleTransfer,
    handleDugovi,
    handleDug,
    handleIsplati,
    handleIzvjestaj
} = require('./handlers/commandHandlers');

if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error(
        'Nedostaje TELEGRAM_BOT_TOKEN u .env fajlu.'
    );
}

const bot =
    new Telegraf(
        process.env.TELEGRAM_BOT_TOKEN
    );

const transactionSessions = {};
const exchangeSessions = {};
const debtPaymentSessions = {};

bot.use(authMiddleware);

bot.start((ctx) => {
    return ctx.reply(
        'Pozdrav! Money Manager je spreman. 🚀\n\n' +
        'Brzi unos:\n' +
        '• Sajt 1100 eur\n' +
        '• -6000 ispiti rsd\n' +
        '• Dnevnica 4000 rsd BalkanBet\n\n' +
        'Mjenjačnica:\n' +
        '• /zamijeni džep dao 12000 rsd dobio 100 eur kusur 200 rsd\n\n' +
        'Komande:\n' +
        '/stanje\n' +
        '/prebaci\n' +
        '/zamijeni\n' +
        '/dugovi\n' +
        '/dug\n' +
        '/isplati\n' +
        '/izvjestaj'
    );
});

bot.command(
    'stanje',
    handleStanje
);

bot.command(
    'prebaci',
    handleTransfer
);

bot.command(
    'dugovi',
    handleDugovi
);

bot.command(
    'dug',
    handleDug
);

bot.command(
    'isplati',
    handleIsplati
);

bot.command(
    'izvjestaj',
    handleIzvjestaj
);

bot.command(
    'zamijeni',
    async (ctx) => {
        const exchange =
            parseExchangeCommand(
                ctx.message.text
            );

        const validation =
            validateExchange(
                exchange
            );

        if (!validation.valid) {
            if (
                exchange?.error
            ) {
                return ctx.reply(
                    `❌ ${exchange.error}`
                );
            }

            return ctx.reply(
                '💱 Format mjenjačnice:\n\n' +
                'Ako si dobio kusur:\n' +
                '/zamijeni džep dao 12000 rsd dobio 100 eur kusur 200 rsd\n\n' +
                'Ako nema kusura:\n' +
                '/zamijeni džep dao 11800 rsd dobio 100 eur\n\n' +
                'Dobijena valuta ostaje u istom walletu. ' +
                'Kad je fizički staviš u sef, koristi /prebaci.'
            );
        }

        exchangeSessions[
            ctx.from.id
        ] = exchange;

        const changeText =
            exchange.changeAmount > 0
                ? `\nKusur:\n${exchange.changeAmount.toFixed(2)} ${exchange.fromCurrency}\n`
                : '';

        return ctx.reply(
            '💱 MJENJAČNICA\n\n' +
            `Lokacija:\n${exchange.location}\n\n` +
            `Dao:\n${exchange.givenAmount.toFixed(2)} ${exchange.fromCurrency}\n` +
            changeText +
            `\nStvarno zamijenjeno:\n${exchange.exchangedAmount.toFixed(2)} ${exchange.fromCurrency}\n\n` +
            `Dobio:\n${exchange.receivedAmount.toFixed(2)} ${exchange.toCurrency}\n\n` +
            `Efektivni kurs:\n1 ${exchange.toCurrency} = ${exchange.exchangeRate.toFixed(4)} ${exchange.fromCurrency}`,
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '✅ POTVRDI',
                        'exchange_confirm'
                    ),
                    Markup.button.callback(
                        '❌ OTKAŽI',
                        'exchange_cancel'
                    )
                ]
            ])
        );
    }
);

bot.on(
    'text',
    async (ctx) => {
        const userId =
            ctx.from.id;

        const pendingDebt =
            debtPaymentSessions[
                userId
            ];

        if (pendingDebt) {
            const parsedPayment =
                parseDebtPaymentAmount(
                    ctx.message.text,
                    pendingDebt.currency
                );

            if (
                parsedPayment?.cancelled
            ) {
                delete debtPaymentSessions[
                    userId
                ];

                return ctx.reply(
                    '❌ Parcijalna isplata otkazana.'
                );
            }

            if (!parsedPayment) {
                return ctx.reply(
                    `Upiši iznos, npr. 100 ${pendingDebt.currency}.\n` +
                    'Za odustajanje napiši: otkazi'
                );
            }

            if (
                parsedPayment.error ===
                'WRONG_CURRENCY'
            ) {
                return ctx.reply(
                    `Ovaj dug je u ${pendingDebt.currency}. ` +
                    `Upiši iznos u ${pendingDebt.currency}.`
                );
            }

            if (
                parsedPayment.amount >
                pendingDebt.remaining
            ) {
                return ctx.reply(
                    `Preostali dug je ${pendingDebt.remaining} ${pendingDebt.currency}. ` +
                    'Ne možeš evidentirati veći iznos.'
                );
            }

            try {
                const result =
                    await payDebt(
                        pendingDebt.debtId,
                        parsedPayment.amount
                    );

                delete debtPaymentSessions[
                    userId
                ];

                const finished =
                    Number(
                        result.remaining_amount
                    ) === 0;

                return ctx.reply(
                    '✅ ISPLATA EVIDENTIRANA\n\n' +
                    `👤 ${result.counterparty}\n` +
                    `💰 Uplaćeno: ${result.amount} ${result.currency}\n` +
                    `📌 Preostalo: ${result.remaining_amount} ${result.currency}\n` +
                    `📍 Wallet: ${result.location}\n` +
                    `Status: ${finished ? 'ZATVOREN' : 'DJELIMIČNO PLAĆEN'}`
                );
            } catch (error) {
                console.error(error);

                return ctx.reply(
                    '❌ Greška pri parcijalnoj isplati.'
                );
            }
        }

        const text =
            ctx.message.text.trim();

        const isExpense =
            text.startsWith('-');

        const cleanText =
            isExpense
                ? text
                    .slice(1)
                    .trim()
                : text;

        const parsed =
            parseExpense(
                cleanText
            );

        if (!parsed) {
            return ctx.reply(
                'Nisam razumio format. Probaj:\n' +
                'Sajt 1100 eur\n' +
                '-6000 ispiti rsd\n' +
                'Dnevnica 4000 rsd BalkanBet'
            );
        }

        const isDailyWage =
            !isExpense &&
            /\bdnevnica\b/i.test(
                parsed.description
            );

        transactionSessions[
            userId
        ] = {
            ...parsed,
            isExpense,
            category:
                isDailyWage
                    ? 'DNEVNICA'
                    : null
        };

        const buttons =
            Object.keys(
                LOCATIONS
            ).map(
                (location) => [
                    Markup.button.callback(
                        `📍 ${location}`,
                        `loc_${location}`
                    )
                ]
            );

        const typeLabel =
            isExpense
                ? '🔴 RASHOD'
                : isDailyWage
                    ? '💼 DNEVNICA'
                    : '🟢 PRIHOD';

        return ctx.reply(
            `${typeLabel}: Gdje unosiš ${parsed.amount} ${parsed.currency}?`,
            Markup.inlineKeyboard(
                buttons
            )
        );
    }
);

bot.on(
    'callback_query',
    async (ctx) => {
        const userId =
            ctx.from.id;

        const callbackData =
            ctx.update
                .callback_query
                .data;


        if (
            callbackData ===
            'exchange_cancel'
        ) {
            delete exchangeSessions[
                userId
            ];

            await ctx.answerCbQuery();

            return ctx.editMessageText(
                '❌ Mjenjačnica otkazana.'
            );
        }


        if (
            callbackData ===
            'exchange_confirm'
        ) {
            const exchange =
                exchangeSessions[
                    userId
                ];

            if (!exchange) {
                return ctx.answerCbQuery(
                    'Sesija je istekla.'
                );
            }

            try {
                await moveMoney(
                    exchange.location,
                    exchange.fromCurrency,
                    exchange.location,
                    exchange.toCurrency,
                    exchange.exchangedAmount,
                    exchange.receivedAmount,
                    exchange.exchangeRate,
                    `Mjenjačnica: dao ${exchange.givenAmount} ${exchange.fromCurrency}, ` +
                    `kusur ${exchange.changeAmount} ${exchange.fromCurrency}, ` +
                    `dobio ${exchange.receivedAmount} ${exchange.toCurrency}`
                );

                delete exchangeSessions[
                    userId
                ];

                await ctx.answerCbQuery();

                const changeText =
                    exchange.changeAmount > 0
                        ? `Kusur ostao: ${exchange.changeAmount.toFixed(2)} ${exchange.fromCurrency}\n`
                        : '';

                return ctx.editMessageText(
                    '✅ MJENJAČNICA PROKNJIŽENA\n\n' +
                    `Stvarno zamijenjeno: ${exchange.exchangedAmount.toFixed(2)} ${exchange.fromCurrency}\n` +
                    `Dobijeno: ${exchange.receivedAmount.toFixed(2)} ${exchange.toCurrency}\n` +
                    changeText +
                    `Lokacija: ${exchange.location}\n` +
                    `Kurs: 1 ${exchange.toCurrency} = ${exchange.exchangeRate.toFixed(4)} ${exchange.fromCurrency}\n\n` +
                    `Ako sada fizički stavljaš ${exchange.toCurrency} u sef, koristi /prebaci.`
                );
            } catch (error) {
                console.error(error);

                return ctx.answerCbQuery(
                    'Greška pri mjenjačnici.',
                    {
                        show_alert: true
                    }
                );
            }
        }


        if (
            callbackData.startsWith(
                'debt_select_'
            )
        ) {
            const debtId =
                callbackData.replace(
                    'debt_select_',
                    ''
                );

            try {
                const debt =
                    await getDebtById(
                        debtId
                    );

                await ctx.answerCbQuery();

                return ctx.editMessageText(
                    `👤 ${debt.counterparty}\n` +
                    `Preostalo: ${debt.remaining_amount} ${debt.currency}\n\n` +
                    'Kako želiš evidentirati isplatu?',
                    Markup.inlineKeyboard([
                        [
                            Markup.button.callback(
                                '✅ SVE',
                                `debt_full_${debt.id}`
                            ),
                            Markup.button.callback(
                                '➗ DIO',
                                `debt_part_${debt.id}`
                            )
                        ]
                    ])
                );
            } catch (error) {
                console.error(error);

                return ctx.answerCbQuery(
                    'Ne mogu učitati dug.',
                    {
                        show_alert: true
                    }
                );
            }
        }


        if (
            callbackData.startsWith(
                'debt_full_'
            )
        ) {
            const debtId =
                callbackData.replace(
                    'debt_full_',
                    ''
                );

            try {
                const result =
                    await payDebt(
                        debtId
                    );

                await ctx.answerCbQuery();

                return ctx.editMessageText(
                    '✅ DUG ZATVOREN\n\n' +
                    `👤 ${result.counterparty}\n` +
                    `💰 ${result.amount} ${result.currency}\n` +
                    `📍 Wallet: ${result.location}\n\n` +
                    'Stanje i istorija su automatski ažurirani.'
                );
            } catch (error) {
                console.error(error);

                return ctx.answerCbQuery(
                    'Greška pri isplati duga.',
                    {
                        show_alert: true
                    }
                );
            }
        }


        if (
            callbackData.startsWith(
                'debt_part_'
            )
        ) {
            const debtId =
                callbackData.replace(
                    'debt_part_',
                    ''
                );

            try {
                const debt =
                    await getDebtById(
                        debtId
                    );

                debtPaymentSessions[
                    userId
                ] = {
                    debtId:
                        debt.id,
                    counterparty:
                        debt.counterparty,
                    currency:
                        debt.currency,
                    remaining:
                        Number(
                            debt.remaining_amount
                        )
                };

                await ctx.answerCbQuery();

                return ctx.editMessageText(
                    `➗ PARCIJALNA ISPLATA\n\n` +
                    `👤 ${debt.counterparty}\n` +
                    `Preostalo: ${debt.remaining_amount} ${debt.currency}\n\n` +
                    `Pošalji koliko je sada plaćeno, npr.:\n100 ${debt.currency}\n\n` +
                    'Za odustajanje napiši: otkazi'
                );
            } catch (error) {
                console.error(error);

                return ctx.answerCbQuery(
                    'Ne mogu učitati dug.',
                    {
                        show_alert: true
                    }
                );
            }
        }


        if (
            callbackData.startsWith(
                'loc_'
            )
        ) {
            const selectedLocation =
                callbackData.replace(
                    'loc_',
                    ''
                );

            const data =
                transactionSessions[
                    userId
                ];

            if (!data) {
                return ctx.answerCbQuery(
                    'Sesija je istekla.'
                );
            }

            try {
                if (data.isExpense) {
                    await addExpense(
                        selectedLocation,
                        data.currency,
                        data.amount,
                        data.description,
                        data.category
                    );
                } else {
                    await addIncome(
                        selectedLocation,
                        data.currency,
                        data.amount,
                        data.description,
                        data.category
                    );
                }

                const statusText =
                    data.isExpense
                        ? 'skinuto sa'
                        : 'dodato na';

                delete transactionSessions[
                    userId
                ];

                await ctx.answerCbQuery();

                return ctx.editMessageText(
                    `✅ Uspješno! ${data.amount} ${data.currency} ${statusText} ${selectedLocation}`
                );
            } catch (error) {
                console.error(error);

                return ctx.answerCbQuery(
                    'Greška pri upisu u bazu.',
                    {
                        show_alert: true
                    }
                );
            }
        }

        return ctx.answerCbQuery();
    }
);

bot.catch(
    (error, ctx) => {
        console.error(
            `Greška kod ${ctx.updateType}:`,
            error
        );
    }
);

module.exports = bot;
