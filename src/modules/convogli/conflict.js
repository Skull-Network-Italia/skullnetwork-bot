function findConflicts(events, targetDateUtc, thresholdMinutes = 90) {
    const thresholdMs = thresholdMinutes * 60 * 1000;

    const neighbors = events
        .filter(event => event.status === 'approved')
        .map(event => ({ event, deltaMs: Math.abs(Number(event.data_utc) - Number(targetDateUtc)) }))
        .filter(item => item.deltaMs < thresholdMs)
        .sort((a, b) => a.deltaMs - b.deltaMs);

    return {
        hasConflict: neighbors.length > 0,
        nearest: neighbors[0] || null,
        neighbors
    };
}

module.exports = { findConflicts };
