const fs = require('fs');
const { EmbedBuilder } = require('discord.js');

const config = require('../config/env');

function buildRoleReactionEmbed() {
    return new EmbedBuilder()
        .setTitle('🎮 Seleziona i tuoi giochi e le tue community')
        .setDescription(`
Clicca per ricevere o rimuovere il ruolo:
🚛 - ETS2 / ATS
🚜 - FS22
⚓ - World of Warships
🚗 - Assetto Corsa
✈️ - Microsoft Flight Simulator
🎮 - Rainbow Six Siege
🛠️ - Minecraft
💀 - FiveM
🇧🇬 - Bulgarian Community
🇩🇪 - German Community
        `)
        .setColor(0x2F3136);
}

async function setupRoleReaction(client) {
    const channelId = config.roleReactionChannelId;
    const rolesMap = Object.fromEntries(
        Object.entries(config.roleByEmoji).filter(([, roleId]) => Boolean(roleId))
    );

    if (!channelId || Object.keys(rolesMap).length === 0) {
        console.warn('⚠️ Role reaction non configurata: canale o ruoli mancanti.');
        return;
    }

    let savedData = {};
    if (fs.existsSync(config.paths.reactionMessageFile)) {
        try {
            savedData = JSON.parse(fs.readFileSync(config.paths.reactionMessageFile, 'utf8'));
        } catch (error) {
            console.warn('⚠️ File del messaggio role reaction non valido, ne verrà creato uno nuovo.', error.message);
        }
    }

    const channel = await client.channels.fetch(channelId).catch(error => {
        console.error(`Errore recupero canale role reaction ${channelId}:`, error);
        return null;
    });
    if (!channel?.isTextBased() || !channel.messages) {
        console.error(`Canale role reaction ${channelId} non trovato o non adatto ai messaggi.`);
        return;
    }

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
        message = await channel.send({ embeds: [buildRoleReactionEmbed()] });
        fs.writeFileSync(config.paths.reactionMessageFile, JSON.stringify({ messageId: message.id }, null, 2));
        console.log('✅ Nuovo messaggio role reaction creato e salvato.');
    } else {
        await message.edit({ embeds: [buildRoleReactionEmbed()] });
    }

    for (const emoji of Object.keys(rolesMap)) {
        const alreadyPresent = message.reactions.cache.some(reaction => reaction.emoji.name === emoji);
        if (!alreadyPresent) await message.react(emoji);
    }

    async function hydrateReaction(reaction) {
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Errore fetch reaction partial:', error);
                return false;
            }
        }
        return true;
    }

    client.on('messageReactionAdd', async (reaction, user) => {
        if (!await hydrateReaction(reaction)) return;
        if (reaction.message.id !== message.id || user.bot) return;
        const roleId = rolesMap[reaction.emoji.name];
        if (!roleId) return;
        const member = await reaction.message.guild.members.fetch(user.id);
        await member.roles.add(roleId).catch(console.error);
    });

    client.on('messageReactionRemove', async (reaction, user) => {
        if (!await hydrateReaction(reaction)) return;
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
