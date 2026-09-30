const supabase = require('../db/supabase');
const { CURRENCIES } = require('../utils/constants');

const TIME_ZONE = 'Europe/Belgrade';

function getTimeZoneOffsetMinutes(date, timeZone = TIME_ZONE) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'longOffset',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });

    const timeZoneName = formatter
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')?.value;

    const match = timeZoneName?.match(/GMT([+-])(\d{2}):(\d{2})/);

    if (!match) {
        return 0;
    }

    const sign = match[1] === '+' ? 1 : -1;
    return sign * (Number(match[2]) * 60 + Number(match[3]));
}

function zonedStartOfMonthUtc(year, month, timeZone = TIME_ZONE) {
    const utcGuess = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);

    return new Date(
        utcGuess.getTime() - offsetMinutes * 60 * 1000
    );
}

function nextMonth(year, month) {
    if (month === 12) {
        return {
            year: year + 1,
            month: 1
        };
    }

    return {
        year,
        month: month + 1
    };
}

function getMonthBounds(year, month) {
    const next = nextMonth(year, month);

    return {
        start: zonedStartOfMonthUtc(year, month),
        end: zonedStartOfMonthUtc(next.year, next.month)
    };
}

function getCurrentYearMonth(timeZone = TIME_ZONE) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: 'numeric'
    }).formatToParts(new Date());

    return {
        year: Number(parts.find((part) => part.type === 'year').value),
        month: Number(parts.find((part) => part.type === 'month').value)
    };
}

function getPreviousYearMonth(timeZone = TIME_ZONE) {
    const current = getCurrentYearMonth(timeZone);

    if (current.month === 1) {
        return {
            year: current.year - 1,
            month: 12
        };
    }

    return {
        year: current.year,
        month: current.month - 1
    };
}

function localDateKey(isoDate, timeZone = TIME_ZONE) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date(isoDate));
}

function cleanWorkDescription(description) {
    return String(description || 'Dnevnica')
        .replace(/\bdnevnica\b/gi, '')
        .trim() || 'Dnevnica';
}

function createCurrencyBucket() {
    return {
        income: 0,
        expense: 0,
        biggestIncome: null,
        biggestExpense: null,
        categories: {},
        dailyWage: 0
    };
}

async function getMonthlyReport(year, month) {
    const { start, end } = getMonthBounds(year, month);

    const [
        transactionsResult,
        transfersResult
    ] = await Promise.all([
        supabase
            .from('transactions')
            .select(
                'id,type,location,currency,amount,description,category,created_at'
            )
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString())
            .order('created_at', { ascending: true }),

        supabase
            .from('transfers')
            .select(
                'id,from_location,from_currency,from_amount,to_location,to_currency,to_amount,exchange_rate,note,created_at'
            )
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString())
            .order('created_at', { ascending: true })
    ]);

    if (transactionsResult.error) {
        throw transactionsResult.error;
    }

    if (transfersResult.error) {
        throw transfersResult.error;
    }

    const currencyStats = {};

    for (const currency of Object.values(CURRENCIES)) {
        currencyStats[currency] = createCurrencyBucket();
    }

    const workDays = new Set();
    const workDescriptions = new Map();

    for (const transaction of transactionsResult.data || []) {
        const currency = transaction.currency;
        const amount = Number(transaction.amount) || 0;

        if (!currencyStats[currency]) {
            currencyStats[currency] = createCurrencyBucket();
        }

        const bucket = currencyStats[currency];

        if (transaction.type === 'INCOME') {
            bucket.income += amount;

            if (
                !bucket.biggestIncome ||
                amount > bucket.biggestIncome.amount
            ) {
                bucket.biggestIncome = {
                    amount,
                    description: transaction.description || 'Bez opisa'
                };
            }
        }

        if (transaction.type === 'EXPENSE') {
            bucket.expense += amount;

            if (
                !bucket.biggestExpense ||
                amount > bucket.biggestExpense.amount
            ) {
                bucket.biggestExpense = {
                    amount,
                    description: transaction.description || 'Bez opisa'
                };
            }

            const category = transaction.category || 'Ostalo';

            bucket.categories[category] =
                (bucket.categories[category] || 0) + amount;
        }

        if (
            transaction.type === 'INCOME' &&
            String(transaction.category || '').toUpperCase() === 'DNEVNICA'
        ) {
            bucket.dailyWage += amount;
            workDays.add(localDateKey(transaction.created_at));

            const description = cleanWorkDescription(
                transaction.description
            );

            workDescriptions.set(
                description,
                (workDescriptions.get(description) || 0) + 1
            );
        }
    }

    const exchanges = (transfersResult.data || [])
        .filter(
            (transfer) =>
                transfer.from_currency !== transfer.to_currency
        )
        .map((transfer) => ({
            fromLocation: transfer.from_location,
            fromCurrency: transfer.from_currency,
            fromAmount: Number(transfer.from_amount),
            toLocation: transfer.to_location,
            toCurrency: transfer.to_currency,
            toAmount: Number(transfer.to_amount),
            exchangeRate:
                transfer.exchange_rate === null
                    ? null
                    : Number(transfer.exchange_rate),
            note: transfer.note
        }));

    return {
        year,
        month,
        currencyStats,
        workDays: workDays.size,
        workDescriptions: Array.from(workDescriptions.entries())
            .map(([description, count]) => ({
                description,
                count
            }))
            .sort((a, b) => b.count - a.count),
        exchanges,
        transactionCount: (transactionsResult.data || []).length
    };
}

