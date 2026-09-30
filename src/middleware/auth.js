require('dotenv').config();

// Pretvara tvoj ID iz .env u broj kako bi mogao da se uporedi
const allowedUsers = process.env.ALLOWED_USER_IDS.split(',').map(id => parseInt(id.trim()));

const authMiddleware = (ctx, next) => {
    // Proverava da li ID pošiljaoca postoji na beloj listi
    if (ctx.from && allowedUsers.includes(ctx.from.id)) {
        return next(); // Pusti ga dalje
    } else {
        console.log(`[AUTH BLOKADA] Neko pokušava da pristupi botu. ID: ${ctx.from?.id}`);
        // Ne odgovaramo ništa da ne bi znali da bot postoji
    }
};

module.exports = authMiddleware;