require('dotenv').config();

const http = require('http');
const bot = require('./bot');

const {
    startMonthlyReportScheduler
} = require('./services/monthlyReportScheduler');

const PORT =
    Number(process.env.PORT) || 3000;

let monthlyReportTask = null;

const server =
    http.createServer((req, res) => {
        if (req.url === '/health') {
            res.writeHead(200, {
                'Content-Type':
                    'application/json'
            });

            return res.end(
                JSON.stringify({
                    ok: true,
                    service:
                        'money-manager-bot'
                })
            );
        }

        res.writeHead(200, {
            'Content-Type':
                'text/plain; charset=utf-8'
        });

        return res.end(
            'Money Manager bot je online.'
        );
    });

server.listen(PORT, () => {
    console.log(
        `Health server radi na portu ${PORT}.`
    );
});

async function startBot() {
    try {
        const me =
            await bot.telegram.getMe();

        console.log(
            `🤖 Telegram bot autentifikovan kao @${me.username || me.id}.`
        );

        monthlyReportTask =
            startMonthlyReportScheduler(bot);

        bot.launch().catch((error) => {
            console.error(
                'Telegram polling je prekinut:',
                error
            );

            process.exit(1);
        });

        console.log(
            '🤖 Telegram polling je pokrenut.'
        );
    } catch (error) {
        console.error(
            'Bot se nije mogao pokrenuti:',
            error
        );

        process.exit(1);
    }
}

startBot();

async function shutdown(signal) {
    console.log(
        `Primljen ${signal}. Gasim bot...`
    );

    try {
        if (monthlyReportTask) {
            monthlyReportTask.stop();
        }

        bot.stop(signal);
    } finally {
        server.close(() => {
            process.exit(0);
        });
    }
}

process.once(
    'SIGINT',
    () => shutdown('SIGINT')
);

process.once(
    'SIGTERM',
    () => shutdown('SIGTERM')
);
