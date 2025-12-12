import discord
from discord.commands import SlashCommandGroup, Option
from discord.ext import commands

# --- Vue pour le bouton du règlement ---
class RulesView(discord.ui.View):
    def __init__(self, role: discord.Role):
        super().__init__(timeout=None) # Timeout=None pour que le bouton soit permanent
        self.role = role

    @discord.ui.button(label="J'accepte le règlement", style=discord.ButtonStyle.success, custom_id="accept_rules_button")
    async def button_callback(self, button: discord.ui.Button, interaction: discord.Interaction):
        try:
            await interaction.user.add_roles(self.role)
            await interaction.response.send_message(f"Vous avez accepté le règlement et reçu le rôle {self.role.name} !", ephemeral=True)
        except discord.Forbidden:
            await interaction.response.send_message("Je n'ai pas la permission de vous donner ce rôle.", ephemeral=True)
        except Exception as e:
            print(e)
            await interaction.response.send_message("Une erreur est survenue.", ephemeral=True)

# --- Vue pour le bouton de création de ticket ---
class TicketView(discord.ui.View):
    def __init__(self, staff_role: discord.Role):
        super().__init__(timeout=None)
        self.staff_role = staff_role

    @discord.ui.button(label="Créer un Ticket", style=discord.ButtonStyle.primary, emoji="🎟️", custom_id="create_ticket_button")
    async def button_callback(self, button: discord.ui.Button, interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True)
        
        category = button.channel.category
        overwrites = {
            interaction.guild.default_role: discord.PermissionOverwrite(view_channel=False),
            interaction.user: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
            self.staff_role: discord.PermissionOverwrite(view_channel=True, send_messages=True, read_message_history=True),
            interaction.guild.me: discord.PermissionOverwrite(view_channel=True, send_messages=True)
        }

        ticket_channel = await interaction.guild.create_text_channel(
            name=f"ticket-{interaction.user.name}",
            category=category,
            overwrites=overwrites,
            topic=f"Ticket de {interaction.user.id}"
        )

        embed = discord.Embed(
            title=f"Ticket de {interaction.user.name}",
            description="Bonjour ! Décrivez votre problème ici. Un membre du staff va bientôt vous répondre.",
            color=discord.Color.blue()
        )
        await ticket_channel.send(content=f"{interaction.user.mention} {self.staff_role.mention}", embeds=[embed])
        await interaction.followup.send(f"Votre ticket a été créé : {ticket_channel.mention}", ephemeral=True)


class Admin(commands.Cog):
    def __init__(self, bot):
        self.bot = bot

    admin = SlashCommandGroup("admin", "Commandes réservées à l'administration.")

    @admin.command(name="rules", description="Envoie le règlement avec un bouton d'acceptation.")
    @commands.has_permissions(administrator=True)
    async def rules(self, ctx: discord.ApplicationContext, 
                    role: Option(discord.Role, "Le rôle à donner après acceptation."),
                    channel: Option(discord.TextChannel, "Le salon où envoyer le règlement.")):
        
        embed = discord.Embed(
            title="📜 Règlement du Serveur",
            description="1. Soyez respectueux.\n2. Pas de spam ou de publicité non sollicitée.\n3. Le contenu NSFW est strictement interdit.\n4. Suivez les Termes de Service de Discord.\n\n**Cliquez sur le bouton pour accepter le règlement et accéder au reste du serveur.**",
            color=discord.Color.gold()
        )
        
        await channel.send(embed=embed, view=RulesView(role))
        await ctx.respond(f"Le règlement a été envoyé dans {channel.mention}.", ephemeral=True)

    @admin.command(name="ticket-setup", description="Configure le système de tickets.")
    @commands.has_permissions(administrator=True)
    async def ticket_setup(self, ctx: discord.ApplicationContext):
        await ctx.defer(ephemeral=True)
        guild = ctx.guild

        staff_role = discord.utils.get(guild.roles, name="Support Ticket")
        if not staff_role:
            staff_role = await guild.create_role(name="Support Ticket", color=discord.Color.blue(), reason="Rôle pour la gestion des tickets")

        category = await guild.create_category("TICKETS")
        
        channel = await guild.create_text_channel("ouvrir-un-ticket", category=category)

        embed = discord.Embed(
            title="Support Technique",
            description="Cliquez sur le bouton ci-dessous pour créer un ticket.\nLe staff vous répondra dès que possible.",
            color=discord.Color.blue()
        )
        
        await channel.send(embed=embed, view=TicketView(staff_role))
        await ctx.followup.send("Le système de tickets a été configuré avec succès !")

def setup(bot):
    bot.add_cog(Admin(bot))