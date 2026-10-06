import { describe, expect, it } from 'vitest';
import { maintenanceDue, newDocument, validateDocument, type Service } from './model';
import { applyRecommendations } from './recommendations';
const today = '2026-10-05';
const visit = (date: string, km: number, category: Service['items'][number]['category'], action: Service['items'][number]['action']): Service => ({ id: `visit-${category}`, date, odometerKm: km, needsReview: false, notes: '', attachments: [], items: [{ id: `item-${category}`, description: 'Recorded work', category, action }] });
describe('Starter recommendations', () => {
  it('fills only unconfigured default schedules and preserves configured user intervals', () => {
    const original = newDocument(); original.schedules[0].intervalKm = 7000;
    const next = applyRecommendations(original, today).doc;
    expect(next.schedules[0].intervalKm).toBe(7000); expect(next.schedules[1].intervalKm).toBe(5000);
    expect(next.services).toEqual(original.services);
  });
  it('calculates oil targets from actual changes, not leak repairs', () => {
    const original = newDocument(); original.services = [visit('2026-04-10', 100000, 'oil', 'replace')];
    const next = applyRecommendations(original, today).doc;
    expect(maintenanceDue(next.schedules[0], next, today)).toMatchObject({ dueKm: 105000, dueDate: '2026-10-10' });
  });
  it('uses tyre replacement only as an explicitly labelled inspection timing reference', () => {
    const original = newDocument(); original.services = [visit('2026-04-20', 101000, 'tyres', 'replace')];
    const next = applyRecommendations(original, today).doc; const rule = next.schedules.find(s => s.recommendationKey === 'tyres')!;
    expect(rule.action).toBe('inspect'); expect(maintenanceDue(rule, next, today)).toMatchObject({ dueKm: 109000, dueDate: '2026-10-20', last: { basis: 'reference' } });
  });
  it('does not invent a coolant change when the description is ambiguous', () => {
    const original = newDocument(); original.services = [visit('2026-04-10', 100000, 'coolant', 'other')];
    const next = applyRecommendations(original, today).doc; const rule = next.schedules.find(s => s.recommendationKey === 'coolant')!;
    expect(maintenanceDue(rule, next, today)).toMatchObject({ dueKm: null, dueDate: null, reviewDate: '2026-10-12', last: { basis: 'unknown' } });
  });
  it('gives missing active follow-up dates a suggested week without changing existing dates', () => {
    const original = newDocument(); original.followUps = [
      { id: 'first', title: 'Check workshop advice', serviceId: null, done: false, dueDate: null },
      { id: 'second', title: 'Existing date', serviceId: null, done: false, dueDate: '2026-12-01' },
    ];
    const next = applyRecommendations(original, today).doc;
    expect(next.followUps[0]).toMatchObject({ dueDate: '2026-10-12', dueDateSuggested: true }); expect(next.followUps[1].dueDate).toBe('2026-12-01');
    expect(applyRecommendations(next, '2026-11-01').changed).toBe(false);
  });
  it('round trips recommendation provenance through backups', () => {
    const next = applyRecommendations(newDocument(), today).doc;
    expect(validateDocument(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
});
