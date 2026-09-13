const { PermissionFlagsBits } = require('discord.js');

const WARNING_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_MESSAGE_LENGTH = 4_000;

// The terms are deliberately whole-word matches: this avoids moderating harmless
// words that merely contain one of the terms as a substring.
const RULES = [
    { language: 'de', terms: ['arschloch', 'fotze', 'hurensohn', 'scheiße', 'scheisse'] },
    { language: 'bg', terms: ['курва', 'лайно', 'мамка му', 'глупак', 'тъпак'] },
    { language: 'it', terms: ['cazzo', 'merda', 'puttana', 'stronzo', 'stronza', 'vaffanculo'] },
    { language: 'fr', terms: ['connard', 'connasse', 'enculé', 'encule', 'merde', 'putain', 'salope'] },
    { language: 'en', terms: ['asshole', 'bastard', 'bitch', 'cunt', 'dick', 'fuck', 'shit', 'whore'] }
];

const NOTICES = {
    de: 'Deine Nachricht verstößt gegen die Serverregeln und wurde entfernt.',
    bg: 'Съобщението ти нарушава правилата на сървъра и беше изтрито.',
    it: 'Il tuo messaggio viola le regole del server ed è stato rimosso.',
    fr: 'Votre message enfreint les règles du serveur et a été supprimé.',
    en: 'Your message violates the server rules and has been removed.'
};

function normalize(text) {
    return text
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const compiledRules = RULES.map(rule => ({
    ...rule,
    expression: new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${rule.terms.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}])`, 'iu')
}));

function findViolation(content) {
    if (typeof content !== 'string' || content.length === 0 || content.length > MAX_MESSAGE_LENGTH) return null;
    const normalized = normalize(content);
    return compiledRules.find(rule => rule.expression.test(normalized)) || null;
}

function createLanguageModerator(config) {
    const warnings = new Map();

    function getWarnings(userId) {
        const now = Date.now();
        const recentWarnings = (warnings.get(userId) || []).filter(timestamp => now - timestamp < WARNING_WINDOW_MS);
        warnings.set(userId, recentWarnings);
        return recentWarnings;
    }

    return async function moderateLanguage(message, client) {
        if (!config.moderation.enabled || message.author.bot || !message.guild) return false;
        if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

        const violation = findViolation(message.content);
        if (!violation) return false;

        const deleted = await message.delete().then(() => true).catch(error => {
            console.warn(`Impossibile eliminare un messaggio in ${message.channel.id}:`, error.message);
            return false;
        });
        if (!deleted) return true;

        const userWarnings = getWarnings(message.author.id);
        userWarnings.push(Date.now());
        warnings.set(message.author.id, userWarnings);
        const warningCount = userWarnings.length;

        await message.channel.send({
            content: `🚫 <@${message.author.id}>, ${NOTICES[violation.language]} Avviso ${warningCount}/${config.moderation.warningsBeforeTimeout}.`,
            allowedMentions: { users: [message.author.id] }
        }).catch(error => console.warn(`Impossibile inviare l'avviso di moderazione in ${message.channel.id}:`, error.message));

        const logChannel = config.logChannelId
            ? client.channels.cache.get(config.logChannelId) || await client.channels.fetch(config.logChannelId).catch(() => null)
            : null;
        if (logChannel?.isTextBased()) {
            await logChannel.send(`🛡️ Messaggio rimosso dalla moderazione linguistica (${violation.language.toUpperCase()}) di <@${message.author.id}> — avviso ${warningCount}/${config.moderation.warningsBeforeTimeout}.`).catch(() => null);
        }

        if (warningCount >= config.moderation.warningsBeforeTimeout && message.member?.moderatable) {
            const timedOut = await message.member
                .timeout(config.moderation.timeoutMs, 'Violazioni ripetute rilevate dalla moderazione linguistica')
                .then(() => true)
                .catch(error => {
                    console.warn(`Impossibile applicare il timeout a ${message.author.id}:`, error.message);
                    return false;
                });
            if (timedOut) warnings.delete(message.author.id);
        }

        return true;
    };
}

module.exports = { createLanguageModerator, findViolation, normalize };
