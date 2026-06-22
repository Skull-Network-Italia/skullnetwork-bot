const fs = require('fs');
const path = require('path');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    EmbedBuilder,
    MessageFlags,
    PermissionFlagsBits
} = require('discord.js');

const TICKET_CREATE_BUTTON_ID = 'ticket_create';
const TICKET_CLOSE_BUTTON_ID = 'ticket_close';
const MAX_TRANSCRIPT_MESSAGES = 500;
const DISCORD_SNOWFLAKE_PATTERN = /^\d{17,20}$/;

function ensureTicketStore(config) {
    fs.mkdirSync(path.dirname(config.paths.ticketsFile), { recursive: true });
    if (!fs.existsSync(config.paths.ticketsFile)) {
        fs.writeFileSync(config.paths.ticketsFile, JSON.stringify({ tickets: [], meta: { panelMessageId: '' } }, null, 2));
    }
}

function normalizeTicketStore(raw) {
    const store = raw && typeof raw === 'object' ? raw : {};
    if (!Array.isArray(store.tickets)) store.tickets = [];
    if (!store.meta || typeof store.meta !== 'object') store.meta = { panelMessageId: '' };
    if (typeof store.meta.panelMessageId !== 'string') store.meta.panelMessageId = '';
    return store;
}

function loadTickets(config) {
    ensureTicketStore(config);
    try {
        return normalizeTicketStore(JSON.parse(fs.readFileSync(config.paths.ticketsFile, 'utf8')));
    } catch (error) {
        console.error('Errore lettura tickets.json, uso struttura vuota.', error);
        return { tickets: [], meta: { panelMessageId: '' } };
    }
}

