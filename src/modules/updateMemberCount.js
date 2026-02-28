const config = require('../config/env');

async function updateMemberCount(client) {
    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(config.memberCountChannelId);
        if (!channel) return;

        // membri totali (dato ufficiale Discord)
        const totalMembers = guild.memberCount;

        // bot presenti in cache
        const botCount = guild.members.cache.filter(m => m.user.bot).size;

        const humanCount = totalMembers - botCount;

        await channel.setName(`👥 Membri: ${humanCount}`);
        console.log(`✅ Conteggio membri umani aggiornato: ${humanCount}`);
    } catch (error) {
        console.error("❌ Errore nell'aggiornamento del member count:", error);
    }
}

module.exports = updateMemberCount;
