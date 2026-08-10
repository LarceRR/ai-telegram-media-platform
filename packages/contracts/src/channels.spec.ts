import { channelResponseSchema, channelSettingsSchema } from './channels';

describe('channel contracts', () => {
  const settings = {
    minInterest: 6, minQuality: 6, minEvidence: 7, minOriginality: 5,
    researchMaxLevel: 2, forbiddenTopics: [], legalRestrictions: [], blacklist: [],
    hookStyle: 'restrained', maxLength: 4000, emojiPolicy: false, version: 1,
  };

  it('validates bounded protected and optimizable settings', () => {
    expect(channelSettingsSchema.parse(settings).maxLength).toBe(4000);
    expect(() => channelSettingsSchema.parse({ ...settings, minEvidence: 11 })).toThrow();
    expect(() => channelSettingsSchema.parse({ ...settings, researchMaxLevel: 4 })).toThrow();
  });

  it('rejects a channel response without a membership role', () => {
    expect(() => channelResponseSchema.parse({
      id: '00000000-0000-4000-8000-000000000000', telegramChatId: '-1', title: 'News',
      username: null, language: 'en', mode: 'MODERATED', active: true, settings,
      telegramCredentialConfigured: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })).toThrow();
  });
});
