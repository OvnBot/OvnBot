const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Configure le rôle à donner aux nouveaux membres.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Le rôle à assigner automatiquement.')
                .setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole('role');

        // Sauvegarde l'ID du rôle dans la base de données, associé à l'ID du serveur.
        // La clé est l'ID du serveur, la valeur est un objet de paramètres.
        interaction.client.settings.set(interaction.guild.id, role.id, "autorole");

        await interaction.reply({ content: `Le rôle ${role.name} sera maintenant donné automatiquement aux nouveaux membres.`, ephemeral: true });
    },
};