((root) => {
  'use strict';
  const specification = { dailyScheduleVerified: false, presentThresholdVerified: true };
  function clean(value) { return root.LensSearch.text(value); }
  function rewardText(entry) {
    const name = clean(entry.reward?.name || entry.reward?.nameWithReading);
    return name ? `${name}${Number.isInteger(entry.quantity) && entry.quantity > 1 ? ` ×${entry.quantity}` : ''}` : '報酬を確認中';
  }
  function create(profile, dataset = null) {
    const outcomes = profile.outcomes || [];
    const resolvedProfile = dataset?.profiles?.[profile.id];
    const resolvedMissions = new Map((resolvedProfile?.missions || []).map((entry) => [entry.ordinal, entry]));
    const missions = (profile.missions || []).map((entry, index) => {
      const ordinal = entry.ordinal ?? index + 1;
      const conditionType = entry.conditionType ?? entry.raw?.[0];
      const conditionValue = entry.conditionValue ?? entry.raw?.[1];
      const quantity = entry.quantity ?? entry.raw?.[4];
      const rewardItemId = entry.reward?.itemId ?? entry.raw?.[3];
      const candidate = resolvedMissions.get(ordinal);
      const resolved = [0, 1, 2, 3].includes(conditionType) && candidate?.conditionType === conditionType && candidate.conditionValue === conditionValue && candidate.quantity === quantity && candidate.reward?.itemId === rewardItemId && Array.isArray(candidate.targetParameterIds) && candidate.challengeText ? candidate : null;
      const ids = new Set(resolved?.targetParameterIds || []);
      const targets = outcomes.filter((outcome) => ids.has(outcome.charaId));
      const targetIds = targets.map((outcome) => String(outcome.charaIdHex || outcome.charaId));
      const title = resolved ? clean(resolved.challengeText).replace(/\r?\n/g, '').trim() : '条件解析中';
      const reward = resolved?.reward || entry.reward;
      return { id: `mission-${ordinal}`, kind: 'mission', ordinal, title, condition: resolved ? 'このお題の日に、対象の妖怪を激写する' : '条件解析中', reward: rewardText({ reward, quantity }), rewardName: clean(reward?.name), rewardReading: reward?.nameWithReading || '', nameReading: conditionType === 0 && resolved ? entry.conditionCharacter?.nameWithReading || targets[0]?.nameWithReading || '' : '', targetIds, resolved: Boolean(resolved), raw: entry };
    });
    const presents = (profile.presents || []).map((entry, index) => {
      const threshold = entry.threshold ?? entry.raw?.[0];
      const quantity = entry.quantity ?? entry.raw?.[2];
      const resolved = specification.presentThresholdVerified && Number.isInteger(threshold) && threshold > 0 && Number.isInteger(quantity) && quantity > 0;
      return { id: `present-${index}`, kind: 'present', title: resolved ? '種類数のごほうび' : '撮影のごほうび', condition: resolved ? `激写した妖怪が累計${threshold}種類に達したとき（各1回）` : '条件解析中', reward: rewardText({ reward: entry.reward, quantity }), rewardName: clean(entry.reward?.name), rewardReading: entry.reward?.nameWithReading || '', targetIds: [], raw: entry };
    });
    const samples = [];
    for (const entry of [...missions, ...presents, ...samples]) entry.searchFields = root.LensSearch.index([{ value: entry.title, kind: 'mission', fuzzy: false }, { value: entry.condition, kind: 'mission', fuzzy: false }, { value: entry.nameReading, kind: 'name' }, { value: entry.rewardName, kind: 'reward' }, { value: entry.rewardReading, kind: 'reward' }]);
    const dailyRule = dataset?.daily?.epochDate === '2014-07-10' && dataset.daily.rolloverHour === 6 && dataset.daily.cycleLength === 70 && missions.length === 70 && missions.every((mission) => mission.resolved) ? { ...dataset.daily, dailyScheduleVerified: true } : null;
    return { missions, presents, samples, dailyRule };
  }
  function clockValue(date = new Date()) {
    const pad = (number) => String(number).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  function effectiveDay(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value || '');
    if (!match) return null;
    const [, year, month, day, hour, minute] = match.map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 2000 || year > 2099 || hour > 23 || minute > 59 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    if (hour < 6) date.setUTCDate(date.getUTCDate() - 1);
    return date;
  }
  function daily(activities, value) {
    const day = effectiveDay(value);
    if (!day || !activities.missions.length || !(activities.dailyRule?.dailyScheduleVerified || specification.dailyScheduleVerified)) return { day, mission: null };
    const offset = Math.floor((day.getTime() - Date.UTC(2014, 6, 10)) / 86400000);
    const index = ((offset % 70) + 70) % 70;
    return { day, mission: activities.missions.find((mission) => mission.ordinal === index + 1) || null };
  }
  const api = Object.freeze({ create, clockValue, effectiveDay, daily, specification });
  root.LensActivities = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
