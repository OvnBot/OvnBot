const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const play = require('play-dl');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Joue une musique depuis un lien YouTube.')
        .addStringOption(option =>
            option.setName('url')
                .setDescription('Le lien de la vidéo YouTube')
                .setRequired(true)),
    async execute(interaction) {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: 'Vous devez être dans un salon vocal pour utiliser cette commande !', ephemeral: true });
        }

        const url = interaction.options.getString('url');
        await interaction.deferReply();

        try {
            // Validation de l'URL
            const yt_info = await play.video_info(url);
            const stream = await play.stream(url);

            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            const player = createAudioPlayer();
            const resource = createAudioResource(stream.stream, { inputType: stream.type });

            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                connection.destroy();
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`▶️ Lancement de la lecture`)
                .setDescription(`${yt_info.video_details.title}`)
                .setThumbnail(yt_info.video_details.thumbnails[0].url);

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: 'Erreur lors de la lecture de la vidéo. Le lien est-il valide ?', ephemeral: true });
        }
    },
};