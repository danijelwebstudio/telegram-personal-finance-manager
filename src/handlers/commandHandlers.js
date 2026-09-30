const { addDebt } = require('../services/debtService');
const { getBalances } = require('../services/walletService');
const { moveMoney } = require('../services/transferService');
const { LOCATION_ALIASES } = require('../utils/constants');
const { Markup } = require('telegraf');
const supabase = require('../db/supabase');

const {
    getMonthlyReport,
    formatMonthlyReport,
    getCurrentYearMonth,
    getPreviousYearMonth
} = require('../services/reportService');

async function handleStanje(ctx) {
    try {
        const balances =
            await getBalances();

        if (
            !balances ||
            balances.length === 0
        ) {
            return ctx.reply(
                'Novčanici su prazni.'
            );
        }

        const grouped =
            balances.reduce(
                (acc, current) => {
                    if (!acc[current.location]) {
                        acc[current.location] = [];
                    }

                    acc[current.location].push(
                        `${current.balance} ${current.currency}`
                    );

                    return acc;
                },
                {}
            );

        let message =
            '📊 TVOJE TRENUTNO STANJE\n\n';

        for (
            const [location, amounts]
            of Object.entries(grouped)
        ) {
            message +=
                `📍 ${location}\n` +
                `${amounts
                    .map(
                        (amount) =>
                            `  • ${amount}`
                    )
                    .join('\n')}\n\n`;
        }

        return ctx.reply(message);
    } catch (error) {
        console.error(error);

        return ctx.reply(
            '❌ Greška pri učitavanju stanja.'
        );
    }
}

async function handleTransfer(ctx) {
    const text = ctx.message.text
        .replace(
            /^\/prebaci(?:@\w+)?/i,
            ''
        )
        .trim()
        .toLowerCase();

    const match = text.match(
        /^iz\s+(.+?)\s+u\s+(.+?)\s+(\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)$/i
    );

    if (!match) {
        return ctx.reply(
            'Format:\n' +
            '/prebaci iz džep u ns sef 100 eur'
        );
    }

    const fromLoc =
        LOCATION_ALIASES[
            match[1].trim()
        ];

    const toLoc =
        LOCATION_ALIASES[
            match[2].trim()
        ];

    const amount =
        Number(
            match[3].replace(',', '.')
        );

    const currency =
        match[4].toUpperCase();

    if (!fromLoc || !toLoc) {
        return ctx.reply(
            'Ne prepoznajem lokaciju.'
        );
    }

    try {
        await moveMoney(
            fromLoc,
            currency,
            toLoc,
            currency,
            amount,
            amount,
            null,
            'Transfer između lokacija'
        );

        return ctx.reply(
            `✅ Preneto: ${amount} ${currency}\n` +
            `${fromLoc} ➔ ${toLoc}`
        );
    } catch (error) {
        console.error(error);

        return ctx.reply(
            '❌ Greška pri transferu.'
        );
    }
}

async function handleDugovi(ctx) {
    try {
        const { data: debts, error } =
            await supabase
                .from('debts')
                .select('*')
                .in(
                    'status',
                    [
                        'ACTIVE',
                        'PARTIALLY_PAID'
                    ]
                )
                .order(
                    'created_at',
                    { ascending: true }
                );

        if (error) {
            throw error;
        }

        if (
            !debts ||
            debts.length === 0
        ) {
            return ctx.reply(
                'Nemaš aktivnih dugova.'
            );
        }

        let receivables =
            '💰 DRUGI DUGUJU TEBI:\n';

        let payables =
            '📉 TI DUGUJEŠ:\n';

        for (const debt of debts) {
            const partial =
                debt.status ===
                'PARTIALLY_PAID'
                    ? ` | prvobitno ${debt.original_amount}`
                    : '';

            const line =
                `• ${debt.counterparty}: ` +
                `${debt.remaining_amount} ${debt.currency}` +
                partial +
                `${debt.description
                    ? ` (${debt.description})`
                    : ''}\n`;

            if (
                debt.direction ===
                'OWED_TO_ME'
            ) {
                receivables += line;
            } else {
                payables += line;
            }
        }

        return ctx.reply(
            `${receivables}\n${payables}`
        );
    } catch (error) {
        console.error(error);

        return ctx.reply(
            '❌ Greška pri učitavanju dugova.'
        );
    }
}

async function handleDug(ctx) {
    const text = ctx.message.text
        .replace(
            /^\/dug(?:@\w+)?/i,
            ''
        )
        .trim();

    const match = text.match(
        /^(.+?)\s+(-?\d+(?:[.,]\d+)?)\s*(rsd|eur|bam)\s*(.*)$/i
    );

    if (!match) {
        return ctx.reply(
            'Format:\n' +
            '/dug Željko 1100 eur Sajt\n' +
            '/dug Faks -6000 rsd Ispiti'
        );
    }

    const [
        ,
        person,
        amountText,
        currency,
        description
    ] = match;

    const amount =
        Number(
            amountText.replace(',', '.')
        );

    const direction =
        amount < 0
            ? 'I_OWE'
            : 'OWED_TO_ME';

    try {
        await addDebt(
            ctx.from.id,
            person,
            amount,
            currency.toUpperCase(),
            description,
            direction
        );

        return ctx.reply(
            `✅ Zapisano: ${person} | ` +
            `${Math.abs(amount)} ` +
            `${currency.toUpperCase()}`
        );
    } catch (error) {
        console.error(error);

        return ctx.reply(
            '❌ Greška pri upisu duga.'
        );
    }
}

async function handleIsplati(ctx) {
    try {
        const { data: debts, error } =
            await supabase
                .from('debts')
                .select('*')
                .in(
                    'status',
                    [
                        'ACTIVE',
                        'PARTIALLY_PAID'
                    ]
                )
                .order(
                    'created_at',
                    { ascending: true }
                );

        if (error) {
            throw error;
        }

        if (
            !debts ||
            debts.length === 0
        ) {
            return ctx.reply(
                'Nemaš aktivnih dugova za isplatu.'
            );
        }

        const buttons =
            debts.map((debt) => {
                const label =
                    `${debt.direction === 'I_OWE'
                        ? '🔴'
                        : '🟢'} ` +
                    `${debt.counterparty} ` +
                    `(${debt.remaining_amount} ${debt.currency})`;

                return [
                    Markup.button.callback(
                        label,
                        `debt_select_${debt.id}`
                    )
                ];
            });

        return ctx.reply(
            'Koji dug želiš evidentirati?',
            Markup.inlineKeyboard(
                buttons
            )
        );
    } catch (error) {
        console.error(error);

        return ctx.reply(
            '❌ Greška pri učitavanju liste za isplatu.'
        );
    }
}

async function handleIzvjestaj(ctx) {
    try {
        const argument =
            ctx.message.text
                .replace(
                    /^\/izvjestaj(?:@\w+)?/i,
                    ''
                )
                .trim()
                .toLowerCase();

        const period =
            [
                'prosli',
                'prošli',
                'prethodni'
            ].includes(argument)
                ? getPreviousYearMonth()
                : getCurrentYearMonth();

        const report =
            await getMonthlyReport(
                period.year,
                period.month
            );

        return ctx.reply(
            formatMonthlyReport(report)
        );
    } catch (error) {
        console.error(error);

        return ctx.reply(
            '❌ Greška pri generisanju izvještaja.'
        );
    }
}

module.exports = {
    handleStanje,
    handleTransfer,
    handleDugovi,
    handleDug,
    handleIsplati,
    handleIzvjestaj
};
