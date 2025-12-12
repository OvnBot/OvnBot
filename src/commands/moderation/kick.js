const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('kick')
		.setDescription('Expulse un membre du serveur.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.KickMembers),
	async execute(interaction) {
		await interaction.reply({ content: 'Cette commande n\'est pas encore implémentée.', ephemeral: true });
	},
};