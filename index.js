require('dotenv').config();
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');
const cron = require('cron');
const fs = require('fs');
const path = require('path');

// Moduli custom
const updateMemberCount = require('./updateMemberCount');
const welcome = require('./welcome');
const setupRoleReaction = require('./roleReaction');
const { checkLiveStatus } = require('./twitchLiveChecker');
const handleSocialCommand = require('./commands/social');
const handleRulesDsCommand = require('./commands/rulesds');

const RANK_LOG_CHANNEL_ID = '';
const RANK_DATA_FILE = path.join(__dirname, 'rankData.json');
const LEVEL_UP_VOICE_MS = 24 * 60 * 60 * 1000;
const LEVEL_UP_MESSAGES = 1000;
const INACTIVITY_MS = 24 * 60 * 60 * 1000;
const SPAM_WINDOW_MS = 10 * 1000;
const SPAM_MESSAGE_LIMIT = 5;
const SPAM_DUPLICATE_LIMIT = 3;

// === ⚠️ CARICAMENTO PATTERN LINK VIETATI
const forbiddenPatterns = require('./forbiddenLinks.json').map(p => new RegExp(p, 'i'));

// === ⚠️ TRACKER VIOLAZIONI
let userViolations = {}; // { userId: count }
const banFilePath = path.join(__dirname, 'bans.json');

let rankData = {
    users: {}
};

if (fs.existsSync(RANK_DATA_FILE)) {
    try {
        rankData = JSON.parse(fs.readFileSync(RANK_DATA_FILE, 'utf8'));
    } catch (error) {
        console.error('Errore lettura rankData.json, uso struttura vuota.', error);
    }
}

const voiceSessionTracker = new Map(); // userId -> { channelId, startedAt }
const messageSpamTracker = new Map(); // userId -> [timestamps]
const duplicateMessageTracker = new Map(); // userId -> { content, count, lastAt }

function persistRankData() {
    fs.writeFileSync(RANK_DATA_FILE, JSON.stringify(rankData, null, 2));
}

function getOrCreateRankProfile(userId) {
    if (!rankData.users[userId]) {
        rankData.users[userId] = {
            level: 0,
            voiceMs: 0,
            messageCount: 0,
            lastActivityAt: Date.now()
        };
    }

    return rankData.users[userId];
}

async function sendRankLog(guild, text) {
    const channel = guild.channels.cache.get(RANK_LOG_CHANNEL_ID)
        || await guild.channels.fetch(RANK_LOG_CHANNEL_ID).catch(() => null)
        || await client.channels.fetch(RANK_LOG_CHANNEL_ID).catch(() => null);

    if (!channel || !channel.isTextBased()) {
        console.warn(`⚠️ Canale rank log non trovato: ${RANK_LOG_CHANNEL_ID}`);
        return;
    }

    await channel.send(text);
}

async function adjustLevel(guild, userId, amount, reason) {
    const profile = getOrCreateRankProfile(userId);
    const previousLevel = profile.level;
    const nextLevel = Math.max(0, previousLevel + amount);

    if (nextLevel === previousLevel) return;

    profile.level = nextLevel;
    persistRankData();

    const delta = nextLevel - previousLevel;
    const emoji = delta > 0 ? '📈' : '📉';
    const sign = delta > 0 ? '+' : '';

    await sendRankLog(
        guild,
        `${emoji} <@${userId}> ${sign}${delta} livello (${previousLevel} → ${nextLevel}). Motivo: ${reason}.`
    );
}

function isMessageSpam(message) {
    const now = Date.now();
    const userId = message.author.id;
    const timestamps = messageSpamTracker.get(userId) || [];
    const freshTimestamps = timestamps.filter(timestamp => now - timestamp <= SPAM_WINDOW_MS);
    freshTimestamps.push(now);
    messageSpamTracker.set(userId, freshTimestamps);

    const duplicateState = duplicateMessageTracker.get(userId) || { content: '', count: 0, lastAt: 0 };
    const normalizedContent = message.content.trim().toLowerCase();

    if (normalizedContent && duplicateState.content === normalizedContent && (now - duplicateState.lastAt) <= SPAM_WINDOW_MS) {
        duplicateState.count += 1;
    } else {
        duplicateState.content = normalizedContent;
        duplicateState.count = 1;
    }

    duplicateState.lastAt = now;
    duplicateMessageTracker.set(userId, duplicateState);

    return freshTimestamps.length >= SPAM_MESSAGE_LIMIT || duplicateState.count >= SPAM_DUPLICATE_LIMIT;
}

