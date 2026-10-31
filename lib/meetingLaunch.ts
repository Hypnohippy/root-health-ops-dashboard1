import type { DiaryItem } from './diary';

export const RELATIONSHIP_CALL_PREFIX = 'relationship-call:';

export function relationshipCallId(locator: string) {
  if (!/^(?:inbox|target|acquisition|workspace)_[a-f0-9-]{36}$/i.test(locator)) {
    throw new Error('An exact relationship is required to start a call.');
  }
  return `${RELATIONSHIP_CALL_PREFIX}${locator}`;
}

export function upcomingRelationshipMeetings(items: DiaryItem[], organisationId: string, relationshipId: string, now = Date.now()) {
  return items
    .filter(item => item.type === 'Meeting'
      && item.source.provider === 'conversation_confirmation'
      && item.source.organisationId === organisationId
      && item.source.relationshipId === relationshipId
      && !!item.at && Number.isFinite(Date.parse(item.at)) && Date.parse(item.at) >= now
      && !!item.provenance?.length)
    .sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!))
    .map(item => ({ id: item.id, title: item.title, at: item.at!, channel: item.channel || 'Unspecified' }));
}
