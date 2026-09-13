const assert = require('node:assert/strict');
const test = require('node:test');
const { findViolation, normalize } = require('../src/modules/languageModeration');

test('recognizes prohibited terms in each supported language', () => {
    const examples = [
        ['Du bist ein Arschloch', 'de'],
        ['Това е курва', 'bg'],
        ['Che stronzo!', 'it'],
        ['Quel connard', 'fr'],
        ['This is shit.', 'en']
    ];
    for (const [content, language] of examples) {
        assert.equal(findViolation(content)?.language, language);
    }
});

test('does not match a prohibited term contained within another word', () => {
    assert.equal(findViolation('classhole and shitake are not violations'), null);
});

test('normalizes case, compatibility characters, and zero-width characters', () => {
    assert.equal(normalize('  ＳＨ\u200bＩＴ  '), 'shit');
    assert.equal(findViolation('ＳＨ\u200bＩＴ')?.language, 'en');
});