async function addVoiceProgress(member, elapsedMs) {
    if (!member || member.user.bot || elapsedMs <= 0) return;

    const profile = getOrCreateRankProfile(member.id);
    profile.lastActivityAt = Date.now();
    profile.voiceMs += elapsedMs;

    const gainedLevels = Math.floor(profile.voiceMs / LEVEL_UP_VOICE_MS);
    if (gainedLevels > 0) {
        profile.voiceMs -= gainedLevels * LEVEL_UP_VOICE_MS;
        await adjustLevel(member.guild, member.id, gainedLevels, `+1 livello ogni 24 ore in vocale (x${gainedLevels})`);
    }

    persistRankData();
}

function getValidHumansInVoice(channel) {
    if (!channel || channel.type !== ChannelType.GuildVoice) return [];

    return channel.members.filter(member => !member.user.bot);
}

async function flushVoiceSession(member, timestamp = Date.now()) {
    if (!member || member.user.bot) return;

    const session = voiceSessionTracker.get(member.id);
    if (!session) return;

    const channel = member.guild.channels.cache.get(session.channelId)
        || await member.guild.channels.fetch(session.channelId).catch(() => null);

    const humansInVoice = getValidHumansInVoice(channel);
    if (humansInVoice.size > 1) {
        await addVoiceProgress(member, Math.max(0, timestamp - session.startedAt));
    }

    voiceSessionTracker.delete(member.id);
}

async function handleInactivitySweep() {
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
        for (const [userId, profile] of Object.entries(rankData.users)) {
            const member = guild.members.cache.get(userId)
                || await guild.members.fetch(userId).catch(() => null);

            if (!member || member.user.bot) continue;

            if ((now - profile.lastActivityAt) < INACTIVITY_MS) continue;

            const penaltySteps = Math.floor((now - profile.lastActivityAt) / INACTIVITY_MS);
            profile.lastActivityAt += penaltySteps * INACTIVITY_MS;
            persistRankData();
            await adjustLevel(guild, userId, -penaltySteps, `inattività oltre 24 ore (x${penaltySteps})`);
        }
    }
}

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
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const moderationLogChannelId = process.env.MEMBER_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID;
const AUDIT_MEMBER_KICK = 20;
const AUDIT_MEMBER_BAN_ADD = 22;
const privateVoiceChannels = new Map(); // channelId -> ownerId
const privateVoiceCleanupTimeouts = new Map(); // channelId -> timeout
const PRIVATE_VOICE_CATEGORY_ID = '';
const PRIVATE_VOICE_INACTIVITY_MS = 5 * 60 * 1000;

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

function clearPrivateVoiceCleanup(channelId) {
    const timeout = privateVoiceCleanupTimeouts.get(channelId);

    if (timeout) {
        clearTimeout(timeout);
        privateVoiceCleanupTimeouts.delete(channelId);
    }
}

function schedulePrivateVoiceCleanup(channel) {
    clearPrivateVoiceCleanup(channel.id);

    const timeout = setTimeout(async () => {
        const freshChannel = channel.guild.channels.cache.get(channel.id)
            || await channel.guild.channels.fetch(channel.id).catch(() => null);

        if (!freshChannel || freshChannel.type !== ChannelType.GuildVoice) {
            privateVoiceChannels.delete(channel.id);
            clearPrivateVoiceCleanup(channel.id);
            return;
        }

        if (freshChannel.members.size > 0) return;

        await freshChannel.delete('Canale vocale privato inattivo per più di 5 minuti.').catch(() => null);
        privateVoiceChannels.delete(channel.id);
        clearPrivateVoiceCleanup(channel.id);
    }, PRIVATE_VOICE_INACTIVITY_MS);

    privateVoiceCleanupTimeouts.set(channel.id, timeout);
}
async function createPrivateVoiceChannel(message) {
    const ownerId = message.author.id;

    const existingChannelId = [...privateVoiceChannels.entries()]
        .find(([, channelOwnerId]) => channelOwnerId === ownerId)?.[0];

    if (existingChannelId) {
        const existingChannel = message.guild.channels.cache.get(existingChannelId)
            || await message.guild.channels.fetch(existingChannelId).catch(() => null);

        if (existingChannel) {
            return message.reply(`Hai già un canale vocale privato: ${existingChannel}.`);
        }

        privateVoiceChannels.delete(existingChannelId);
    }

    const channelName = `🔒 Privato di ${message.member.displayName}`;
    const category = message.guild.channels.cache.get(PRIVATE_VOICE_CATEGORY_ID)
        || await message.guild.channels.fetch(PRIVATE_VOICE_CATEGORY_ID).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
        return message.reply('❌ Categoria dei vocali privati non trovata. Contatta un admin.');
    }

    const channel = await message.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildVoice,
        parent: PRIVATE_VOICE_CATEGORY_ID,
        permissionOverwrites: [
            {
                id: message.guild.roles.everyone,
                allow: [PermissionFlagsBits.ViewChannel],
                deny: [PermissionFlagsBits.Connect]
            },
            {
                id: ownerId,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.Speak,
                    PermissionFlagsBits.Stream,
                    PermissionFlagsBits.MoveMembers,
                    PermissionFlagsBits.ManageChannels
                ]
            }
        ]
    });

    privateVoiceChannels.set(channel.id, ownerId);
    schedulePrivateVoiceCleanup(channel);

    await message.reply(
        `✅ Ho creato ${channel}. È visibile a tutti ma può entrarci solo il creatore. `
        + 'Puoi spostare utenti nel canale e, una volta dentro, otterranno accesso a voce e condivisione schermo.'
    );
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

    setInterval(() => {
        handleInactivitySweep().catch(error => {
            console.error('Errore controllo inattività rank:', error);
        });
    }, 60 * 1000);

    await setupRoleReaction(client);
});

