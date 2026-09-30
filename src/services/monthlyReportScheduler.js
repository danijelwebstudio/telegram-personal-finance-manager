const cron = require('node-cron');

const {
    TIME_ZONE,
    getMonthlyReport,
    formatMonthlyReport,
    getPreviousYearMonth
} = require('./reportService');

function getAllowedUserIds() {
    return String(process.env.ALLOWED_USER_IDS || '')
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
}

function startMonthlyReportScheduler(bot) {
    const task = cron.schedule(
        '0 9 1 * *',
        async () => {
            try {
                const { year, month } =
                    getPreviousYearMonth(TIME_ZONE);

                const report =
                    await getMonthlyReport(year, month);

                const message =
                    formatMonthlyReport(report);

                const recipients =
                    getAllowedUserIds();

                for (const userId of recipients) {
                    await bot.telegram.sendMessage(
                        userId,
                        message
                    );
                }

                console.log(
                    `Mjesečni izvještaj poslan za ${month}/${year}.`
                );
            } catch (error) {
                console.error(
                    'Greška pri automatskom mjesečnom izvještaju:',
                    error
                );
            }
        },
        {
            timezone: TIME_ZONE
        }
    );

    console.log(
        `Mjesečni izvještaj zakazan: 1. u mjesecu u 09:00 (${TIME_ZONE}).`
    );

    return task;
}

module.exports = {
    startMonthlyReportScheduler
};
