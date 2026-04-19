const axios = require('axios');

function extractTruckersmpId(link) {
    try {
        const parsed = new URL(link);
        const match = parsed.pathname.match(/\/events\/(\d+)/i);
        return match ? Number(match[1]) : null;
    } catch {
        return null;
    }
}

function parseJsonLdEvent(html) {
    const match = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) return null;

    try {
        const json = JSON.parse(match[1]);
        const event = Array.isArray(json) ? json.find(item => item?.['@type'] === 'Event') : json;
        if (!event?.startDate) return null;

        return {
            titolo: event.name || 'Evento TruckersMP',
            startDate: event.startDate,
            server: event.location?.name || 'N/D',
            game: 'N/D',
            partenza: 'N/D',
            destinazione: 'N/D'
        };
    } catch {
        return null;
    }
}

function parseNextData(html) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
    if (!match) return null;

    try {
        const data = JSON.parse(match[1]);
        const event = data?.props?.pageProps?.event;
        if (!event) return null;

        return {
            titolo: event.name || event.title || 'Evento TruckersMP',
            startDate: event.start_at || event.startAt || event.startDate,
            server: event.server?.name || event.server_name || 'N/D',
            game: event.game?.name || event.game || 'N/D',
            partenza: event.departure?.name || event.departure || event.route?.departure || 'N/D',
            destinazione: event.destination?.name || event.destination || event.route?.destination || 'N/D'
        };
    } catch {
        return null;
    }
}

function formatLocalDate(dateMs, locale = 'it-IT', timeZone = 'Europe/Rome') {
    return new Intl.DateTimeFormat(locale, {
        timeZone,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(dateMs));
}

async function parseTruckersmpEvent(link) {
    const truckersmpId = extractTruckersmpId(link);
    if (!truckersmpId) {
        throw new Error('Link TruckersMP non valido. Usa un link evento tipo https://truckersmp.com/events/12345');
    }

    const response = await axios.get(link, {
        timeout: 10000,
        maxContentLength: 2_000_000,
        headers: {
            'User-Agent': 'SkullNetworkBot/1.0 (+Discord Integration)'
        },
        validateStatus: status => status >= 200 && status < 400
    });

    const html = String(response.data || '');
    const parsed = parseNextData(html) || parseJsonLdEvent(html);

    if (!parsed || !parsed.startDate) {
        throw new Error('Impossibile leggere i dati evento TruckersMP. Verifica che la pagina sia pubblica.');
    }

    const dateMs = Date.parse(parsed.startDate);
    if (!Number.isFinite(dateMs)) {
        throw new Error('Data evento non valida nel link TruckersMP.');
    }

    return {
        truckersmp_id: truckersmpId,
        titolo: parsed.titolo,
        data_utc: dateMs,
        data_locale: formatLocalDate(dateMs),
        game: parsed.game,
        server: parsed.server,
        partenza: parsed.partenza,
        destinazione: parsed.destinazione,
        link
    };
}

module.exports = {
    parseTruckersmpEvent
};
