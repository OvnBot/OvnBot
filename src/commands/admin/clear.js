const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprime un nombre spécifié de messages.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
        .addIntegerOption(option =>
            option.setName('nombre')
                .setDescription('Le nombre de messages à supprimer (entre 1 et 100).')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)),
    async execute(interaction) {
        const amount = interaction.options.getInteger('nombre');

        await interaction.deferReply({ ephemeral: true });

        try {
            const { size } = await interaction.channel.bulkDelete(amount, true);
            await interaction.editReply({ content: `J'ai supprimé ${size} message(s) avec succès.` });

            // Supprime le message de confirmation après 5 secondes
            setTimeout(() => interaction.deleteReply(), 5000);

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Une erreur est survenue lors de la suppression des messages. Je n\'ai peut-être pas les permissions nécessaires.' });
        }
    },
};