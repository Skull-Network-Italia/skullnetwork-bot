const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

function toInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

module.exports = {
    discordToken: process.env.DISCORD_TOKEN,
    guildId: process.env.GUILD_ID,
    memberCountChannelId: process.env.CHANNEL_ID,
    logChannelId: process.env.LOG_CHANNEL_ID,
    memberLogChannelId: process.env.MEMBER_LOG_CHANNEL_ID || process.env.LOG_CHANNEL_ID,
    socialChannelId: process.env.SOCIAL_CHANNEL_ID,
    rankLogChannelId: process.env.RANK_LOG_CHANNEL_ID,
    privateVoiceCategoryId: process.env.PRIVATE_VOICE_CATEGORY_ID,
    privateVoiceInactivityMs: toInt(process.env.PRIVATE_VOICE_INACTIVITY_MS, 5 * 60 * 1000),
    roleReactionChannelId: process.env.ROLE_REACTION_CHANNEL_ID,
    dailyGreetingChannelId: process.env.DAILY_GREETING_CHANNEL_ID,
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
        twitchLiveCacheFile: path.join(__dirname, '..', '..', 'data', 'twitchLiveCache.json')
    }
};