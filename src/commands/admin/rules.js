const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rules')
        .setDescription('Envoie le règlement avec un bouton d\'acceptation.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Le rôle à donner après acceptation.')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Le salon où envoyer le règlement.')
                .setRequired(true)),
    async execute(interaction) {
        const role = interaction.options.getRole('role');
        const channel = interaction.options.getChannel('channel');

        const embed = new EmbedBuilder()
            .setTitle('📜 Règlement du Serveur')
            .setColor('#ffcc00')
            .setDescription('1. Soyez respectueux.\n2. Pas de spam ou de publicité non sollicitée.\n3. Le contenu NSFW est strictement interdit.\n4. Suivez les Termes de Service de Discord.\n\n**Cliquez sur le bouton pour accepter le règlement et accéder au reste du serveur.**');

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_rules_${role.id}`)
                    .setLabel('J\'accepte le règlement')
                    .setStyle(ButtonStyle.Success),
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `Le règlement a été envoyé dans ${channel}.`, ephemeral: true });
    },
};