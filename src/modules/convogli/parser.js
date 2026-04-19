const axios = require('axios');

const HTTP_OPTIONS = {
    timeout: 10000,
    maxContentLength: 2_000_000,
    headers: {
        'User-Agent': 'SkullNetworkBot/1.0 (+Discord Integration)'
    },
    validateStatus: status => status >= 200 && status < 400
};

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
        const event = data?.props?.pageProps?.event || data?.props?.pageProps?.data?.event;
        if (!event) return null;

        return normalizeEventData(event);
    } catch {
        return null;
    }
}

function parseOpenGraph(html) {
    const title = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i)?.[1];
    const isoDate = html.match(/<meta\s+property="event:start_time"\s+content="([^"]+)"/i)?.[1]
        || html.match(/datetime="([0-9T:+\-\.Z]+)"/i)?.[1];

    if (!title || !isoDate) return null;

    return {
        titolo: title,
        startDate: isoDate,
        server: 'N/D',
        game: 'N/D',
        partenza: 'N/D',
        destinazione: 'N/D'
    };
}

function normalizeEventData(event) {
    const route = event.route || event.map_route || {};
    const startLocation = event.departure || event.departure_location || route.departure || route.start || route.from;
    const endLocation = event.destination || event.arrive || event.destination_location || route.destination || route.end || route.to;

    const toName = value => {
        if (!value) return 'N/D';
        if (typeof value === 'string') return value;
        if (typeof value?.name === 'string') return value.name;
        if (typeof value?.realName === 'string') return value.realName;
        if (typeof value?.city === 'string') return value.city;
        return 'N/D';
    };

    const gameRaw = event.game?.name || event.game || event.simulator;
    const game = typeof gameRaw === 'string'
        ? gameRaw.toUpperCase().includes('ATS') ? 'ATS' : gameRaw.toUpperCase().includes('ETS') ? 'ETS2' : gameRaw
        : 'N/D';

    return {
        titolo: event.name || event.title || 'Evento TruckersMP',
        startDate: event.start_at || event.startAt || event.startDate || event.start_time || event.time,
        server: event.server?.name || event.server_name || event.server || 'N/D',
        game,
        partenza: toName(startLocation),
        destinazione: toName(endLocation)
    };
}

async function fetchFromTruckersmpApi(link, eventId) {
    const urls = [
        `https://truckersmp.com/api/v2/events/${eventId}`,
        `https://truckersmp.com/api/events/${eventId}`,
        `${link.replace(/\/$/, '')}/api`
    ];

    for (const url of urls) {
        try {
            const { data } = await axios.get(url, { ...HTTP_OPTIONS, maxContentLength: 1_000_000 });
            if (!data || typeof data !== 'object') continue;

            const event = data.response || data.data || data.event || data;
            const normalized = normalizeEventData(event);
            if (normalized.startDate) return normalized;
        } catch {
            // fallback al prossimo endpoint
        }
    }

    return null;
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

    const response = await axios.get(link, HTTP_OPTIONS);
    const html = String(response.data || '');

    const parsed = parseNextData(html)
        || parseJsonLdEvent(html)
        || parseOpenGraph(html)
        || await fetchFromTruckersmpApi(link, truckersmpId);

    if (!parsed || !parsed.startDate) {
        throw new Error('Impossibile leggere i dati evento TruckersMP. Il link potrebbe non essere pubblico o il formato pagina è cambiato.');
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
