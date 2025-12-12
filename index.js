// mon-super-bot-stream/index.js

// Charge explicitement la librairie de chiffrement pour @discordjs/voice
require('libsodium-wrappers');
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, VoiceConnectionStatus, getVoiceConnection, EndBehaviorType } = require('@discordjs/voice');
const express = require('express');
const basicAuth = require('express-basic-auth');
const NodeMediaServer = require('node-media-server');
const crypto = require('crypto');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const config = require('./config');

// --- 1. INITIALISATION DU BOT DISCORD ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Nécessaire pour lire le contenu des messages si vous ajoutez des commandes
    ],
});

// --- GESTION DE LA "BASE DE DONNÉES" JSON ---
const DB_PATH = './db.json';

client.once('ready', async () => {
    console.log(`✅ Bot Discord connecté en tant que ${client.user.tag}`);
    // Initialise la base de données si elle n'existe pas
    await fs.access(DB_PATH).catch(() => fs.writeFile(DB_PATH, JSON.stringify({ keys: [] }, null, 2)));

    await updateBotStatus();
    setInterval(updateBotStatus, 15000); // Met à jour le statut toutes les 15 secondes
    await connectToVoiceChannel();
});

// Stockage des streams actifs
const activeStreams = {};

// Stockage de la diffusion en cours du bot (supporte une seule diffusion à la fois)
const currentBroadcast = {
    connection: null,
    player: null,
    ffmpegProcess: null,
    guildId: null,
    streamNames: [], // Peut maintenant contenir plusieurs noms de stream
};

async function updateBotStatus() {
    const streamCount = Object.keys(activeStreams).length;
    const broadcastingCount = currentBroadcast.streamNames.length;

    let status = `En attente...`;
    if (broadcastingCount > 0) {
        status = `Diffuse ${broadcastingCount} stream(s)`;
    } else if (streamCount > 0) {
        status = `Surveille ${streamCount} stream(s)`;
    }

    if (client.user) client.user.setActivity(status, { type: ActivityType.Listening });
}

