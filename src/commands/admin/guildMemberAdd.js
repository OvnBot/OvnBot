const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Récupère l'ID du rôle depuis la base de données pour ce serveur.
        const roleId = member.client.settings.get(member.guild.id, "autorole");

        if (!roleId) return; // Si aucun rôle n'est configuré, on ne fait rien.

        const role = member.guild.roles.cache.get(roleId);
        if (role) {
            try {
                await member.roles.add(role);
            } catch (error) {
                console.error(`Impossible d'ajouter l'autorole sur le serveur ${member.guild.name}:`, error);
            }
        }
    },
};