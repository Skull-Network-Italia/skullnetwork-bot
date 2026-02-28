const fs = require('fs');
const config = require('../config/env');

const forbiddenLinks = JSON.parse(fs.readFileSync(config.paths.forbiddenLinksFile, 'utf8'));
const userViolations = {};

module.exports = async function linkScanner(message, client) {
    if (message.author.bot || !message.guild) return;

    const content = message.content.toLowerCase();

    for (const link of forbiddenLinks) {
        if (!content.includes(link)) continue;

        await message.delete();
        const userId = message.author.id;
        userViolations[userId] = (userViolations[userId] || 0) + 1;
        const violationCount = userViolations[userId];

        const logChannel = await client.channels.fetch(config.logChannelId);
        if (logChannel) {
            logChannel.send(`⚠️ **${message.author.tag}** ha tentato di inviare un link proibito: \`${link}\` (violazioni: ${violationCount})`);
        }

        if (violationCount >= 3) {
            const member = await message.guild.members.fetch(userId);
            if (member && member.bannable) {
                await member.ban({ reason: 'Invio ripetuto di link non autorizzati' });
                logChannel?.send(`🔨 L'utente **${message.author.tag}** è stato **bannato permanentemente** per spam di link vietati.`);
            }
        } else {
            try {
                await message.author.send('❌ Il link che hai provato a inviare è **vietato** su questo server. Dopo 3 tentativi verrai bannato.');
            } catch {
                console.warn(`Impossibile inviare DM a ${message.author.tag}`);
            }
        }

        break;
    }
};