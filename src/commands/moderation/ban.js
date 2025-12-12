const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ban')
		.setDescription('Bannit un membre du serveur.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers),
	async execute(interaction) {
		await interaction.reply({ content: 'Cette commande n\'est pas encore implémentée.', ephemeral: true });
	},
};