async function connectToVoiceChannel() {
    const { guildId, channelId } = config.discord;
    if (!guildId || !channelId) {
        console.error("[Bot] L'ID du serveur ou du salon n'est pas configuré. Le bot ne peut pas se connecter.");
        return;
    }
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel || !channel.isVoiceBased()) {
            console.error("[Bot] L'ID du salon vocal configuré est invalide.");
            return;
        }

        console.log(`[Bot] Connexion au salon vocal: ${channel.name}`);
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guildId,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
        });

        currentBroadcast.connection = connection;
        currentBroadcast.guildId = guildId;

        connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
            console.warn(`[Bot] Déconnecté du salon vocal ! Tentative de reconnexion dans 5 secondes...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connectToVoiceChannel();
            }
        });

        connection.on(VoiceConnectionStatus.Destroyed, () => {
            console.log(`[Bot] Connexion vocale détruite.`);
            if (currentBroadcast.ffmpegProcess) {
                currentBroadcast.ffmpegProcess.kill();
            }
            // Réinitialiser l'état et mettre à jour le statut
            Object.assign(currentBroadcast, { connection: null, player: null, ffmpegProcess: null, guildId: null, streamNames: [] });
            updateBotStatus();
        });
    } catch (error) {
        console.error(`[Bot] Erreur lors de la connexion au salon vocal:`, error);
    }
}


async function start() {
    // --- 2. INITIALISATION DU SERVEUR WEB (DASHBOARD) ---
    const app = express();
    app.use(express.json());

    // --- API pour l'authentification RTMP ---
    app.post('/auth/publish', async (req, res) => {
        // OBS envoie la clé de stream dans le champ 'name' du body
        const streamKey = req.body.name;
        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            const db = JSON.parse(data);
            // OBS envoie la clé secrète. On cherche à quelle clé nommée elle correspond.
            const keyData = db.keys.find(k => k.key === streamKey);
    
            if (keyData && keyData.status === 'active') {
                // On autorise la publication ET on renomme le stream avec son vrai nom (ex: 'test')
                // pour que le reste de l'application utilise le nom et non la clé.
                return res.status(200).json({ name: keyData.name });
            }
        } catch (error) {
            console.error("[Auth] Erreur lors de la validation de la clé:", error);
        }
    
        // Si la clé n'est pas trouvée ou invalide, on rejette.
        return res.status(403).send('Unauthorized');
    });

    // --- 3. INITIALISATION DU SERVEUR RTMP ---
    const nmsConfig = {
        rtmp: { port: config.rtmp.port, host: '0.0.0.0', chunk_size: 60000, gop_cache: true, ping: 30, ping_timeout: 60 },
        http: { port: 8000, host: '0.0.0.0', allow_origin: '*' },
        auth: { api: true, secret: config.rtmp.secret },
    };
    const nms = new NodeMediaServer(nmsConfig);

    // --- Déplacement des listeners ici ---
    nms.on('postPublish', async (id, StreamPath, args) => {
        const streamName = StreamPath.split('/').pop();
        console.log(`[RTMP] Stream "${streamName}" publié avec succès. ID: ${id}`);
    
        // Annoncer le stream sur Discord
        let announcementMessage = null;
        if (config.discord.announcementChannelId) {
            try {
                const channel = await client.channels.fetch(config.discord.announcementChannelId);
                const embed = new EmbedBuilder()
                    .setColor('#f04747')
                    .setTitle(`🔴 ${streamName} est maintenant en direct !`)
                    .setDescription('Cliquez sur le bouton ci-dessous pour regarder le stream.')
                    .setTimestamp();
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Regarder le Stream').setStyle(ButtonStyle.Link).setURL(`http://82.65.62.132:${config.dashboard.port}/viewer.html?stream=${streamName}`)
                );
                announcementMessage = await channel.send({ embeds: [embed], components: [row] });
            } catch (e) {
                console.error("[Discord] Impossible d'envoyer le message d'annonce:", e);
            }
        }
    
        // On associe la session au VRAI nom du stream et on sauvegarde l'ID du message
        activeStreams[streamName] = { id, startTime: new Date(), announcementMessageId: announcementMessage?.id, hidden: false };
        updateBotStatus();
    });

    nms.on('donePublish', async (id, StreamPath, args) => {
        console.log(`[RTMP] Stream ${StreamPath} terminé.`);
        const streamName = StreamPath.split('/').pop();

        if (activeStreams[streamName]) {
            const streamData = activeStreams[streamName];
            console.log(`[RTMP] Nettoyage du stream actif: ${streamName}`);

            // Mettre à jour le message d'annonce pour indiquer la fin du stream
            if (streamData.announcementMessageId && config.discord.announcementChannelId) {
                try {
                    const channel = await client.channels.fetch(config.discord.announcementChannelId);
                    const message = await channel.messages.fetch(streamData.announcementMessageId);
                    const oldEmbed = message.embeds[0];
                    const newEmbed = new EmbedBuilder(oldEmbed.data)
                        .setColor('#99aab5')
                        .setTitle(`⚫ ${streamName} est hors ligne.`)
                        .setDescription('Le stream est terminé.');
                    await message.edit({ embeds: [newEmbed], components: [] });
                } catch (e) { console.error("[Discord] Impossible de mettre à jour le message d'annonce:", e); }
            }

            delete activeStreams[streamName];
        }
        updateBotStatus();
    });

    // --- 4. API POUR LE DASHBOARD ---

    // Endpoint public pour la page spectateur
    app.get('/api/public/streams', (req, res) => {
        res.json(activeStreams);
    });

    // Création du middleware d'authentification pour l'admin
    const adminAuth = basicAuth({
        users: { 'admin': config.dashboard.password },
        challenge: true,
        realm: 'Dashboard de Stream',
    });

    // Route pour la page d'administration, protégée par mot de passe
    app.get('/admin', adminAuth, (req, res) => {
        res.sendFile(__dirname + '/public/index.html');
    });

    // Sécurisation de toutes les API d'administration
    app.use('/api', adminAuth);

    // API pour masquer/démasquer un stream
    app.patch('/api/streams/:streamName/hide', (req, res) => {
        const { streamName } = req.params;
        const { hidden } = req.body;

        if (activeStreams[streamName]) {
            const wasHidden = activeStreams[streamName].hidden;
            activeStreams[streamName].hidden = !!hidden; // Assure que c'est un booléen
            console.log(`[API] Stream "${streamName}" mis à jour: hidden=${hidden}`);

            // Si le statut de masquage change et que ce stream faisait partie de la diffusion, on force une mise à jour.
            if (wasHidden !== hidden && currentBroadcast.streamNames.includes(streamName)) {
                console.log(`[API] Le statut de masquage a changé pour un stream en cours de diffusion. Redémarrage du mixage audio.`);
                // On relance la diffusion avec la liste actuelle des streams non masqués.
                const streamsToBroadcast = currentBroadcast.streamNames.filter(name => activeStreams[name] && !activeStreams[name].hidden);
                
                // Utilise une fonction interne pour éviter de dupliquer le code
                broadcastStreams(streamsToBroadcast);
            }

            res.status(200).json({ message: `Stream ${streamName} mis à jour.` });
        } else {
            res.status(404).json({ message: 'Stream non trouvé.' });
        }
    });


    // Servir les fichiers statiques (index.html, viewer.html)
    app.use(express.static('public'));

    // La page d'accueil est maintenant la visionneuse publique
    app.get('/', (req, res) => {
        res.sendFile(__dirname + '/public/viewer.html');
    });

    // Fonction interne pour gérer la diffusion
    async function broadcastStreams(streamNames) {
        if (!Array.isArray(streamNames) || streamNames.length === 0) {
            // Si plus aucun stream n'est sélectionné, on arrête simplement la diffusion
            if (currentBroadcast.player) {
                currentBroadcast.player.stop();
            }
            return;
        }
    
        // Si une diffusion est déjà en cours, on l'arrête avant d'en lancer une nouvelle.
        if (currentBroadcast.connection) {
            console.log(`[Bot] Arrêt de la diffusion précédente sur le serveur ${currentBroadcast.guildId}`);
            currentBroadcast.player?.stop();
        }
    
        // Filtrer pour ne garder que les streams réellement actifs et non masqués
        const activeStreamsToBroadcast = streamNames.filter(name => activeStreams[name] && !activeStreams[name].hidden);
        if (activeStreamsToBroadcast.length === 0) {
            console.log("[Bot] Aucun stream valide à diffuser (tous masqués ou inactifs).");
            if (currentBroadcast.player) {
                currentBroadcast.player.stop();
            }
            return;
        }
    
        // Si le bot n'est pas connecté, on le connecte
        if (!currentBroadcast.connection || currentBroadcast.connection.state.status === VoiceConnectionStatus.Destroyed) {
            await connectToVoiceChannel();
        }
    
        // On attend un court instant pour s'assurer que la connexion est prête
        if (currentBroadcast.connection.state.status !== VoiceConnectionStatus.Ready) {
            console.log("[Bot] En attente de la connexion vocale...");
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    
        try {
            // Construction de la commande FFmpeg pour le mixage
            const ffmpegArgs = [];
            const filterInputs = [];
            activeStreamsToBroadcast.forEach((name, index) => {
                ffmpegArgs.push('-re', '-i', `http://localhost:8000/live/${name}.flv`);
                filterInputs.push(`[${index}:a]`);
            });
    
            const amixFilter = `${filterInputs.join('')}amix=inputs=${activeStreamsToBroadcast.length}:duration=first:dropout_transition=3`;
    
            ffmpegArgs.push(
                '-filter_complex', amixFilter,
                '-f', 'opus',      // Format de sortie pour Discord
                '-ar', '48000',     // Taux d'échantillonnage
                '-ac', '2',         // Stéréo
                '-loglevel', 'error', // Moins de logs
                'pipe:1'            // Sortie vers le pipe
            );
    
            const ffmpegProcess = spawn(ffmpeg, ffmpegArgs);
    
            const audioPlayer = createAudioPlayer();
            const audioResource = createAudioResource(ffmpegProcess.stdout, {
                // Using EndBehaviorType.OpusPacket will prevent the player from stopping prematurely
                inputType: StreamType.OggOpus,
            });
    
            audioPlayer.play(audioResource);
            currentBroadcast.connection.subscribe(audioPlayer);
            // Sauvegarder l'état de la diffusion en cours
            Object.assign(currentBroadcast, { player: audioPlayer, ffmpegProcess, streamNames: activeStreamsToBroadcast });
    
            // La gestion de la déconnexion est maintenant dans connectToVoiceChannel
    
            audioPlayer.on('stateChange', (oldState, newState) => {
                if (newState.status === 'idle') {
                    console.log(`[Bot] Le stream audio est terminé.`);
                    // On ne détruit plus la connexion, on arrête juste le lecteur
                    currentBroadcast.player?.stop();
                    currentBroadcast.ffmpegProcess?.kill();
                    Object.assign(currentBroadcast, { player: null, ffmpegProcess: null, streamNames: [] });
                    updateBotStatus();
                }
            });
    
            updateBotStatus();
            return { success: true, message: `Diffusion de ${activeStreamsToBroadcast.length} stream(s) démarrée !` };
    
        } catch (error) {
            console.error("[Bot] Erreur lors du démarrage du stream:", error);
            return { success: false, message: "Une erreur est survenue lors de la connexion au salon vocal." };
        }
    }

    app.post('/api/broadcast-streams', async (req, res) => {
        const { streamNames } = req.body;
        if (!Array.isArray(streamNames)) {
            return res.status(400).json({ message: "Format de requête invalide." });
        }
        const result = await broadcastStreams(streamNames);
        if (result?.success) {
            res.json({ message: result.message });
        } else if (result) {
            res.status(500).json({ message: result.message });
        }
    });
    
    app.post('/api/stop-broadcast', (req, res) => {
        // Arrête la diffusion en cours, mais ne déconnecte pas le bot
        if (currentBroadcast.player) {
            console.log(`[API] Arrêt de la diffusion du bot demandée.`);
            currentBroadcast.player.stop(); // Cela déclenchera l'événement 'idle' et le nettoyage
            res.json({ message: `Diffusion arrêtée.` });
        } else {
            res.status(404).json({ message: "Le bot n'est pas en train de diffuser." });
        }
    });
    
    app.post('/api/stop-stream', (req, res) => {
        const { streamName } = req.body;
    
        if (!activeStreams[streamName]) {
            return res.status(404).json({ message: "Ce stream n'est pas actif." });
        }
    
        // 1. Arrêter la diffusion du bot si le stream arrêté en faisait partie
        if (currentBroadcast.streamNames.includes(streamName) && currentBroadcast.player) {
            console.log(`[API] Arrêt de la diffusion car le stream ${streamName} a été stoppé.`);
            currentBroadcast.player.stop();
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

    app.get('/api/keys', async (req, res) => {
        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            res.json(JSON.parse(data).keys);
        } catch (error) {
            res.status(500).json({ message: "Erreur lors de la lecture des clés." });
        }
    });

    app.post('/api/keys', async (req, res) => {
        const { streamName } = req.body;
        if (!streamName || !/^[a-zA-Z0-9_-]+$/.test(streamName)) {
            return res.status(400).json({ error: "Nom de stream invalide." });
        }

        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            const db = JSON.parse(data);

            if (db.keys.some(k => k.name === streamName)) {
                return res.status(409).json({ error: "Ce nom de stream existe déjà." });
            }

            const newKey = {
                name: streamName,
                key: crypto.randomBytes(16).toString('hex'), // Génère une clé secrète robuste
                status: 'active'
            };

            db.keys.push(newKey);
            await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
            res.status(201).json(newKey);
        } catch (error) {
            res.status(500).json({ message: "Erreur lors de la création de la clé." });
        }
    });

    app.delete('/api/keys/:streamName', async (req, res) => {
        const { streamName } = req.params;

        // Si le stream est actif, on le coupe avant de supprimer la clé
        if (activeStreams[streamName]) {
            const streamId = activeStreams[streamName].id;
            const session = nms.getSession(streamId);
            if (session) {
                console.log(`[API] Déconnexion forcée du stream ${streamName} car sa clé a été supprimée.`);
                session.reject();
            }
        }

        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            const db = JSON.parse(data);
            db.keys = db.keys.filter(k => k.name !== streamName);
            await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));
            res.json({ message: `Clé ${streamName} supprimée.` });
        } catch (error) {
            res.status(500).json({ message: "Erreur lors de la suppression de la clé." });
        }
    });

    app.patch('/api/keys/:streamName', async (req, res) => {
        const { streamName } = req.params;
        const { status } = req.body;
        if (status !== 'active' && status !== 'suspended') {
            return res.status(400).json({ error: "Statut invalide." });
        }
        try {
            const data = await fs.readFile(DB_PATH, 'utf8');
            const db = JSON.parse(data);
            const keyToUpdate = db.keys.find(k => k.name === streamName);
            if (keyToUpdate) {
                keyToUpdate.status = status;
                await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2));

                // Si on suspend la clé et que le stream est actif, on le coupe
                if (status === 'suspended' && activeStreams[streamName]) {
                    const streamId = activeStreams[streamName].id;
                    const session = nms.getSession(streamId);
                    if (session) {
                        console.log(`[API] Déconnexion forcée du stream ${streamName} car sa clé a été suspendue.`);
                        session.reject();
                    }
                }

                res.json(keyToUpdate);
            } else {
                res.status(404).json({ message: "Clé non trouvée." });
            }
        } catch (error) {
            res.status(500).json({ message: "Erreur lors de la mise à jour de la clé." });
        }
    });

    app.get('/api/active-streams', (req, res) => {
        res.json(activeStreams);
    });

    // --- 5. DÉMARRAGE DE TOUS LES SERVEURS ---
    app.listen(config.dashboard.port, () => {
        console.log(`✅ Dashboard démarré sur http://localhost:${config.dashboard.port}`);
        console.log(`   Utilisateur: admin, Mot de passe: ${config.dashboard.password}`);
    });

    nms.run();
    console.log(`✅ Serveur RTMP démarré sur rtmp://localhost:${config.rtmp.port}/live`);

    // Démarrage du bot en dernier
    client.login(config.discord.token);
}

start().catch(error => {
    console.error("Erreur critique lors du démarrage de l'application:", error);
    process.exit(1);
});
