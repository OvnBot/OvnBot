// Importer les modules nécessaires
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config(); // Charger les variables d'environnement

// Créer une nouvelle instance du client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Nécessaire pour certaines logs
        GatewayIntentBits.GuildVoiceStates, // Nécessaire pour la musique
    ]
});

// Gérer les commandes
client.commands = new Collection();
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		// Définir une nouvelle entrée dans la Collection avec la clé comme nom de commande et la valeur comme module exporté
		if ('data' in command && 'execute' in command) {
			client.commands.set(command.data.name, command);
		} else {
			console.log(`[AVERTISSEMENT] La commande à ${filePath} n'a pas les propriétés "data" ou "execute" requises.`);
		}
	}
}

// Gérer les événements
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// Se connecter à Discord avec le token du client
client.login(process.env.DISCORD_TOKEN);
