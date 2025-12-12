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

        // NOTE: Vous devez sauvegarder `role.id` dans une base de données
        // associée à `interaction.guild.id`.
        // Exemple: db.set(`autorole_${interaction.guild.id}`, role.id);

        await interaction.reply({ content: `Le rôle ${role.name} sera maintenant donné aux nouveaux membres (configuration à sauvegarder).`, ephemeral: true });
    },
};