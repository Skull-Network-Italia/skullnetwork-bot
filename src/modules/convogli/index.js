const { MessageFlags } = require('discord.js');
const { ensureInviteMessage, refreshCalendarMessage, loadConvogli, saveConvogli, getAvailabilityEmoji } = require('./calendar');
const { createSubmitConvoglioModal, createRejectModal, createRequestEmbed, createApprovalButtons } = require('./modal');
const { parseTruckersmpEvent } = require('./parser');
const { validateConvoglio } = require('./validator');
const { canModerateConvogli, approveRequest, rejectRequest } = require('./approval');

function sanitizeDiscordCode(raw) {
    return raw.trim().replace(/^https?:\/\/discord\.gg\//i, '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 32);
}

function sanitizeVtcName(raw) {
    return raw.trim().replace(/[\n\r\t]/g, ' ').slice(0, 100);
}

async function bootstrapConvogli(client, config) {
    await ensureInviteMessage(client, config);
    await refreshCalendarMessage(client, config);
}

async function handleConvogliInteraction(interaction, client, config) {
    if (interaction.isButton()) {
        if (interaction.customId === 'convoglio_submit_btn') {
            await interaction.showModal(createSubmitConvoglioModal());
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

            if (!discordCode || !vtcName) {
                await interaction.reply({ content: 'Codice Discord o nome VTC non validi.', flags: MessageFlags.Ephemeral });
                return true;
            }

            try {
                const parsedEvent = await parseTruckersmpEvent(link);
                const store = loadConvogli(config);
                const isPartner = config.partners.some(partner => partner.toLowerCase() === vtcName.toLowerCase());

                const validation = validateConvoglio({
                    store,
                    parsedEvent,
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
                    event: parsedEvent,
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
                        event: parsedEvent,
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
            } catch (error) {
                await interaction.reply({
                    content: `Errore durante il parsing/validazione: ${error.message}`,
                    flags: MessageFlags.Ephemeral
                });
                return true;
            }
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