function saveTickets(config, store) {
    fs.mkdirSync(path.dirname(config.paths.ticketsFile), { recursive: true });
    const normalized = normalizeTicketStore(store);
    const tmpFile = `${config.paths.ticketsFile}.${process.pid}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(normalized, null, 2));
    fs.renameSync(tmpFile, config.paths.ticketsFile);
}

function isDiscordSnowflake(value) {
    return typeof value === 'string' && DISCORD_SNOWFLAKE_PATTERN.test(value);
}

async function resolveStaffRoleId(guild, config) {
    const candidates = [config.ticketStaffRoleId, config.staffRoleId].filter(isDiscordSnowflake);
    for (const roleId of candidates) {
        const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
        if (role) return role.id;
        console.warn(`Ruolo staff ticket non trovato o non accessibile: ${roleId}`);
    }
    return null;
}

async function resolveTicketCategoryId(guild, config) {
    if (!isDiscordSnowflake(config.ticketCategoryId)) return null;

    const category = guild.channels.cache.get(config.ticketCategoryId)
        || await guild.channels.fetch(config.ticketCategoryId).catch(() => null);

    if (!category || category.type !== ChannelType.GuildCategory) {
        console.warn(`Categoria ticket non trovata o non valida: ${config.ticketCategoryId}`);
        return null;
    }

    return category.id;
}

function canManageTickets(member, config) {
    if (!member) return false;
    if (config.ownerId && member.id === config.ownerId) return true;
    if (config.ticketStaffRoleId && member.roles?.cache?.has(config.ticketStaffRoleId)) return true;
    if (config.staffRoleId && member.roles?.cache?.has(config.staffRoleId)) return true;
    return member.permissions?.has(PermissionFlagsBits.ManageChannels) || false;
}

function buildTicketPanel() {
    const embed = new EmbedBuilder()
        .setTitle('🎫 Supporto Ticket')
        .setDescription('Hai bisogno di aiuto? Premi il pulsante qui sotto per aprire un ticket privato con lo staff.')
        .setColor(0x5865f2)
        .setFooter({ text: 'Skull Network Italia • Sistema ticket' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(TICKET_CREATE_BUTTON_ID)
            .setLabel('Apri ticket')
            .setEmoji('🎫')
            .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [row] };
}

function buildCloseButton() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(TICKET_CLOSE_BUTTON_ID)
                .setLabel('Chiudi ticket')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

function sanitizeChannelName(value) {
    return String(value || 'utente')
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'utente';
}

function findOpenTicketByUser(store, guildId, userId) {
    return store.tickets.find(ticket => ticket.guildId === guildId && ticket.ownerId === userId && ticket.status === 'open');
}

function findTicketByChannel(store, channelId) {
    return store.tickets.find(ticket => ticket.channelId === channelId && ticket.status === 'open');
}

async function sendEphemeral(interaction, content) {
    const payload = { content, flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
    return interaction.reply(payload).catch(() => null);
}

async function bootstrapTickets(client, config) {
    if (!config.ticketPanelChannelId) {
        console.warn('Sistema ticket non configurato: imposta TICKET_PANEL_CHANNEL_ID nel file .env.');
        return;
    }

    const channel = await client.channels.fetch(config.ticketPanelChannelId).catch(() => null);
    if (!channel?.isTextBased()) {
        console.warn('Sistema ticket non configurato: TICKET_PANEL_CHANNEL_ID non è un canale testuale valido.');
        return;
    }

    const store = loadTickets(config);
    let panelMessage = null;
    if (store.meta.panelMessageId) {
        panelMessage = await channel.messages.fetch(store.meta.panelMessageId).catch(() => null);
    }

    const payload = buildTicketPanel();
    if (panelMessage) {
        await panelMessage.edit(payload);
    } else {
        panelMessage = await channel.send(payload);
        store.meta.panelMessageId = panelMessage.id;
        saveTickets(config, store);
    }
}

async function createTicket(interaction, config) {
    const store = loadTickets(config);
    const existingTicket = findOpenTicketByUser(store, interaction.guildId, interaction.user.id);
    if (existingTicket) {
        const existingChannel = await interaction.guild.channels.fetch(existingTicket.channelId).catch(() => null);
        if (existingChannel) return sendEphemeral(interaction, `Hai già un ticket aperto: ${existingChannel}.`);
        existingTicket.status = 'orphaned';
        existingTicket.closedAt = Date.now();
        existingTicket.closeReason = 'Canale non trovato durante apertura nuovo ticket';
        saveTickets(config, store);
    }

    const staffRoleId = await resolveStaffRoleId(interaction.guild, config);
    const categoryId = await resolveTicketCategoryId(interaction.guild, config);
    const overwrites = [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
    ];

    if (staffRoleId) {
        overwrites.push({ id: staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
    }

    const channel = await interaction.guild.channels.create({
        name: `ticket-${sanitizeChannelName(interaction.user.username)}`,
        type: ChannelType.GuildText,
        parent: categoryId,
        topic: `Ticket di ${interaction.user.tag} (${interaction.user.id})`,
        permissionOverwrites: overwrites,
        reason: `Ticket aperto da ${interaction.user.tag}`
    });

    const ticket = {
        id: `${Date.now()}-${interaction.user.id}`,
        guildId: interaction.guildId,
        channelId: channel.id,
        ownerId: interaction.user.id,
        ownerTag: interaction.user.tag,
        status: 'open',
        createdAt: Date.now(),
        closedAt: null,
        closedBy: null,
        closeReason: null,
        transcript: []
    };

    store.tickets.push(ticket);
    saveTickets(config, store);

    const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket aperto')
        .setDescription(`Ciao ${interaction.user}, descrivi il problema in modo chiaro. Lo staff ti risponderà appena possibile.`)
        .setColor(0x2ecc71)
        .addFields({ name: 'Utente', value: `${interaction.user.tag} (${interaction.user.id})` });

    await channel.send({ content: `${interaction.user}${staffRoleId ? ` <@&${staffRoleId}>` : ''}`, embeds: [embed], components: buildCloseButton(), allowedMentions: { users: [interaction.user.id], roles: staffRoleId ? [staffRoleId] : [] } });
    return sendEphemeral(interaction, `Ticket creato: ${channel}.`);
}

async function fetchTranscript(channel) {
    const transcript = [];
    let before;

    while (transcript.length < MAX_TRANSCRIPT_MESSAGES) {
        const batch = await channel.messages.fetch({ limit: Math.min(100, MAX_TRANSCRIPT_MESSAGES - transcript.length), before }).catch(() => null);
        if (!batch || batch.size === 0) break;
        for (const message of batch.values()) {
            transcript.push({
                id: message.id,
                authorId: message.author?.id || null,
                authorTag: message.author?.tag || 'Sconosciuto',
                content: message.content || '',
                attachments: [...message.attachments.values()].map(attachment => ({ name: attachment.name, url: attachment.url, contentType: attachment.contentType || null })),
                createdAt: message.createdTimestamp
            });
        }
        before = batch.last().id;
    }

    return transcript.sort((a, b) => a.createdAt - b.createdAt);
}

async function closeTicket(interaction, config) {
    const store = loadTickets(config);
    const ticket = findTicketByChannel(store, interaction.channelId);
    if (!ticket) return sendEphemeral(interaction, 'Questo canale non risulta essere un ticket aperto.');
    if (interaction.user.id !== ticket.ownerId && !canManageTickets(interaction.member, config)) {
        return sendEphemeral(interaction, 'Non hai i permessi per chiudere questo ticket.');
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    ticket.status = 'closed';
    ticket.closedAt = Date.now();
    ticket.closedBy = interaction.user.id;
    ticket.closeReason = 'Chiuso tramite pulsante Discord';
    ticket.transcript = await fetchTranscript(interaction.channel);
    saveTickets(config, store);

    const logChannel = config.ticketLogChannelId
        ? await interaction.client.channels.fetch(config.ticketLogChannelId).catch(() => null)
        : null;
    if (logChannel?.isTextBased()) {
        await logChannel.send(`🔒 Ticket di <@${ticket.ownerId}> chiuso da <@${interaction.user.id}>. Messaggi salvati in JSON: ${ticket.transcript.length}.`);
    }

    await interaction.followUp({ content: 'Ticket salvato in JSON e chiusura del canale in corso.', flags: MessageFlags.Ephemeral });
    setTimeout(() => {
        interaction.channel.delete(`Ticket chiuso da ${interaction.user.tag}`).catch(() => null);
    }, 3000);
    return true;
}

async function handleTicketInteraction(interaction, config) {
    if (!interaction.isButton()) return false;
    if (interaction.customId === TICKET_CREATE_BUTTON_ID) {
        await createTicket(interaction, config);
        return true;
    }
    if (interaction.customId === TICKET_CLOSE_BUTTON_ID) {
        await closeTicket(interaction, config);
        return true;
    }
    return false;
}

async function handleTicketPanelCommand(client, message, config) {
    if (!canManageTickets(message.member, config)) {
        await message.reply('❌ Non hai i permessi per pubblicare il pannello ticket.');
        return true;
    }

    const sent = await message.channel.send(buildTicketPanel());
    const store = loadTickets(config);
    store.meta.panelMessageId = sent.id;
    saveTickets(config, store);
    await message.reply('✅ Pannello ticket pubblicato e salvato in JSON.');
    return true;
}

module.exports = {
    isDiscordSnowflake,
    bootstrapTickets,
    handleTicketInteraction,
    handleTicketPanelCommand,
    loadTickets,
    saveTickets
};