const MONTH_NAMES = [
    'JANUAR',
    'FEBRUAR',
    'MART',
    'APRIL',
    'MAJ',
    'JUN',
    'JUL',
    'AVGUST',
    'SEPTEMBAR',
    'OKTOBAR',
    'NOVEMBAR',
    'DECEMBAR'
];

function money(value) {
    return Number(value || 0).toLocaleString('sr-RS', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatMonthlyReport(report) {
    const lines = [
        `📊 MJESEČNI IZVJEŠTAJ — ${MONTH_NAMES[report.month - 1]} ${report.year}`,
        ''
    ];

    lines.push('💰 PRIHODI / RASHODI');

    let hasMoney = false;

    for (const [currency, stats] of Object.entries(report.currencyStats)) {
        if (stats.income === 0 && stats.expense === 0) {
            continue;
        }

        hasMoney = true;

        lines.push(
            `${currency}: +${money(stats.income)} / -${money(stats.expense)} / net ${money(stats.income - stats.expense)}`
        );
    }

    if (!hasMoney) {
        lines.push('Nema evidentiranih prihoda ni rashoda.');
    }

    lines.push('');
    lines.push('🏆 NAJVEĆE TRANSAKCIJE');

    let hasBiggest = false;

    for (const [currency, stats] of Object.entries(report.currencyStats)) {
        if (stats.biggestIncome) {
            hasBiggest = true;
            lines.push(
                `🟢 ${currency} prihod: ${money(stats.biggestIncome.amount)} — ${stats.biggestIncome.description}`
            );
        }

        if (stats.biggestExpense) {
            hasBiggest = true;
            lines.push(
                `🔴 ${currency} rashod: ${money(stats.biggestExpense.amount)} — ${stats.biggestExpense.description}`
            );
        }
    }

    if (!hasBiggest) {
        lines.push('Nema transakcija za poređenje.');
    }

    lines.push('');
    lines.push('💼 DNEVNICE');
    lines.push(`Radnih dana: ${report.workDays}`);

    let dailyWageExists = false;

    for (const [currency, stats] of Object.entries(report.currencyStats)) {
        if (stats.dailyWage > 0) {
            dailyWageExists = true;
            lines.push(
                `${currency}: ${money(stats.dailyWage)}`
            );
        }
    }

    if (!dailyWageExists) {
        lines.push('Nema označenih dnevnica.');
    }

    if (report.workDescriptions.length > 0) {
        lines.push('Šta si radio:');

        for (const item of report.workDescriptions.slice(0, 8)) {
            lines.push(
                `• ${item.description} (${item.count}x)`
            );
        }
    }

    lines.push('');
    lines.push('🏷 RASHODI PO KATEGORIJI');

    let hasCategories = false;

    for (const [currency, stats] of Object.entries(report.currencyStats)) {
        const categories = Object.entries(stats.categories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        if (categories.length === 0) {
            continue;
        }

        hasCategories = true;
        lines.push(`${currency}:`);

        for (const [category, amount] of categories) {
            lines.push(`• ${category}: ${money(amount)}`);
        }
    }

    if (!hasCategories) {
        lines.push('Nema evidentiranih kategorija rashoda.');
    }

    lines.push('');
    lines.push('💱 MJENJAČNICA');

    if (report.exchanges.length === 0) {
        lines.push('Nema konverzija valuta.');
    } else {
        lines.push(`Broj konverzija: ${report.exchanges.length}`);

        for (const exchange of report.exchanges.slice(0, 8)) {
            const rateText = exchange.exchangeRate
                ? ` | kurs ${money(exchange.exchangeRate)}`
                : '';

            lines.push(
                `• ${money(exchange.fromAmount)} ${exchange.fromCurrency} → ${money(exchange.toAmount)} ${exchange.toCurrency}${rateText}`
            );
        }
    }

    lines.push('');
    lines.push(`🧾 Evidentirano transakcija: ${report.transactionCount}`);

    if (!dailyWageExists) {
        lines.push('');
        lines.push(
            'Savjet: za praćenje radnih dana upiši npr. "Dnevnica 4000 rsd BalkanBet".'
        );
    }

    return lines.join('\n');
}

module.exports = {
    TIME_ZONE,
    getMonthlyReport,
    formatMonthlyReport,
    getCurrentYearMonth,
    getPreviousYearMonth
};
