const { EmbedBuilder } = require('discord.js');
const { loadConvogli, saveConvogli, refreshCalendarMessage } = require('./calendar');
const { disableComponents } = require('./modal');

function canModerateConvogli(member, config) {
    if (!member) return false;
    if (member.id === config.ownerId) return true;
    return member.roles?.cache?.has(config.staffRoleId);
}

async function approveRequest({ interaction, requestId, config, client }) {
    const store = loadConvogli(config);
    const request = store.requests.find(item => item.id === requestId);

    if (!request) throw new Error('Richiesta non trovata.');
    if (request.status !== 'pending') throw new Error('Richiesta già gestita.');

    const event = {
        ...request.event,
        settimana: request.counters.weekCount,
        mese: request.counters.monthCount,
        organizzatore: request.vtcName,
        partner: request.partner,
        discord_code: request.discordCode,
        status: 'approved',
        reminders: {
            daily: false,
            h24: false,
            h2: false,
            m15: false
        }
    };

    store.events.push(event);
    request.status = 'approved';
    request.reviewedBy = interaction.user.id;
    request.reviewedAt = Date.now();
    saveConvogli(config, store);

    const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0x2ecc71)
        .setFooter({ text: `APPROVATO da ${interaction.user.tag}` });

    await interaction.update({ embeds: [approvedEmbed], components: disableComponents(interaction.message.components) });
    await refreshCalendarMessage(client, config);
}

async function rejectRequest({ interaction, requestId, reason, config, client }) {
    const store = loadConvogli(config);
    const request = store.requests.find(item => item.id === requestId);

    if (!request) throw new Error('Richiesta non trovata.');
    if (request.status !== 'pending') throw new Error('Richiesta già gestita.');

    request.status = 'rejected';
    request.rejectionReason = reason;
    request.reviewedBy = interaction.user.id;
    request.reviewedAt = Date.now();

    saveConvogli(config, store);

    const inviteChannel = await client.channels.fetch(config.channels.inviti).catch(() => null);
    const sourceMessage = request.messageId && inviteChannel?.isTextBased()
        ? await inviteChannel.messages.fetch(request.messageId).catch(() => null)
        : null;

    if (sourceMessage?.embeds?.[0]) {
        const rejectedEmbed = EmbedBuilder.from(sourceMessage.embeds[0])
            .setColor(0xe74c3c)
            .addFields({ name: 'Esito', value: `RIFIUTATO - Motivo: ${reason}` })
            .setFooter({ text: `RIFIUTATO da ${interaction.user.tag}` });

        await sourceMessage.edit({ embeds: [rejectedEmbed], components: disableComponents(sourceMessage.components) });
    }

    await refreshCalendarMessage(client, config);

    if (config.channels.log) {
        const logChannel = await client.channels.fetch(config.channels.log).catch(() => null);
        if (logChannel?.isTextBased()) {
            await logChannel.send(`❌ Convoglio rifiutato (${request.vtcName}) da <@${interaction.user.id}>. Motivo: ${reason}`);
        }
    }
}

module.exports = {
    canModerateConvogli,
    approveRequest,
    rejectRequest
};
