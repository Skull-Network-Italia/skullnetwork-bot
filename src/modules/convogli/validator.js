const { findConflicts } = require('./conflict');
const { getCountersForDate } = require('./calendar');

function getLocalTimeParts(dateMs, timeZone = 'Europe/Rome') {
    const formatter = new Intl.DateTimeFormat('it-IT', {
        timeZone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
    });

    const parts = formatter.formatToParts(new Date(dateMs));
    const hour = Number(parts.find(p => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find(p => p.type === 'minute')?.value || 0);
    return { hour, minute };
}

function validateConvoglio({ store, parsedEvent, vtcName, isPartner }) {
    const errors = [];

    const duplicate = store.events.find(event => Number(event.truckersmp_id) === Number(parsedEvent.truckersmp_id));
    if (duplicate) {
        errors.push('Evento già presente: questo truckersmp_id è già salvato.');
    }

    const localTime = getLocalTimeParts(parsedEvent.data_utc);
    const totalMinutes = localTime.hour * 60 + localTime.minute;
    const minAllowed = 19 * 60;
    const maxAllowed = 21 * 60 + 30;
    if (totalMinutes < minAllowed || totalMinutes > maxAllowed) {
        errors.push('Orario non consentito: il convoglio deve essere tra le 19:00 e le 21:30 (ora italiana).');
    }

    const counters = getCountersForDate(store, parsedEvent.data_utc);
    if (!isPartner) {
        if (counters.weekCount >= 3) errors.push('Limite settimanale raggiunto (3/3).');
        if (counters.monthCount >= 12) errors.push('Limite mensile raggiunto (12/12).');
    }

    const conflicts = findConflicts(store.events, parsedEvent.data_utc, 90);
    if (conflicts.hasConflict && !isPartner) {
        errors.push('Conflitto orario: esiste già un evento a meno di 90 minuti.');
    }

    return {
        isValid: errors.length === 0,
        errors,
        counters,
        conflicts,
        availabilityContext: {
            weekCount: counters.weekCount,
            monthCount: counters.monthCount,
            hasHardConflict: conflicts.hasConflict && !isPartner,
            hasNearEvent: conflicts.hasConflict && isPartner,
            organizer: vtcName
        }
    };
}

module.exports = {
    validateConvoglio
};
