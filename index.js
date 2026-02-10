require('dotenv').config();
const {
    Client,
    GatewayIntentBits
} = require('discord.js');
const cron = require('cron');
const fs = require('fs');
const path = require('path');

// Moduli custom
const updateMemberCount = require('./updateMemberCount');
const welcome = require('./welcome');
const setupRoleReaction = require('./roleReaction');
const { checkLiveStatus } = require('./twitchLiveChecker');
const handleSocialCommand = require('./commands/social');

// === ⚠️ CARICAMENTO PATTERN LINK VIETATI
const forbiddenPatterns = require('./forbiddenLinks.json').map(p => new RegExp(p, 'i'));

// === ⚠️ TRACKER VIOLAZIONI
let userViolations = {}; // { userId: count }
const banFilePath = path.join(__dirname, 'bans.json');

// Carica ban esistenti da file
let bans = {};
if (fs.existsSync(banFilePath)) {
    bans = JSON.parse(fs.readFileSync(banFilePath, 'utf8'));
}

// === BOT INSTANCE
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions
    ]
});

const moderationLogChannelId = process.env.MEMBER_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
const AUDIT_MEMBER_KICK = 20;
const AUDIT_MEMBER_BAN_ADD = 22;

async function sendMemberLogEmbed(guild, embed) {
    if (!moderationLogChannelId) {
        console.warn('⚠️ MEMBER_LOG_CHANNEL_ID/LOG_CHANNEL_ID non configurato.');
        return;
    }

    const logChannel = guild.channels.cache.get(moderationLogChannelId)
        || await guild.channels.fetch(moderationLogChannelId).catch(() => null)
        || await client.channels.fetch(moderationLogChannelId).catch(() => null);

    if (!logChannel || !logChannel.isTextBased()) {
        console.warn(`⚠️ Canale log non trovato o non testuale: ${moderationLogChannelId}`);
        return;
    }

    await logChannel.send({ embeds: [embed] });
}

async function isRecentModerationAction(guild, eventType, userId) {
    const auditLogs = await guild.fetchAuditLogs({ type: eventType, limit: 1 }).catch(() => null);
    const entry = auditLogs?.entries.first();

    if (!entry || entry.target?.id !== userId) return false;

    return Date.now() - entry.createdTimestamp < 5000;
}

// === AVVIO BOT
client.once('clientReady', async () => {
    console.log(`✅ SkullBot online come ${client.user.tag}`);

    await updateMemberCount(client);
    const memberJob = new cron.CronJob('*/5 * * * *', () => updateMemberCount(client));
    memberJob.start();

    setInterval(() => checkLiveStatus(client), 60000);

    await setupRoleReaction(client);
});

// === BENVEUTO
client.on('guildMemberAdd', welcome);

client.on('guildMemberRemove', async member => {
    try {
        // Piccolo ritardo: l'audit log del kick può arrivare dopo l'evento di rimozione
        await new Promise(resolve => setTimeout(resolve, 1500));

        const wasKicked = await isRecentModerationAction(member.guild, AUDIT_MEMBER_KICK, member.id);
        const wasBanned = await isRecentModerationAction(member.guild, AUDIT_MEMBER_BAN_ADD, member.id);

        if (wasBanned) return;

        const userTag = member.user?.tag || 'Utente sconosciuto';

        const embed = {
            color: wasKicked ? 0xffa500 : 0xff0000,
            title: wasKicked ? '👢 Utente espulso dal server' : '🚪 Utente uscito dal server',
            description: `<@${member.id}> (**${userTag}**)`,
            fields: [
                { name: 'User ID', value: member.id, inline: true },
                { name: 'Azione', value: wasKicked ? 'Espulsione (Kick)' : 'Uscita volontaria', inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        await sendMemberLogEmbed(member.guild, embed);
    } catch (err) {
        console.error('Errore log uscita/espulsione:', err);
    }
});

client.on('guildBanAdd', async ban => {
    try {
        const embed = {
            color: 0x8b0000,
            title: '🔨 Utente bannato',
            description: `<@${ban.user.id}> (**${ban.user.tag}**)`,
            fields: [
                { name: 'User ID', value: ban.user.id, inline: true },
                { name: 'Azione', value: 'Ban', inline: true }
            ],
            timestamp: new Date().toISOString()
        };

        await sendMemberLogEmbed(ban.guild, embed);
    } catch (err) {
        console.error('Errore log ban:', err);
    }
});

// === MESSAGGI
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // 🔒 LINK NON CONSENTITI
    if (forbiddenPatterns.some(pattern => pattern.test(message.content))) {
        try {
            await message.delete();

            // Aumenta conteggio violazioni
            const userId = message.author.id;
            userViolations[userId] = (userViolations[userId] || 0) + 1;

            // Log nel canale di log
            const logChannel = client.channels.cache.get(process.env.LOG_CHANNEL_ID);
            if (logChannel) {
                logChannel.send(`⚠️ Link vietato inviato da <@${userId}> (${message.author.tag}) - Tentativo ${userViolations[userId]}/3\nContenuto: \`${message.content}\``);
            }

            // Messaggio all'utente
            await message.channel.send({
                content: `🚫 <@${userId}>, non è consentito pubblicare link non autorizzati. Tentativo ${userViolations[userId]}/3.`,
                allowedMentions: { users: [userId] }
            });

            // Ban se supera 3 tentativi
            if (userViolations[userId] >= 3 && !bans[userId]) {
                await message.guild.members.ban(userId, { reason: "Link non autorizzati (3 violazioni)" });

                // Salva ban
                bans[userId] = {
                    tag: message.author.tag,
                    timestamp: new Date().toISOString(),
                    reason: "Link non autorizzati (3 violazioni)"
                };
                fs.writeFileSync(banFilePath, JSON.stringify(bans, null, 2));

                if (logChannel) {
                    logChannel.send(`🔨 <@${userId}> è stato **bannato permanentemente** per spam di link non autorizzati.`);
                }

                delete userViolations[userId]; // Resetta violazioni
            }

        } catch (err) {
            console.error('Errore gestione link vietato:', err);
        }
        return;
    }

    // === COMANDI
    if (message.content === '!ciao') {
        message.reply('Ciao e benvenuto su Skull Network Italia! 💀');
    }

    if (message.content === '!acstatus') {
        await acStatusCommand(client, message);
    }

    if (message.content === '!social') {
        return await handleSocialCommand(client, message);
    }    
});

// === LOGIN
client.login(process.env.DISCORD_TOKEN);
