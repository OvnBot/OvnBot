const { Events, ChannelType, PermissionsBitField, EmbedBuilder } = require('discord.js');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isChatInputCommand()) {
			const command = interaction.client.commands.get(interaction.commandName);

			if (!command) {
				console.error(`Aucune commande correspondant à ${interaction.commandName} n'a été trouvée.`);
				return;
			}

			try {
				await command.execute(interaction);
			} catch (error) {
				console.error(error);
				if (interaction.replied || interaction.deferred) {
					await interaction.followUp({ content: 'Une erreur s\'est produite lors de l\'exécution de cette commande !', ephemeral: true });
				} else {
					await interaction.reply({ content: 'Une erreur s\'est produite lors de l\'exécution de cette commande !', ephemeral: true });
				}
			}
		} else if (interaction.isButton()) {
            // GESTION DES BOUTONS
            const customId = interaction.customId;

            // --- Bouton pour accepter le règlement ---
            if (customId.startsWith('accept_rules_')) {
                const roleId = customId.split('_')[2];
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) {
                    return interaction.reply({ content: 'Le rôle associé à ce bouton n\'existe plus.', ephemeral: true });
                }
                try {
                    await interaction.member.roles.add(role);
                    await interaction.reply({ content: `Vous avez accepté le règlement et reçu le rôle ${role.name} !`, ephemeral: true });
                } catch (error) {
                    console.error(error);
                    await interaction.reply({ content: 'Je n\'ai pas la permission de vous donner ce rôle.', ephemeral: true });
                }
            }

            // --- Bouton pour créer un ticket ---
            if (customId.startsWith('create_ticket_')) {
                const staffRoleId = customId.split('_')[2];
                await interaction.deferReply({ ephemeral: true });

                const ticketChannel = await interaction.guild.channels.create({
                    name: `ticket-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: interaction.channel.parent, // Place le ticket dans la même catégorie
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: staffRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                        { id: interaction.client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    ],
                });

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle(`Ticket de ${interaction.user.username}`)
                    .setDescription('Bonjour ! Décrivez votre problème ici. Un membre du staff va bientôt vous répondre.');

                await ticketChannel.send({ content: `<@${interaction.user.id}> <@&${staffRoleId}>`, embeds: [embed] });
                await interaction.editReply({ content: `Votre ticket a été créé : ${ticketChannel}` });
            }
        }
	},
};