const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Rend un membre silencieux pour une durée déterminée (timeout).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.MuteMembers)
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('Le membre à rendre silencieux.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('duree')
                .setDescription('La durée du mute (ex: 10m, 1h, 1d).')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du mute.')
                .setRequired(false)),
    async execute(interaction) {
        const target = interaction.options.getMember('utilisateur');
        const durationString = interaction.options.getString('duree');
        const reason = interaction.options.getString('raison') || 'Aucune raison fournie.';

        if (!target) {
            return interaction.reply({ content: 'Utilisateur non trouvé.', ephemeral: true });
        }

        if (target.id === interaction.user.id) {
            return interaction.reply({ content: 'Vous ne pouvez pas vous rendre silencieux vous-même.', ephemeral: true });
        }

        if (target.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'Vous ne pouvez pas rendre un administrateur silencieux.', ephemeral: true });
        }

        const durationMs = ms(durationString);
        if (!durationMs || durationMs <= 0) {
            return interaction.reply({ content: 'Veuillez fournir une durée valide (ex: 10m, 1h, 1d).', ephemeral: true });
        }

        try {
            await target.timeout(durationMs, reason);
            await interaction.reply({ content: `${target.user.tag} a été rendu silencieux pour ${durationString}. Raison : ${reason}`, ephemeral: true });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Une erreur est survenue. Je n\'ai peut-être pas les permissions pour rendre cet utilisateur silencieux.', ephemeral: true });
        }
    },
};