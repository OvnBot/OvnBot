const { SlashCommandBuilder, EmbedBuilder, version: djsVersion } = require('discord.js');
const os = require('os');

function formatUptime(uptime) {
    const seconds = Math.floor(uptime / 1000);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    let uptimeString = '';
    if (days > 0) uptimeString += `${days}j `;
    if (hours > 0) uptimeString += `${hours}h `;
    if (minutes > 0) uptimeString += `${minutes}m `;
    uptimeString += `${remainingSeconds}s`;

    return uptimeString.trim();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('botinfo')
        .setDescription('Affiche des informations détaillées sur le bot.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const client = interaction.client;
        const uptime = formatUptime(client.uptime);
        const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
        const totalMembers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: 'Uptime', value: uptime, inline: true },
                { name: 'Ping API', value: `${client.ws.ping}ms`, inline: true },
                { name: 'Mémoire', value: `${memoryUsage} MB`, inline: true },
                { name: 'Serveurs', value: `${client.guilds.cache.size}`, inline: true },
                { name: 'Utilisateurs', value: `${totalMembers}`, inline: true },
                { name: 'Commandes', value: `${client.commands.size}`, inline: true },
                { name: 'Node.js', value: process.version, inline: true },
                { name: 'Discord.js', value: `v${djsVersion}`, inline: true },
                { name: 'OS', value: `${os.platform()}`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `ID: ${client.user.id}` });

        await interaction.editReply({ embeds: [embed] });
    },
};