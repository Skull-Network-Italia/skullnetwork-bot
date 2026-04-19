const {
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

function createSubmitConvoglioModal() {
    const modal = new ModalBuilder()
        .setCustomId('convoglio_submit_modal')
        .setTitle('Invio Convoglio');

    const linkInput = new TextInputBuilder()
        .setCustomId('truckersmp_link')
        .setLabel('Link evento TruckersMP')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('https://truckersmp.com/events/12345');

    const discordInput = new TextInputBuilder()
        .setCustomId('discord_code')
        .setLabel('Codice Discord (solo finale)')
        .setRequired(true)
        .setMaxLength(32)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('abc123');

    const vtcInput = new TextInputBuilder()
        .setCustomId('vtc_name')
        .setLabel('Nome VTC')
        .setRequired(true)
        .setMaxLength(100)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Skull Network');

    modal.addComponents(
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(discordInput),
        new ActionRowBuilder().addComponents(vtcInput)
    );

    return modal;
}

function createRejectModal(requestId) {
    const modal = new ModalBuilder()
        .setCustomId(`convoglio_reject_modal:${requestId}`)
        .setTitle('Rifiuto Convoglio');

    const reasonInput = new TextInputBuilder()
        .setCustomId('reject_reason')
        .setLabel('Motivo rifiuto')
        .setRequired(true)
        .setMaxLength(300)
        .setStyle(TextInputStyle.Paragraph);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    return modal;
}

function createRequestEmbed({ event, vtcName, discordCode, availabilityEmoji, counters, partner }) {
    return new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('📩 Nuova richiesta convoglio')
        .addFields(
            { name: 'Nome VTC', value: vtcName, inline: true },
            { name: 'Partner', value: partner ? 'Sì' : 'No', inline: true },
            { name: 'Stato', value: availabilityEmoji, inline: true },
            { name: 'Data/Ora', value: `${event.data_locale} (UTC: ${new Date(event.data_utc).toISOString().slice(11, 16)})`, inline: false },
            { name: 'Tratta', value: `${event.partenza} → ${event.destinazione}`, inline: false },
            { name: 'Gioco', value: `${event.game} • ${event.server}`, inline: false },
            { name: 'TruckersMP', value: event.link, inline: false },
            { name: 'Discord', value: `discord.gg/${discordCode}`, inline: true },
            { name: 'Contatori', value: `Settimana: ${counters.weekCount}/3\nMese: ${counters.monthCount}/12`, inline: true }
        )
        .setTimestamp();
}

function createApprovalButtons(requestId) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`convoglio_approve:${requestId}`)
                .setLabel('✅ Approva')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`convoglio_reject:${requestId}`)
                .setLabel('❌ Rifiuta')
                .setStyle(ButtonStyle.Danger)
        )
    ];
}

function disableComponents(components) {
    return (components || []).map(row => {
        const disabledButtons = row.components.map(component => ButtonBuilder.from(component).setDisabled(true));
        return new ActionRowBuilder().addComponents(disabledButtons);
    });
}

module.exports = {
    createSubmitConvoglioModal,
    createRejectModal,
    createRequestEmbed,
    createApprovalButtons,
    disableComponents
};
