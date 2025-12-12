import discord
from discord.commands import SlashCommandGroup, Option
from discord.ext import commands
import yt_dlp

# Options pour YTDL pour optimiser la recherche et le streaming
YTDL_OPTIONS = {
    'format': 'bestaudio/best',
    'noplaylist': True,
    'quiet': True,
    'postprocessors': [{
        'key': 'FFmpegExtractAudio',
        'preferredcodec': 'mp3',
        'preferredquality': '192',
    }],
}

FFMPEG_OPTIONS = {
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
    'options': '-vn',
}

class Music(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    @commands.slash_command(name="play", description="Joue une musique depuis un lien YouTube.")
    async def play(self, ctx: discord.ApplicationContext, url: Option(str, "Le lien de la vidéo YouTube.")):
        if not ctx.author.voice:
            return await ctx.respond("Vous devez être dans un salon vocal pour utiliser cette commande !", ephemeral=True)

        voice_channel = ctx.author.voice.channel
        
        # Si le bot est déjà dans un salon vocal, on s'y déplace
        if ctx.voice_client:
            await ctx.voice_client.move_to(voice_channel)
        else:
            await voice_channel.connect()

        await ctx.defer()

        with yt_dlp.YoutubeDL(YTDL_OPTIONS) as ydl:
            info = ydl.extract_info(url, download=False)
            audio_url = info['url']
            title = info.get('title', 'Titre inconnu')
            thumbnail = info.get('thumbnail', None)

        source = await discord.FFmpegOpusAudio.from_probe(audio_url, **FFMPEG_OPTIONS)
        ctx.voice_client.play(source)

        embed = discord.Embed(title="▶️ Lancement de la lecture", description=title, color=discord.Color.red())
        if thumbnail:
            embed.set_thumbnail(url=thumbnail)
        await ctx.followup.send(embed=embed)

def setup(bot):
    bot.add_cog(Music(bot))