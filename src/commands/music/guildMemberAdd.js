const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // NOTE: Vous devez récupérer l'ID du rôle depuis votre base de données
        // const roleId = await db.get(`autorole_${member.guild.id}`);
        const roleId = null; // Remplacer par la valeur de la BDD

        if (!roleId) return;

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