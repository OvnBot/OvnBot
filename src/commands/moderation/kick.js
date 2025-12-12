const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Expulse un membre du serveur.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Le membre à expulser.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('La raison de l\'expulsion.')),
	async execute(interaction) {
		const target = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') ?? 'Aucune raison fournie';

        // Vérifications
        if (!target) {
            return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
        }
        if (target.id === interaction.user.id) {
            return interaction.reply({ content: 'Vous ne pouvez pas vous expulser vous-même.', ephemeral: true });
        }
        if (!target.kickable) {
            return interaction.reply({ content: 'Je ne peux pas expulser ce membre. Il a peut-être un rôle supérieur au mien.', ephemeral: true });
        }

        // Création de l'embed
        const kickEmbed = new EmbedBuilder()
            .setColor('#FFA500') // Orange
            .setTitle('Membre Expulsé')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'Membre', value: `${target.user.tag} (${target.id})`, inline: false },
                { name: 'Modérateur', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                { name: 'Raison', value: reason, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `Serveur: ${interaction.guild.name}` });

        try {
            await target.kick(reason);
            await interaction.reply({ embeds: [kickEmbed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'expulsion du membre.', ephemeral: true });
        }
	},
};