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

    const ritrovoInput = new TextInputBuilder()
        .setCustomId('ritrovo_time')
        .setLabel('Orario ritrovo (HH:mm)')
        .setRequired(true)
        .setMaxLength(5)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('19:30');

    const partenzaInput = new TextInputBuilder()
        .setCustomId('partenza_time')
        .setLabel('Orario partenza (HH:mm)')
        .setRequired(true)
        .setMaxLength(5)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('20:00');

    modal.addComponents(
        new ActionRowBuilder().addComponents(linkInput),
        new ActionRowBuilder().addComponents(discordInput),
        new ActionRowBuilder().addComponents(vtcInput),
        new ActionRowBuilder().addComponents(ritrovoInput),
        new ActionRowBuilder().addComponents(partenzaInput)
    );

    return modal;
}

function createManualFallbackButton() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('convoglio_manual_open')
                .setLabel('✍️ Compila dati manualmente')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function createManualConvoglioModal() {
    const modal = new ModalBuilder()
        .setCustomId('convoglio_manual_modal')
        .setTitle('Convoglio manuale');

    const dateUtcInput = new TextInputBuilder()
        .setCustomId('manual_date_utc')
        .setLabel('Data/Ora UTC (YYYY-MM-DD HH:mm)')
        .setRequired(true)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('2026-05-08 18:30');

    const gameInput = new TextInputBuilder()
        .setCustomId('manual_game')
        .setLabel('Gioco (ETS2/ATS)')
        .setRequired(true)
        .setMaxLength(20)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('ETS2');

    const serverInput = new TextInputBuilder()
        .setCustomId('manual_server')
        .setLabel('Server')
        .setRequired(true)
        .setMaxLength(100)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Simulation 2');

    const departureInput = new TextInputBuilder()
        .setCustomId('manual_departure')
        .setLabel('Partenza')
        .setRequired(true)
        .setMaxLength(100)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Calais');

    const destinationInput = new TextInputBuilder()
        .setCustomId('manual_destination')
        .setLabel('Destinazione')
        .setRequired(true)
        .setMaxLength(100)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Duisburg');

    modal.addComponents(
        new ActionRowBuilder().addComponents(dateUtcInput),
        new ActionRowBuilder().addComponents(gameInput),
        new ActionRowBuilder().addComponents(serverInput),
        new ActionRowBuilder().addComponents(departureInput),
        new ActionRowBuilder().addComponents(destinationInput)
    );

    return modal;
}


function createRemoveByIdModal() {
    const modal = new ModalBuilder()
        .setCustomId('convoglio_remove_by_id_modal')
        .setTitle('Rimuovi Convoglio per ID');

    const idInput = new TextInputBuilder()
        .setCustomId('remove_truckersmp_id')
        .setLabel('TruckersMP ID evento')
        .setRequired(true)
        .setMaxLength(20)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('12345');

    modal.addComponents(new ActionRowBuilder().addComponents(idInput));
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
    const statusLabel = availabilityEmoji === '🟢'
        ? 'Libero'
        : availabilityEmoji === '🟡'
            ? 'Attenzione'
            : 'Critico';

    return new EmbedBuilder()
        .setColor(partner ? 0xf1c40f : 0x3498db)
        .setTitle('📨 Richiesta Convoglio')
        .setDescription(`**${vtcName}** ha inviato una nuova richiesta.`)
        .addFields(
            { name: '🏢 Organizzatore', value: vtcName, inline: true },
            { name: '🤝 Partner', value: partner ? 'Sì' : 'No', inline: true },
            { name: '📊 Stato slot', value: `${availabilityEmoji} ${statusLabel}`, inline: true },
            { name: '🕒 Data/Ora', value: `${event.data_locale} (UTC ${new Date(event.data_utc).toISOString().slice(11, 16)})`, inline: false },
            { name: '⏱️ Ritrovo / Partenza', value: `${event.ritrovo_time || 'N/D'} / ${event.partenza_time || 'N/D'}`, inline: true },
            { name: '🗺️ Tratta', value: `${event.partenza} → ${event.destinazione}`, inline: false },
            { name: '🎮 Setup', value: `${event.game} • ${event.server}`, inline: false },
            { name: '🔗 Link', value: `[TruckersMP](${event.link}) • [Discord](https://discord.gg/${discordCode})`, inline: false },
            { name: '📈 Limiti', value: `Settimana: **${counters.weekCount}/3**
Mese: **${counters.monthCount}/12**`, inline: true }
        )
        .setFooter({ text: 'Usa i pulsanti sotto per approvare o rifiutare' })
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
    createManualFallbackButton,
    createManualConvoglioModal,
    createRemoveByIdModal,
    createRejectModal,
    createRequestEmbed,
    createApprovalButtons,
    disableComponents
};
