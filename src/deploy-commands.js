const { REST, Routes } = require('discord.js');
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const commands = [];
// Récupérer tous les dossiers de commandes du répertoire des commandes
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	// Récupérer tous les fichiers de commandes du répertoire des commandes
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	// Récupérer la sortie SlashCommandBuilder#toJSON() des données de chaque commande pour le déploiement
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			console.log(`[AVERTISSEMENT] La commande à ${filePath} n'a pas les propriétés "data" ou "execute" requises.`);
		}
	}
}

// Construire et préparer une instance du module REST
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

// et déployer vos commandes !
(async () => {
	try {
		console.log(`Début du rafraîchissement de ${commands.length} commandes d'application (/).`);

		// La méthode put est utilisée pour rafraîchir complètement toutes les commandes dans la guilde avec l'ensemble actuel
		const data = await rest.put(
			Routes.applicationCommands(process.env.CLIENT_ID), // Déploie globalement
			{ body: commands },
		);

		console.log(`Rafraîchissement réussi de ${data.length} commandes d'application (/).`);
	} catch (error) {
		// Et bien sûr, assurez-vous de gérer les erreurs !
		console.error(error);
	}
})();