// === BENVEUTO
client.on('guildMemberAdd', welcome);

client.on('guildMemberRemove', async member => {
    try {
        if (rankData.users[member.id]) {
            delete rankData.users[member.id];
            persistRankData();
            await sendRankLog(member.guild, `🗑️ <@${member.id}> ha lasciato il server: progressi rank azzerati.`);
        }

        voiceSessionTracker.delete(member.id);
        messageSpamTracker.delete(member.id);
        duplicateMessageTracker.delete(member.id);

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

client.on('voiceStateUpdate', async (oldState, newState) => {
    const oldChannel = oldState.channel;
    const member = newState.member || oldState.member;

    if (!member || member.user.bot) return;

    if (oldChannel && oldState.channelId !== newState.channelId) {
        await flushVoiceSession(member);
    }

    const oldHumans = getValidHumansInVoice(oldChannel);
    if (oldHumans.size === 1) {
        const lastHuman = oldHumans.first();
        if (lastHuman) {
            voiceSessionTracker.set(lastHuman.id, { channelId: oldChannel.id, startedAt: Date.now() });
        }
    }

    if (privateVoiceChannels.has(oldChannel.id) && oldChannel.members.size === 0) {
        schedulePrivateVoiceCleanup(oldChannel);
    }

    if (destinationChannel) {
        const profile = getOrCreateRankProfile(member.id);
        profile.lastActivityAt = Date.now();
        persistRankData();
    }

    const humans = getValidHumansInVoice(destinationChannel);
    if (humans.size > 1) {
        for (const human of humans.values()) {
            if (!voiceSessionTracker.has(human.id)) {
                voiceSessionTracker.set(human.id, { channelId: destinationChannel.id, startedAt: Date.now() });
            }
        }
    } else {
        voiceSessionTracker.delete(member.id);
    }

    if (privateVoiceChannels.has(destinationChannel.id)) {
        clearPrivateVoiceCleanup(destinationChannel.id);
    }

    const ownerId = privateVoiceChannels.get(destinationChannel.id);
    if (!ownerId) return;

    if (newState.id === ownerId) return;

    if (oldState.channelId === destinationChannel.id) return;

    const wasMoved = oldState.channelId && oldState.channelId !== destinationChannel.id;
    if (!wasMoved) {
        await newState.disconnect('Canale vocale privato: ingresso consentito solo se spostati dal proprietario.').catch(() => null);
        return;
    }

    await destinationChannel.permissionOverwrites.edit(newState.id, {
        ViewChannel: true,
        Connect: true,
        Speak: true,
        Stream: true
    }).catch(err => {
        console.error('Errore aggiornamento permessi utente nel canale privato:', err);
    });
});

client.on('channelDelete', channel => {
    if (!privateVoiceChannels.has(channel.id)) return;

    privateVoiceChannels.delete(channel.id);
    clearPrivateVoiceCleanup(channel.id);
});

// === MESSAGGI
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const profile = getOrCreateRankProfile(message.author.id);
    profile.lastActivityAt = Date.now();
    persistRankData();

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

            await adjustLevel(message.guild, userId, -1, 'violazione regole rilevata dal bot');

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

    if (isMessageSpam(message)) {
        return;
    }

    profile.messageCount += 1;

    const gainedLevelsFromMessages = Math.floor(profile.messageCount / LEVEL_UP_MESSAGES);
    if (gainedLevelsFromMessages > 0) {
        profile.messageCount -= gainedLevelsFromMessages * LEVEL_UP_MESSAGES;
        await adjustLevel(message.guild, message.author.id, gainedLevelsFromMessages, `+1 livello ogni 1000 messaggi (x${gainedLevelsFromMessages})`);
    }

    persistRankData();

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

    if (message.content === '!rulesds') {
        return await handleRulesDsCommand(message);
    }

    if (message.content === '!creavocale') {
        return await createPrivateVoiceChannel(message);
    }
});

// === LOGIN
client.login(process.env.DISCORD_TOKEN);
