const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function cleanString(value) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

module.exports = {
    discordToken: cleanString(process.env.DISCORD_TOKEN),
    guildId: cleanString(process.env.GUILD_ID),
    memberCountChannelId: cleanString(process.env.CHANNEL_ID),
    logChannelId: cleanString(process.env.LOG_CHANNEL_ID),
    memberLogChannelId: cleanString(process.env.MEMBER_LOG_CHANNEL_ID) || cleanString(process.env.LOG_CHANNEL_ID),
    socialChannelId: cleanString(process.env.SOCIAL_CHANNEL_ID),
    rankLogChannelId: cleanString(process.env.RANK_LOG_CHANNEL_ID),
    privateVoiceCategoryId: cleanString(process.env.PRIVATE_VOICE_CATEGORY_ID),
    privateVoiceInactivityMs: toInt(process.env.PRIVATE_VOICE_INACTIVITY_MS, 5 * 60 * 1000),
    roleReactionChannelId: cleanString(process.env.ROLE_REACTION_CHANNEL_ID),
    dailyGreetingChannelId: cleanString(process.env.DAILY_GREETING_CHANNEL_ID),
    hourlyCleanupChannelId: cleanString(process.env.HOURLY_CLEANUP_CHANNEL_ID),
    channels: {
        inviti: cleanString(process.env.CHANNEL_INVITI_ID),
        calendario: cleanString(process.env.CHANNEL_CALENDARIO_ID),
        log: cleanString(process.env.CHANNEL_LOG_ID) || cleanString(process.env.LOG_CHANNEL_ID)
    },
    ownerId: cleanString(process.env.OWNER_ID),
    staffRoleId: cleanString(process.env.STAFF_ROLE_ID),
    partners: (process.env.PARTNERS || '').split(',').map(item => item.trim()).filter(Boolean),
    roleByEmoji: {
        '🚛': process.env.ROLE_ETS_ID,
        '🚜': process.env.ROLE_FS22_ID,
        '⚓': process.env.ROLE_WARSHIPS_ID,
        '🚗': process.env.ROLE_ASSETTO_ID,
        '✈️': process.env.ROLE_FLIGHT_SIM_ID,
        '🎮': process.env.ROLE_R6_ID,
        '🛠️': process.env.ROLE_MINECRAFT_ID,
        '💀': process.env.ROLE_FIVEM_ID
    },
    twitch: {
        clientId: process.env.TWITCH_CLIENT_ID,
        clientSecret: process.env.TWITCH_CLIENT_SECRET,
        streamers: (process.env.TWITCH_STREAMERS || '').split(',').map(s => s.trim()).filter(Boolean),
        discordChannelId: process.env.TWITCH_DISCORD_CHANNEL
    },
    rank: {
        levelUpVoiceMs: toInt(process.env.LEVEL_UP_VOICE_MS, 24 * 60 * 60 * 1000),
        levelUpMessages: toInt(process.env.LEVEL_UP_MESSAGES, 1000),
        inactivityMs: toInt(process.env.RANK_INACTIVITY_MS, 24 * 60 * 60 * 1000),
        spamWindowMs: toInt(process.env.SPAM_WINDOW_MS, 10 * 1000),
        spamMessageLimit: toInt(process.env.SPAM_MESSAGE_LIMIT, 5),
        spamDuplicateLimit: toInt(process.env.SPAM_DUPLICATE_LIMIT, 3)
    },
    paths: {
        dataDir: path.join(__dirname, '..', '..', 'data'),
        forbiddenLinksFile: path.join(__dirname, '..', '..', 'data', 'forbiddenLinks.json'),
        bansFile: path.join(__dirname, '..', '..', 'data', 'bans.json'),
        rankDataFile: path.join(__dirname, '..', '..', 'data', 'rankData.json'),
        reactionMessageFile: path.join(__dirname, '..', '..', 'data', 'reactionMessage.json'),
        twitchLiveCacheFile: path.join(__dirname, '..', '..', 'data', 'twitchLiveCache.json'),
        convogliFile: path.join(__dirname, '..', '..', 'data', 'convogli.json')
    }
};
