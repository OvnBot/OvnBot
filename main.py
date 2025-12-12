import discord
import os
from dotenv import load_dotenv

# Charger les variables d'environnement depuis le fichier .env
load_dotenv()

# Définir les "intents" (intentions) nécessaires pour le bot
intents = discord.Intents.default()
intents.members = True  # Requis pour les événements de membre (ex: guildMemberAdd)
intents.message_content = True # Requis pour lire le contenu des messages

# Créer l'instance du bot
bot = discord.Bot(intents=intents)

# Événement déclenché lorsque le bot est prêt et connecté
@bot.event
async def on_ready():
    print(f'Connecté en tant que {bot.user}')
    print(f'Le bot est sur {len(bot.guilds)} serveur(s).')

# Charger les Cogs (fichiers de commandes)
# Le bot va chercher les fichiers .py dans le dossier 'cogs'
for filename in os.listdir('./cogs'):
    if filename.endswith('.py'):
        try:
            bot.load_extension(f'cogs.{filename[:-3]}')
            print(f'✅ - Cog chargé : {filename}')
        except Exception as e:
            print(f'❌ - Erreur de chargement du Cog {filename}: {e}')

# Lancer le bot avec le token
try:
    bot.run(os.getenv('DISCORD_TOKEN'))
except discord.errors.LoginFailure:
    print("❌ - Échec de la connexion : Token invalide.")
    print("Veuillez vérifier votre fichier .env et le token du bot.")