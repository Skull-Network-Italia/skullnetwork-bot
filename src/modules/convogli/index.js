const { MessageFlags } = require('discord.js');
const { ensureInviteMessage, refreshCalendarMessage, loadConvogli, saveConvogli, getAvailabilityEmoji } = require('./calendar');
const {
    createSubmitConvoglioModal,
    createManualFallbackButton,
    createManualConvoglioModal,
    createRejectModal,
    createRequestEmbed,
    createApprovalButtons
} = require('./modal');
const { parseTruckersmpEvent } = require('./parser');
const { validateConvoglio } = require('./validator');
const { canModerateConvogli, approveRequest, rejectRequest } = require('./approval');

const manualDrafts = new Map();

function extractTruckersmpIdFromLink(link) {
    const match = link.match(/\/events\/(\d+)/i);
    return match ? Number(match[1]) : null;
}

function sanitizeDiscordCode(raw) {
    return raw.trim().replace(/^https?:\/\/discord\.gg\//i, '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32);
}

function sanitizeVtcName(raw) {
    return raw.trim().replace(/[\n\r\t]/g, ' ').slice(0, 100);
}

function sanitizeTime(value) {
    const raw = String(value || '').trim();
    const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    return match ? raw : '';
}

function parseManualUtc(input) {
    const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (!match) return null;

    const [, year, month, day, hour, minute] = match.map(Number);
    const utcMs = Date.UTC(year, month - 1, day, hour, minute);
    return Number.isFinite(utcMs) ? utcMs : null;
}

function formatLocalDate(dateMs, locale = 'it-IT', timeZone = 'Europe/Rome') {
    return new Intl.DateTimeFormat(locale, {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateMs));
}

async function bootstrapConvogli(client, config) {
    await ensureInviteMessage(client, config);
    await refreshCalendarMessage(client, config);
}

async function createConvoglioRequest({ client, interaction, config, parsedEvent, vtcName, discordCode, ritrovoTime, partenzaTime }) {
    const normalizedEvent = { ...parsedEvent, ritrovo_time: ritrovoTime, partenza_time: partenzaTime };
    const store = loadConvogli(config);
    const isPartner = config.partners.some(partner => partner.toLowerCase() === vtcName.toLowerCase());

    const validation = validateConvoglio({
        store,
        parsedEvent: normalizedEvent,
        vtcName,
        isPartner
    });

    if (!validation.isValid) {
        await interaction.reply({
            content: `Richiesta bloccata:\n- ${validation.errors.join('\n- ')}`,
            flags: MessageFlags.Ephemeral
        });
        return true;
    }

    const availabilityEmoji = getAvailabilityEmoji(validation.availabilityContext);
    const requestId = `${Date.now()}_${interaction.user.id}`;

    const request = {
        id: requestId,
        userId: interaction.user.id,
        vtcName,
        discordCode,
        partner: isPartner,
        counters: validation.counters,
        event: normalizedEvent,
        status: 'pending',
        createdAt: Date.now()
    };

    store.requests.push(request);
    saveConvogli(config, store);

    const inviteChannel = await client.channels.fetch(config.channels.inviti).catch(() => null);
    if (!inviteChannel || !inviteChannel.isTextBased()) {
        await interaction.reply({ content: 'Canale inviti non disponibile.', flags: MessageFlags.Ephemeral });
        return true;
    }

    const sentMessage = await inviteChannel.send({
        embeds: [createRequestEmbed({
            event: normalizedEvent,
            vtcName,
            discordCode,
            availabilityEmoji,
            counters: validation.counters,
            partner: isPartner
        })],
        components: createApprovalButtons(requestId)
    });

    const freshStore = loadConvogli(config);
    const storedRequest = freshStore.requests.find(item => item.id === requestId);
    if (storedRequest) {
        storedRequest.messageId = sentMessage.id;
        saveConvogli(config, freshStore);
    }

    await interaction.reply({ content: 'Richiesta inviata correttamente allo staff ✅', flags: MessageFlags.Ephemeral });
    return true;
}

async function handleConvogliInteraction(interaction, client, config) {
    if (interaction.isButton()) {
        if (interaction.customId === 'convoglio_submit_btn') {
            await interaction.showModal(createSubmitConvoglioModal());
            return true;
        }

        if (interaction.customId === 'convoglio_manual_open') {
            const draft = manualDrafts.get(interaction.user.id);
            if (!draft || (Date.now() - draft.createdAt) > 10 * 60 * 1000) {
                manualDrafts.delete(interaction.user.id);
                await interaction.reply({
                    content: 'Sessione manuale scaduta. Reinvia il convoglio dal pulsante principale.',
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }

            await interaction.showModal(createManualConvoglioModal());
            return true;
        }

        if (interaction.customId.startsWith('convoglio_approve:') || interaction.customId.startsWith('convoglio_reject:')) {
            if (!canModerateConvogli(interaction.member, config)) {
                await interaction.reply({ content: 'Non hai i permessi per approvare/rifiutare i convogli.', flags: MessageFlags.Ephemeral });
                return true;
            }

            const requestId = interaction.customId.split(':')[1];

            if (interaction.customId.startsWith('convoglio_approve:')) {
                await approveRequest({ interaction, requestId, config, client });
                return true;
            }

            await interaction.showModal(createRejectModal(requestId));
            return true;
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'convoglio_submit_modal') {
            const link = interaction.fields.getTextInputValue('truckersmp_link').trim();
            const discordCode = sanitizeDiscordCode(interaction.fields.getTextInputValue('discord_code'));
            const vtcName = sanitizeVtcName(interaction.fields.getTextInputValue('vtc_name'));
            const ritrovoTime = sanitizeTime(interaction.fields.getTextInputValue('ritrovo_time'));
            const partenzaTime = sanitizeTime(interaction.fields.getTextInputValue('partenza_time'));

            if (!discordCode || !vtcName || !ritrovoTime || !partenzaTime) {
                await interaction.reply({ content: 'Dati non validi: controlla codice Discord, nome VTC, orario ritrovo e orario partenza (HH:mm).', flags: MessageFlags.Ephemeral });
                return true;
            }

            try {
                const parsedEvent = await parseTruckersmpEvent(link);
                return await createConvoglioRequest({ client, interaction, config, parsedEvent, vtcName, discordCode, ritrovoTime, partenzaTime });
            } catch (error) {
                manualDrafts.set(interaction.user.id, { link, discordCode, vtcName, ritrovoTime, partenzaTime, createdAt: Date.now() });

                await interaction.reply({
                    content: `Parser automatico non riuscito (${error.message}). Puoi completare l'invio in modalità manuale.`,
                    components: createManualFallbackButton(),
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
        }

        if (interaction.customId === 'convoglio_manual_modal') {
            const draft = manualDrafts.get(interaction.user.id);
            if (!draft) {
                await interaction.reply({ content: 'Bozza manuale non trovata. Riprova dal pulsante invio.', flags: MessageFlags.Ephemeral });
                return true;
            }

            const manualUtc = parseManualUtc(interaction.fields.getTextInputValue('manual_date_utc'));
            if (!manualUtc) {
                await interaction.reply({ content: 'Formato data UTC non valido. Usa YYYY-MM-DD HH:mm', flags: MessageFlags.Ephemeral });
                return true;
            }

            const manualEvent = {
                truckersmp_id: extractTruckersmpIdFromLink(draft.link) || Date.now(),
                titolo: `Evento manuale ${draft.vtcName}`,
                data_utc: manualUtc,
                data_locale: formatLocalDate(manualUtc),
                game: interaction.fields.getTextInputValue('manual_game').trim().toUpperCase(),
                server: interaction.fields.getTextInputValue('manual_server').trim(),
                partenza: interaction.fields.getTextInputValue('manual_departure').trim(),
                destinazione: interaction.fields.getTextInputValue('manual_destination').trim(),
                link: draft.link
            };

            manualDrafts.delete(interaction.user.id);
            return await createConvoglioRequest({
                client,
                interaction,
                config,
                parsedEvent: manualEvent,
                vtcName: draft.vtcName,
                discordCode: draft.discordCode,
                ritrovoTime: draft.ritrovoTime,
                partenzaTime: draft.partenzaTime
            });
        }

        if (interaction.customId.startsWith('convoglio_reject_modal:')) {
            if (!canModerateConvogli(interaction.member, config)) {
                await interaction.reply({ content: 'Non hai i permessi per rifiutare i convogli.', flags: MessageFlags.Ephemeral });
                return true;
            }

            const requestId = interaction.customId.split(':')[1];
            const reason = interaction.fields.getTextInputValue('reject_reason').trim();

            if (!reason) {
                await interaction.reply({ content: 'Motivo rifiuto obbligatorio.', flags: MessageFlags.Ephemeral });
                return true;
            }

            try {
                await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                await rejectRequest({ interaction, requestId, reason, config, client });
                await interaction.editReply({ content: 'Richiesta rifiutata correttamente.' });
                return true;
            } catch (error) {
                await interaction.editReply({ content: `Errore rifiuto: ${error.message}` });
                return true;
            }
        }
    }

    return false;
}

module.exports = {
    bootstrapConvogli,
    handleConvogliInteraction
};
