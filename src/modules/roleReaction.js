const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

const config = require('../config/env');

async function setupRoleReaction(client) {
    const channelId = config.roleReactionChannelId;
    const rolesMap = Object.fromEntries(
        Object.entries(config.roleByEmoji).filter(([, roleId]) => Boolean(roleId))
    );

    if (!channelId || Object.keys(rolesMap).length === 0) {
        console.warn('⚠️ Role reaction non configurata: ROLE_REACTION_CHANNEL_ID o ruoli mancanti nel .env.');
        return;
    }

    let savedData = {};
    if (fs.existsSync(config.paths.reactionMessageFile)) {
        savedData = JSON.parse(fs.readFileSync(config.paths.reactionMessageFile, 'utf8'));
    }

    const channel = await client.channels.fetch(channelId);
    let message;

    if (savedData.messageId) {
        try {
            message = await channel.messages.fetch(savedData.messageId);
            console.log('✅ Messaggio role reaction recuperato.');
        } catch {
            console.warn('⚠️ Impossibile recuperare il messaggio, ne creo uno nuovo.');
        }
    }

    if (!message) {
        const embed = new EmbedBuilder()
            .setTitle('🎮 Seleziona i tuoi giochi preferiti')
            .setDescription(`
Clicca per ricevere il ruolo:
🚛 - ETS2 / ATS
🚜 - FS22
⚓ - World of Warships
🚗 - Assetto Corsa
✈️ - Microsoft Flight Simulator
🎮 - Rainbow Six Siege
🛠️ - Minecraft
💀 - FiveM
            `)
            .setColor(0x2F3136);

        message = await channel.send({ embeds: [embed] });
            fs.writeFileSync(config.paths.reactionMessageFile, JSON.stringify({ messageId: message.id }, null, 2));

        for (const emoji of Object.keys(rolesMap)) {
            await message.react(emoji);
        }
        console.log('✅ Nuovo messaggio role reaction creato e salvato.');
    }

    client.on('messageReactionAdd', async (reaction, user) => {
        if (reaction.message.id !== message.id || user.bot) return;
        const roleId = rolesMap[reaction.emoji.name];
        if (!roleId) return;
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.add(roleId).catch(console.error);
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        if (reaction.message.id !== message.id || user.bot) return;
        const roleId = rolesMap[reaction.emoji.name];
        if (!roleId) return;
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.remove(roleId).catch(console.error);
    });

    client.on('guildMemberRemove', async member => {
        const trackedReactions = message.reactions.cache.filter(reaction => rolesMap[reaction.emoji.name]);

        for (const reaction of trackedReactions.values()) {
            await reaction.users.remove(member.id).catch(err => {
                console.error(`Errore rimozione reaction ${reaction.emoji.name} per ${member.id}:`, err);
            });
        }
    });
}

module.exports = setupRoleReaction;
