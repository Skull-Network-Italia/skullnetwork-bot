const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function ensureConvogliStore(config) {
    const file = config.paths.convogliFile;
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify({ events: [], requests: [], meta: { inviteMessageId: '', calendarMessageId: '' } }, null, 2));
    }
}

function loadConvogli(config) {
    ensureConvogliStore(config);
    const raw = JSON.parse(fs.readFileSync(config.paths.convogliFile, 'utf8'));

    if (!Array.isArray(raw.events)) raw.events = [];
    if (!Array.isArray(raw.requests)) raw.requests = [];
    if (!raw.meta || typeof raw.meta !== 'object') raw.meta = { inviteMessageId: '', calendarMessageId: '' };
    if (typeof raw.meta.inviteMessageId !== 'string') raw.meta.inviteMessageId = '';
    if (typeof raw.meta.calendarMessageId !== 'string') raw.meta.calendarMessageId = '';

    return raw;
}

function saveConvogli(config, store) {
    fs.writeFileSync(config.paths.convogliFile, JSON.stringify(store, null, 2));
}

function getWeekKey(dateMs) {
    const date = new Date(dateMs);
    const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = tmp.getUTCDay() || 7;
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    return `${tmp.getUTCFullYear()}-W${week}`;
}

function getMonthKey(dateMs) {
    const date = new Date(dateMs);
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`;
}

function getUpcomingApprovedEvents(store) {
    const now = Date.now();
    return store.events
        .filter(event => event.status === 'approved' && Number(event.data_utc) >= now - 6 * 60 * 60 * 1000)
        .sort((a, b) => Number(a.data_utc) - Number(b.data_utc));
}

function getCountersForDate(store, dateMs) {
    const weekKey = getWeekKey(dateMs);
    const monthKey = getMonthKey(dateMs);

    const approved = store.events.filter(event => event.status === 'approved');
    const weekCount = approved.filter(event => getWeekKey(event.data_utc) === weekKey).length;
    const monthCount = approved.filter(event => getMonthKey(event.data_utc) === monthKey).length;

    return { weekCount, monthCount, weekKey, monthKey };
}

function formatEventLine(event) {
    const partnerEmoji = event.partner ? '🤝' : '•';
    return `${partnerEmoji} **${event.data_locale}** — **${event.organizzatore}**\n${event.partenza} → ${event.destinazione} (${event.game})\n[TruckersMP](${event.link}) • discord.gg/${event.discord_code}`;
}

function getAvailabilityEmoji({ weekCount, monthCount, hasHardConflict, hasNearEvent }) {
    if (hasHardConflict || weekCount >= 3 || monthCount >= 12) return '🔴';
    if (weekCount >= 2 || monthCount >= 10 || hasNearEvent) return '🟡';
    return '🟢';
}

function createInviteEmbed() {
    return new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle('Sistema Convogli')
        .setDescription('Premi il pulsante per inviare un convoglio')
        .setTimestamp();
}

function createInviteComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('convoglio_submit_btn')
                .setLabel('➕ Invia Convoglio')
                .setStyle(ButtonStyle.Primary)
        )
    ];
}

async function ensureInviteMessage(client, config) {
    const store = loadConvogli(config);
    const channel = await client.channels.fetch(config.channels.inviti).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    let inviteMessage = null;
    if (store.meta.inviteMessageId) {
        inviteMessage = await channel.messages.fetch(store.meta.inviteMessageId).catch(() => null);
    }

    if (!inviteMessage) {
        inviteMessage = await channel.send({ embeds: [createInviteEmbed()], components: createInviteComponents() });
        store.meta.inviteMessageId = inviteMessage.id;
        saveConvogli(config, store);
        return;
    }

    await inviteMessage.edit({ embeds: [createInviteEmbed()], components: createInviteComponents() }).catch(() => null);
}

function buildCalendarEmbed(store) {
    const events = getUpcomingApprovedEvents(store);
    const now = Date.now();
    const currentCounters = getCountersForDate(store, now);

    const sorted = [...events].sort((a, b) => {
        if (a.partner !== b.partner) return a.partner ? -1 : 1;
        return Number(a.data_utc) - Number(b.data_utc);
    });

    const description = sorted.length > 0
        ? sorted.map(formatEventLine).join('\n\n')
        : 'Nessun convoglio approvato al momento.';

    return new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('📅 Calendario Convogli')
        .setDescription(description)
        .addFields(
            { name: 'Settimana', value: `${currentCounters.weekCount}/3`, inline: true },
            { name: 'Mese', value: `${currentCounters.monthCount}/12`, inline: true }
        )
        .setTimestamp();
}

async function refreshCalendarMessage(client, config) {
    const store = loadConvogli(config);
    const channel = await client.channels.fetch(config.channels.calendario).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    let calendarMessage = null;
    if (store.meta.calendarMessageId) {
        calendarMessage = await channel.messages.fetch(store.meta.calendarMessageId).catch(() => null);
    }

    if (!calendarMessage) {
        calendarMessage = await channel.send({ embeds: [buildCalendarEmbed(store)] });
        store.meta.calendarMessageId = calendarMessage.id;
        saveConvogli(config, store);
        return;
    }

    await calendarMessage.edit({ embeds: [buildCalendarEmbed(store)] });
}

module.exports = {
    loadConvogli,
    saveConvogli,
    getCountersForDate,
    getAvailabilityEmoji,
    ensureInviteMessage,
    refreshCalendarMessage,
    getWeekKey,
    getMonthKey
};
