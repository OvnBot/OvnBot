// mon-super-bot-stream/index.js

const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, VoiceConnectionStatus } = require('@discordjs/voice');
const express = require('express');
const basicAuth = require('express-basic-auth');
const NodeMediaServer = require('node-media-server');
const crypto = require('crypto');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

const config = require('./config');

// --- 1. INITIALISATION DU BOT DISCORD ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once('ready', () => {
    console.log(`✅ Bot Discord connecté en tant que ${client.user.tag}`);
});

client.login(config.discord.token);

// --- 2. INITIALISATION DU SERVEUR WEB (DASHBOARD) ---
const app = express();
app.use(express.json());

// Sécurisation du dashboard avec un mot de passe
app.use(basicAuth({
    users: { 'admin': config.dashboard.password }, // L'utilisateur est 'admin'
    challenge: true,
    realm: 'Dashboard de Stream',
}));

// Servir les fichiers statiques (notre index.html)
app.use(express.static('public'));

// --- 3. INITIALISATION DU SERVEUR RTMP ---
const nmsConfig = {
    rtmp: {
        port: config.rtmp.port,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60,
    },
    http: {
        port: 8000, // Port pour l'accès direct au flux (ex: pour VLC)
        allow_origin: '*',
    },
    auth: {
        publish: true,
        secret: config.rtmp.secret,
    },
};

const nms = new NodeMediaServer(nmsConfig);

// Stockage des streams actifs
const activeStreams = {};

nms.on('prePublish', (id, StreamPath, args) => {
    console.log(`[RTMP] Tentative de publication sur ${StreamPath}`);
    const streamName = StreamPath.split('/').pop();
    const { sign } = args;
    if (!sign) {
        console.log(`[RTMP] Connexion refusée pour ${streamName}: Pas de signature.`);
        return nms.getSession(id).reject();
    }
    const [timestamp, hash] = sign.split('-');
    const expectedHash = crypto.createHash('md5').update(`${StreamPath}-${timestamp}-${config.rtmp.secret}`).digest('hex');
    if (hash !== expectedHash || Math.floor(Date.now() / 1000) - parseInt(timestamp) > 3600) { // Clé valide 1h
        console.log(`[RTMP] Connexion refusée pour ${streamName}: Signature invalide ou expirée.`);
        return nms.getSession(id).reject();
    }
    console.log(`[RTMP] Connexion acceptée pour ${streamName}.`);
    activeStreams[streamName] = { id, startTime: new Date() };
});

nms.on('donePublish', (id, StreamPath, args) => {
    console.log(`[RTMP] Stream ${StreamPath} terminé.`);
    const streamName = StreamPath.split('/').pop();
    delete activeStreams[streamName];
});

// --- 4. API POUR LE DASHBOARD ---

app.get('/api/generate-key/:streamName', (req, res) => {
    const { streamName } = req.params;
    if (!/^[a-zA-Z0-9_-]+$/.test(streamName)) {
        return res.status(400).json({ error: "Nom de stream invalide. Utilisez uniquement des caractères alphanumériques, _ et -." });
    }
    const streamPath = `/live/${streamName}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const hash = crypto.createHash('md5').update(`${streamPath}-${timestamp}-${config.rtmp.secret}`).digest('hex');
    const streamKey = `${streamName}?sign=${timestamp}-${hash}`;
    res.json({ streamKey });
});

app.get('/api/active-streams', (req, res) => {
    res.json(activeStreams);
});

app.post('/api/start-stream', async (req, res) => {
    const { streamName, guildId, channelId } = req.body;

    if (!activeStreams[streamName]) {
        return res.status(404).json({ message: "Ce stream n'est pas actif." });
    }

    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isVoiceBased()) {
            return res.status(400).json({ message: "L'ID du salon vocal est invalide." });
        }

        const streamUrl = `http://localhost:8000/live/${streamName}.flv`;

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        const ffmpegProcess = spawn(ffmpeg, [
            '-re',
            '-i', streamUrl,
            '-analyzeduration', '0',
            '-loglevel', '0',
            '-f', 'opus',
            '-ar', '48000',
            '-ac', '2',
            'pipe:1',
        ]);

        const audioPlayer = createAudioPlayer();
        const audioResource = createAudioResource(ffmpegProcess.stdout, {
            inputType: StreamType.OggOpus,
        });

        audioPlayer.play(audioResource);
        connection.subscribe(audioPlayer);

        // Gérer la déconnexion propre
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log(`[Bot] Déconnecté du salon, nettoyage...`);
            ffmpegProcess.kill();
            connection.destroy();
        });
        audioPlayer.on('stateChange', (oldState, newState) => {
            if (newState.status === 'idle') {
                console.log(`[Bot] Le stream audio est terminé, déconnexion.`);
                if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                    connection.destroy();
                }
            }
        });

        res.json({ message: `Diffusion de l'audio de "${streamName}" démarrée dans le salon "${channel.name}" !` });

    } catch (error) {
        console.error("[Bot] Erreur lors du démarrage du stream:", error);
        res.status(500).json({ message: "Une erreur est survenue lors de la connexion au salon vocal." });
    }
});

// --- 5. DÉMARRAGE DE TOUS LES SERVEURS ---
app.listen(config.dashboard.port, () => {
    console.log(`✅ Dashboard démarré sur http://localhost:${config.dashboard.port}`);
    console.log(`   Utilisateur: admin, Mot de passe: ${config.dashboard.password}`);
});

nms.run();
console.log(`✅ Serveur RTMP démarré sur rtmp://localhost:${config.rtmp.port}/live`);
