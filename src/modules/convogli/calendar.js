const fs = require('fs');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const EMBED_COLORS = {
    brand: 0x5865f2,
    calendar: 0x00b894
};

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

function prunePastEvents(store, graceMs = 2 * 60 * 60 * 1000) {
    const now = Date.now();
    const before = store.events.length;
    store.events = store.events.filter(event => Number(event.data_utc) >= now - graceMs);
    return before - store.events.length;
}

function removeEventByTruckersmpId(store, truckersmpId) {
    const before = store.events.length;
    store.events = store.events.filter(event => Number(event.truckersmp_id) !== Number(truckersmpId));
    return before - store.events.length;
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

function formatEventLine(event, index) {
    const partnerValue = event.partner ? 'Sì' : 'No';
    const partnerPrefix = event.partner ? '🤝 ' : '';

    return [
        `**${index + 1}. ${partnerPrefix}${event.organizzatore}**`,
        `📅 ${event.data_locale}`,
        `🚚 ${event.partenza} → ${event.destinazione}`,
        `⏱️ Ritrovo ${event.ritrovo_time || 'N/D'} • Partenza ${event.partenza_time || 'N/D'}`,
        `🎮 ${event.game} • 🌐 ${event.server}`,
        `🆔 ID: ${event.truckersmp_id} • 🤝 Partner: **${partnerValue}**`,
        `[TruckersMP](${event.link}) • [Discord](https://discord.gg/${event.discord_code})`
    ].join('\n');
}

function getAvailabilityEmoji({ weekCount, monthCount, hasHardConflict, hasNearEvent }) {
    if (hasHardConflict || weekCount >= 3 || monthCount >= 12) return '🔴';
    if (weekCount >= 2 || monthCount >= 10 || hasNearEvent) return '🟡';
    return '🟢';
}

function createInviteEmbed() {
    return new EmbedBuilder()
        .setColor(EMBED_COLORS.brand)
        .setTitle('🚛 Sistema Convogli')
        .setDescription([
            'Invia qui la tua proposta convoglio TruckersMP.',
            '',
            '• Parsing automatico evento (API TruckersMP)',
            '• Validazioni conflitti/limiti',
            '• Revisione staff con approvazione'
        ].join('\n'))
        .setFooter({ text: 'Skull Network • Convogli ETS2/ATS' })
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

function createCalendarComponents() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('convoglio_cleanup_past')
                .setLabel('🧹 Rimuovi passati')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('convoglio_remove_by_id')
                .setLabel('🗑️ Rimuovi per ID')
                .setStyle(ButtonStyle.Danger)
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

function buildCalendarEmbeds(store) {
    const events = getUpcomingApprovedEvents(store);
    const now = Date.now();
    const currentCounters = getCountersForDate(store, now);

    const sorted = [...events].sort((a, b) => Number(a.data_utc) - Number(b.data_utc));
    const eventBlocks = sorted.map((event, idx) => formatEventLine(event, idx));

    const headerEmbed = new EmbedBuilder()
        .setColor(EMBED_COLORS.calendar)
        .setTitle('📅 Calendario Convogli')
        .addFields(
            { name: '📈 Slot Settimana', value: `**${currentCounters.weekCount}/3**`, inline: true },
            { name: '🗓️ Slot Mese', value: `**${currentCounters.monthCount}/12**`, inline: true },
            { name: 'ℹ️ Ordine elenco', value: 'Solo per data evento', inline: true }
        )
        .setFooter({ text: `Aggiornato il ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })} • Ordinato per data evento` })
        .setTimestamp();

    if (eventBlocks.length === 0) {
        headerEmbed.setDescription('Nessun convoglio approvato al momento.\nPremi **➕ Invia Convoglio** nel canale inviti.');
        return [headerEmbed];
    }

    const maxDesc = 3800;
    const descriptions = [];
    let current = '';

    for (const block of eventBlocks) {
        const candidate = current ? `${current}\n\n${block}` : block;
        if (candidate.length > maxDesc) {
            descriptions.push(current);
            current = block;
        } else {
            current = candidate;
        }
    }
    if (current) descriptions.push(current);

    const embeds = [];
    descriptions.forEach((desc, idx) => {
        const embed = idx === 0 ? EmbedBuilder.from(headerEmbed) : new EmbedBuilder()
            .setColor(EMBED_COLORS.calendar)
            .setTitle(`📅 Calendario Convogli (continua ${idx + 1}/${descriptions.length})`)
            .setFooter({ text: `Pagina ${idx + 1}/${descriptions.length}` })
            .setTimestamp();

        embed.setDescription(desc);
        embeds.push(embed);
    });

    return embeds.slice(0, 10);
}

async function refreshCalendarMessage(client, config) {
    const store = loadConvogli(config);
    const pruned = prunePastEvents(store);
    if (pruned > 0) saveConvogli(config, store);

    const channel = await client.channels.fetch(config.channels.calendario).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    let calendarMessage = null;
    if (store.meta.calendarMessageId) {
        calendarMessage = await channel.messages.fetch(store.meta.calendarMessageId).catch(() => null);
    }

    if (!calendarMessage) {
        calendarMessage = await channel.send({ embeds: buildCalendarEmbeds(store), components: createCalendarComponents() });
        store.meta.calendarMessageId = calendarMessage.id;
        saveConvogli(config, store);
        return;
    }

    await calendarMessage.edit({ embeds: buildCalendarEmbeds(store), components: createCalendarComponents() });
}

module.exports = {
    loadConvogli,
    saveConvogli,
    getCountersForDate,
    getAvailabilityEmoji,
    ensureInviteMessage,
    refreshCalendarMessage,
    prunePastEvents,
    removeEventByTruckersmpId,
    getWeekKey,
    getMonthKey
};
