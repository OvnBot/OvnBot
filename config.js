// mon-super-bot-stream/config.js

require('dotenv').config();

// Génère une clé secrète aléatoire si elle n'est pas définie dans le fichier .env
const RTMP_SECRET = process.env.RTMP_SECRET || require('crypto').randomBytes(16).toString('hex');

module.exports = {
    // Configuration Discord
    discord: {
        token: process.env.DISCORD_TOKEN,
    },
    // Configuration du serveur web/dashboard
    dashboard: {
        port: process.env.DASHBOARD_PORT || 3000,
        password: process.env.DASHBOARD_PASSWORD || 'admin', // Mot de passe par défaut si non défini
    },
    // Configuration du serveur RTMP
    rtmp: {
        port: 1935,
        secret: RTMP_SECRET,
    },
};
