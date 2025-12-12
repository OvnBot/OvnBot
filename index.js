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

// Stockage de la diffusion en cours du bot (supporte une seule diffusion à la fois)
const currentBroadcast = {
    connection: null,
    player: null,
    ffmpegProcess: null,
    guildId: null,
    streamName: null,
};

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

    // Si une diffusion est déjà en cours, on l'arrête avant d'en lancer une nouvelle.
    if (currentBroadcast.connection) {
        console.log(`[Bot] Arrêt de la diffusion précédente sur le serveur ${currentBroadcast.guildId}`);
        currentBroadcast.connection.destroy();
        // Réinitialiser l'état
        Object.assign(currentBroadcast, { connection: null, player: null, ffmpegProcess: null, guildId: null, streamName: null });
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

        // Sauvegarder l'état de la diffusion en cours
        Object.assign(currentBroadcast, { connection, player: audioPlayer, ffmpegProcess, guildId, streamName });

        // Gérer la déconnexion propre
        connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log(`[Bot] Déconnecté du salon, nettoyage...`);
            if (currentBroadcast.ffmpegProcess) {
                currentBroadcast.ffmpegProcess.kill();
            }
            // Réinitialiser l'état
            Object.assign(currentBroadcast, { connection: null, player: null, ffmpegProcess: null, guildId: null, streamName: null });
        });

        audioPlayer.on('stateChange', (oldState, newState) => {
            if (newState.status === 'idle') {
                console.log(`[Bot] Le stream audio est terminé, déconnexion.`);
                if (currentBroadcast.connection && currentBroadcast.connection.state.status !== VoiceConnectionStatus.Destroyed) {
                    currentBroadcast.connection.destroy();
                }
            }
        });

        res.json({ message: `Diffusion de l'audio de "${streamName}" démarrée dans le salon "${channel.name}" !` });

    } catch (error) {
        console.error("[Bot] Erreur lors du démarrage du stream:", error);
        res.status(500).json({ message: "Une erreur est survenue lors de la connexion au salon vocal." });
    }
});

app.post('/api/stop-stream', (req, res) => {
    const { streamName } = req.body;

    if (!activeStreams[streamName]) {
        return res.status(404).json({ message: "Ce stream n'est pas actif." });
    }

    // 1. Arrêter la diffusion du bot si c'est le stream concerné
    if (currentBroadcast.streamName === streamName && currentBroadcast.connection) {
        console.log(`[API] Arrêt de la diffusion du bot pour le stream ${streamName}.`);
        currentBroadcast.connection.destroy();
    }

    // 2. Tuer la session RTMP pour forcer la déconnexion du streamer (OBS)
    try {
        const streamId = activeStreams[streamName].id;
        const session = nms.getSession(streamId);
        if (session) {
            console.log(`[API] Arrêt forcé de la session RTMP pour le stream ${streamName} (ID: ${streamId}).`);
            session.reject(); // ou session.kill()
        }
        res.json({ message: `Le stream "${streamName}" a été arrêté.` });
    } catch (error) {
        console.error(`[API] Erreur lors de l'arrêt du stream ${streamName}:`, error);
        res.status(500).json({ message: "Erreur lors de l'arrêt du stream." });
    }
});

// --- 5. DÉMARRAGE DE TOUS LES SERVEURS ---
app.listen(config.dashboard.port, () => {
    console.log(`✅ Dashboard démarré sur http://localhost:${config.dashboard.port}`);
    console.log(`   Utilisateur: admin, Mot de passe: ${config.dashboard.password}`);
});

nms.run();
console.log(`✅ Serveur RTMP démarré sur rtmp://localhost:${config.rtmp.port}/live`);
