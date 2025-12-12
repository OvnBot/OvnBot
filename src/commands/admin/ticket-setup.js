const { SlashCommandBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket-setup')
        .setDescription('Configure le système de tickets.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const guild = interaction.guild;

        await interaction.deferReply({ ephemeral: true });

        // 1. Créer le rôle pour le staff (s'il n'existe pas)
        let staffRole = guild.roles.cache.find(r => r.name === 'Support Ticket');
        if (!staffRole) {
            try {
                staffRole = await guild.roles.create({
                    name: 'Support Ticket',
                    color: '#0099ff',
                    reason: 'Rôle pour la gestion des tickets',
                });
            } catch (error) {
                console.error(error);
                return interaction.editReply({ content: 'Je n\'ai pas la permission de créer des rôles.' });
            }
        }

        // 2. Créer la catégorie pour les tickets
        const category = await guild.channels.create({
            name: 'TICKETS',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                {
                    id: guild.id, // @everyone
                    deny: [PermissionsBitField.Flags.ViewChannel],
                },
                {
                    id: staffRole.id,
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                },
                 {
                    id: interaction.client.user.id, // Le bot
                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
                },
            ],
        });

        // 3. Créer le salon pour ouvrir un ticket
        const channel = await guild.channels.create({
            name: 'ouvrir-un-ticket',
            type: ChannelType.GuildText,
            parent: category.id,
            topic: 'Cliquez sur le bouton pour ouvrir un ticket de support.',
        });

        // 4. Envoyer l'embed avec le bouton
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('Support Technique')
            .setDescription('Cliquez sur le bouton ci-dessous pour créer un ticket.\nLe staff vous répondra dès que possible.')
            .setFooter({ text: guild.name, iconURL: guild.iconURL() });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`create_ticket_${staffRole.id}`) // On inclut l'ID du rôle staff
                    .setLabel('Créer un Ticket')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎟️'),
            );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: 'Le système de tickets a été configuré avec succès !' });
    },
};