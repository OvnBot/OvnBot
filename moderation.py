import discord
from discord.commands import SlashCommandGroup, Option
from discord.ext import commands
import datetime

class Moderation(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    mod = SlashCommandGroup("mod", "Commandes de modération.")

    @mod.command(name="kick", description="Expulse un membre du serveur.")
    @commands.has_permissions(kick_members=True)
    async def kick(self, ctx: discord.ApplicationContext,
                   target: Option(discord.Member, "Le membre à expulser."),
                   reason: Option(str, "La raison de l'expulsion.", required=False, default="Aucune raison fournie.")):
        
        if target.id == ctx.author.id:
            return await ctx.respond("Vous не pouvez pas vous expulser vous-même.", ephemeral=True)
        if not target.kickable:
            return await ctx.respond("Je ne peux pas expulser ce membre. Il a peut-être un rôle supérieur au mien.", ephemeral=True)

        embed = discord.Embed(
            title="Membre Expulsé",
            color=discord.Color.orange()
        )
        embed.set_thumbnail(url=target.display_avatar.url)
        embed.add_field(name="Membre", value=f"{target.mention} ({target.id})", inline=False)
        embed.add_field(name="Modérateur", value=f"{ctx.author.mention} ({ctx.author.id})", inline=False)
        embed.add_field(name="Raison", value=reason, inline=False)
        embed.set_footer(text=f"Serveur: {ctx.guild.name}")
        embed.timestamp = datetime.datetime.utcnow()

        await target.kick(reason=reason)
        await ctx.respond(embed=embed)

    @mod.command(name="ban", description="Bannit un membre du serveur.")
    @commands.has_permissions(ban_members=True)
    async def ban(self, ctx: discord.ApplicationContext,
                  target: Option(discord.Member, "Le membre à bannir."),
                  reason: Option(str, "La raison du bannissement.", required=False, default="Aucune raison fournie.")):

        if target.id == ctx.author.id:
            return await ctx.respond("Vous ne pouvez pas vous bannir vous-même.", ephemeral=True)
        if not target.bannable:
            return await ctx.respond("Je ne peux pas bannir ce membre. Il a peut-être un rôle supérieur au mien.", ephemeral=True)

        embed = discord.Embed(
            title="Membre Banni",
            color=discord.Color.red()
        )
        embed.set_thumbnail(url=target.display_avatar.url)
        embed.add_field(name="Membre", value=f"{target.mention} ({target.id})", inline=False)
        embed.add_field(name="Modérateur", value=f"{ctx.author.mention} ({ctx.author.id})", inline=False)
        embed.add_field(name="Raison", value=reason, inline=False)
        embed.set_footer(text=f"Serveur: {ctx.guild.name}")
        embed.timestamp = datetime.datetime.utcnow()

        await target.ban(reason=reason)
        await ctx.respond(embed=embed)

    @mod.command(name="mute", description="Rend un membre silencieux (timeout).")
    @commands.has_permissions(moderate_members=True)
    async def mute(self, ctx: discord.ApplicationContext,
                   target: Option(discord.Member, "Le membre à rendre silencieux."),
                   duration: Option(str, "La durée du mute (ex: 10m, 1h, 1d)."),
                   reason: Option(str, "La raison du mute.", required=False, default="Aucune raison fournie.")):

        # Simple parser pour la durée
        unit_map = {"s": 1, "m": 60, "h": 3600, "d": 86400}
        try:
            value = int(duration[:-1])
            unit = duration[-1].lower()
            delta_seconds = value * unit_map[unit]
            delta = datetime.timedelta(seconds=delta_seconds)
        except (ValueError, KeyError):
            return await ctx.respond("Durée invalide. Utilisez 's', 'm', 'h', ou 'd'.", ephemeral=True)

        if target.is_timed_out():
            return await ctx.respond("Ce membre est déjà réduit au silence.", ephemeral=True)

        await target.timeout_for(delta, reason=reason)
        await ctx.respond(f"{target.mention} a été rendu silencieux pour une durée de {duration}. Raison : {reason}")


def setup(bot):
    bot.add_cog(Moderation(bot))