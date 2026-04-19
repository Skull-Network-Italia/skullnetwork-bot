const { findConflicts } = require('./conflict');
const { getCountersForDate } = require('./calendar');

function isValidTime(value) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim());
}

function validateConvoglio({ store, parsedEvent, vtcName, isPartner }) {
    const errors = [];

    const duplicate = store.events.find(event => Number(event.truckersmp_id) === Number(parsedEvent.truckersmp_id));
    if (duplicate) {
        errors.push('Evento già presente: questo truckersmp_id è già salvato.');
    }

    if (!isValidTime(parsedEvent.ritrovo_time) || !isValidTime(parsedEvent.partenza_time)) {
        errors.push('Orari non validi: specifica ritrovo e partenza nel formato HH:mm.');
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
