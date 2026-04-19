const cron = require('cron');
const { loadConvogli, saveConvogli } = require('../modules/convogli/calendar');

function getRomeDateParts(dateMs) {
    const dtf = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Rome',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    const parts = dtf.formatToParts(new Date(dateMs));
    const get = type => parts.find(p => p.type === type)?.value;
    return {
        ymd: `${get('year')}-${get('month')}-${get('day')}`,
        hour: Number(get('hour')),
        minute: Number(get('minute'))
    };
}

async function sendReminder(channel, event, label) {
    await channel.send(`⏰ **Reminder ${label}**\n**${event.organizzatore}** - ${event.data_locale}\n${event.partenza} → ${event.destinazione}\n${event.link}\ndiscord.gg/${event.discord_code}`);
}

async function runReminders(client, config) {
    const channel = await client.channels.fetch(config.channels.calendario).catch(() => null);
    if (!channel || !channel.isTextBased()) return;

    const now = Date.now();
    const nowRome = getRomeDateParts(now);

    const store = loadConvogli(config);
    let changed = false;

    for (const event of store.events) {
        if (event.status !== 'approved') continue;
        if (!event.reminders) event.reminders = { daily: false, h24: false, h2: false, m15: false };

        const delta = Number(event.data_utc) - now;
        if (delta < -2 * 60 * 60 * 1000) continue;

        const eventRome = getRomeDateParts(event.data_utc);
        const isSameDay = eventRome.ymd === nowRome.ymd;

        if (!event.reminders.daily && isSameDay && nowRome.hour >= 9) {
            await sendReminder(channel, event, 'giornaliero');
            event.reminders.daily = true;
            changed = true;
        }

        if (!event.reminders.h24 && delta <= 24 * 60 * 60 * 1000 && delta > 23 * 60 * 60 * 1000) {
            await sendReminder(channel, event, '24h');
            event.reminders.h24 = true;
            changed = true;
        }

        if (!event.reminders.h2 && delta <= 2 * 60 * 60 * 1000 && delta > 115 * 60 * 1000) {
            await sendReminder(channel, event, '2h');
            event.reminders.h2 = true;
            changed = true;
        }

        if (!event.reminders.m15 && delta <= 15 * 60 * 1000 && delta > 10 * 60 * 1000) {
            await sendReminder(channel, event, '15 minuti');
            event.reminders.m15 = true;
            changed = true;
        }
    }

    if (changed) saveConvogli(config, store);
}

function startReminders(client, config) {
    const job = new cron.CronJob('*/5 * * * *', () => runReminders(client, config).catch(error => {
        console.error('Errore scheduler reminders convogli:', error);
    }), null, true, 'Europe/Rome');

    job.start();
    return job;
}

module.exports = {
    startReminders,
    runReminders
};
