const { EmbedBuilder } = require('discord.js');

module.exports = async function handleRulesDsCommand(message) {
    if (!message.guild) {
        return;
    }

    if (message.author.id !== message.guild.ownerId) {
        return message.reply('❌ Questo comando può essere usato solo dal proprietario del server.');
    }

    const embed = new EmbedBuilder()
        .setColor(0x0b3b73)
        .setTitle('📜 Regolamento Discord')
        .setDescription('Regole obbligatorie per mantenere un ambiente sicuro, rispettoso e trasparente. L\'accesso alla community implica l\'accettazione integrale di questo regolamento.')
        .addFields(
            {
                name: '1) 🔒 Comportamento generale',
                value: [
                    '• **Rispetto reciproco:** vietati insulti, minacce, discriminazioni e molestie.',
                    '• **Contenuti vietati:** proibiti contenuti NSFW, illeciti, estremisti o che incitano all\'odio.',
                    '• **No spam/flood:** niente messaggi ripetitivi, advertising non autorizzato o bot non consentiti.'
                ].join('\n')
            },
            {
                name: '2) 📢 Canali, DM e tutela utenti',
                value: [
                    '• **Canali corretti:** usa ogni canale secondo il suo scopo.',
                    '• **DM insistenti vietati:** non contattare privatamente utenti che non desiderano ricevere messaggi.',
                    '• **Tutela utenti 16-18:** vietati poaching, pressioni o contatti inappropriati verso minorenni.',
                    '• **Dati sensibili:** non chiedere password o informazioni personali ad altri membri.',
                    '• **Accesso ai ticket:** puoi aprire segnalazioni solo dopo registrazione e login al sito.',
                    '• **Nota importante:** se ricevi messaggi indesiderati, non rispondere e segnala allo staff con screenshot, timestamp e ID utente.'
                ].join('\n')
            },
            {
                name: '3) ⚖️ Segnalazioni, moderazione e sanzioni',
                value: [
                    '• **Segnalazioni:** invia dettagli e prove direttamente dal sito tramite l\'opzione **Ticket**.',
                    '  ◦ Per inviare un ticket è obbligatorio essere registrati ed effettuare il login al sito.',
                    '  ◦ Includi nome utente, ID Discord, descrizione e prove.',
                    '  ◦ Conserva le conversazioni originali senza alterarle.',
                    '• **Sanzioni possibili:** avviso, mute/kick/ban temporaneo, ban permanente per violazioni gravi o recidive.',
                    '• **Appello:** è possibile chiedere revisione allo staff con motivazione e prove.'
                ].join('\n')
            }
        )
        .setFooter({ text: 'Questo regolamento aderisce ai Termini e alle Linee Guida ufficiali Discord e può essere aggiornato nel tempo.' })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    return message.reply('✅ Regolamento inviato correttamente in formato embed.');
};