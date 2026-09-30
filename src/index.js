require('dotenv').config();

const http = require('http');
const bot = require('./bot');

const {
    startMonthlyReportScheduler
} = require('./services/monthlyReportScheduler');

const PORT =
    Number(process.env.PORT) || 3000;

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

bot.launch()
    .then(() => {
        console.log(
            '🤖 Telegram bot je uspješno pokrenut.'
        );

        startMonthlyReportScheduler(bot);
    })
    .catch((error) => {
        console.error(
            'Bot se nije mogao pokrenuti:',
            error
        );

        process.exit(1);
    });

async function shutdown(signal) {
    console.log(
        `Primljen ${signal}. Gasim bot...`
    );

    try {
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
