const axios = require('axios');
const fs = require('fs');
const config = require('../config/env');

let accessToken = '';

function loadCache() {
    try {
        const data = fs.readFileSync(config.paths.twitchLiveCacheFile, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function saveCache(liveList) {
    fs.writeFileSync(config.paths.twitchLiveCacheFile, JSON.stringify(liveList, null, 2));
}

// Recupera token da Twitch
async function getAccessToken() {
    const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
        params: {
            client_id: config.twitch.clientId,
            client_secret: config.twitch.clientSecret,
            grant_type: 'client_credentials'
        }
    });
    accessToken = res.data.access_token;
}

// Controlla lo stato live e invia embed se necessario
async function checkLiveStatus(client) {
    if (!config.twitch.clientId || !config.twitch.clientSecret || !config.twitch.discordChannelId) return;
    if (config.twitch.streamers.length === 0) return;
    if (!accessToken) await getAccessToken();

    const discordChannel = await client.channels.fetch(config.twitch.discordChannelId);
    let activeStreams = loadCache();

    for (const streamer of config.twitch.streamers) {
        try {
            const res = await axios.get('https://api.twitch.tv/helix/streams', {
                headers: {
                    'Client-ID': config.twitch.clientId,
                    Authorization: `Bearer ${accessToken}`
                },
                params: { user_login: streamer }
            });

            const streamData = res.data.data[0];

            if (streamData && !activeStreams.includes(streamer)) {
                // È andato in live ora
                activeStreams.push(streamer);
                saveCache(activeStreams);

                const embed = {
                    title: `${streamData.user_name} è in diretta!`,
                    url: `https://twitch.tv/${streamData.user_name}`,
                    description: streamData.title,
                    color: 6570404,
                    image: {
                        url: streamData.thumbnail_url
                            .replace('{width}', '1280')
                            .replace('{height}', '720')
                    },
                    footer: { text: '🔴 LIVE su Twitch' },
                    timestamp: new Date()
                };

                await discordChannel.send({ embeds: [embed] });
                console.log(`🔔 Notifica live inviata per ${streamer}`);
            }

            if (!streamData && activeStreams.includes(streamer)) {
                // Non è più live
                activeStreams = activeStreams.filter(s => s !== streamer);
                saveCache(activeStreams);
                console.log(`📴 ${streamer} è andato offline.`);
            }

        } catch (err) {
            console.warn(`⚠️ Errore nel controllo di ${streamer}:`, err.response?.data || err.message);
        }
    }
}

module.exports = { checkLiveStatus };
