const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Bannit un membre du serveur.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .addUserOption(option =>
            option.setName('target')
                .setDescription('Le membre à bannir.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('La raison du bannissement.')),
	async execute(interaction) {
		const target = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') ?? 'Aucune raison fournie';

        // Vérifications
        if (!target) {
            return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
        }
        if (target.id === interaction.user.id) {
            return interaction.reply({ content: 'Vous ne pouvez pas vous bannir vous-même.', ephemeral: true });
        }
        if (!target.bannable) {
            return interaction.reply({ content: 'Je не peux pas bannir ce membre. Il a peut-être un rôle supérieur au mien.', ephemeral: true });
        }

        // Création de l'embed
        const banEmbed = new EmbedBuilder()
            .setColor('#FF0000') // Rouge
            .setTitle('Membre Banni')
            .setThumbnail(target.user.displayAvatarURL())
            .addFields(
                { name: 'Membre', value: `${target.user.tag} (${target.id})`, inline: false },
                { name: 'Modérateur', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                { name: 'Raison', value: reason, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `Serveur: ${interaction.guild.name}` });

        try {
            await target.ban({ reason: reason });
            await interaction.reply({ embeds: [banEmbed] });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'Une erreur est survenue lors du bannissement du membre.', ephemeral: true });
        }
	},
};