import { describe, expect, it } from 'vitest';
import { addMonths, maintenanceDue, newDocument, validateDocument, type Service } from './model';
const service = (date: string, action: 'replace' | 'repair' | 'clean' | 'inspect', km: number | null): Service => ({ id: `visit-${date}`, date, odometerKm: km, notes: '', attachments: [], needsReview: false, items: [{ id: `item-${date}`, category: 'oil', action, description: 'Work' }] });
describe('Maintenance calculations', () => {
  it('uses whichever of distance or time comes first', () => {
    const doc = newDocument(); doc.services = [service('2025-01-10', 'replace', 100000)]; doc.vehicle.odometerKm = 106000;
    const rule = { ...doc.schedules[0], intervalKm: 5000, intervalMonths: 6 };
    expect(maintenanceDue(rule, doc, '2025-02-01')).toMatchObject({ status: 'overdue', dueKm: 105000, dueDate: '2025-07-10', remainingKm: -1000 });
    doc.vehicle.odometerKm = 101000;
    expect(maintenanceDue(rule, doc, '2025-07-10').status).toBe('overdue');
  });
  it('does not reset an oil change after a later leak repair or inspection', () => {
    const doc = newDocument(); doc.services = [service('2025-01-10', 'replace', 100000), service('2025-02-10', 'repair', 101000), service('2025-03-10', 'inspect', 102000)];
    expect(maintenanceDue({ ...doc.schedules[0], intervalKm: 5000 }, doc, '2025-04-01').last).toMatchObject({ date: '2025-01-10', km: 100000 });
  });
  it('does not fall back to an older mileage when the latest change has unknown mileage', () => {
    const doc = newDocument(); doc.services = [service('2025-01-10', 'replace', 100000), service('2025-03-10', 'replace', null)]; doc.vehicle.odometerKm = 110000;
    expect(maintenanceDue({ ...doc.schedules[0], intervalKm: 5000 }, doc, '2025-04-01')).toMatchObject({ dueKm: null, status: 'unknown' });
  });
  it('clamps month intervals to valid month-end dates', () => { expect(addMonths('2025-01-31', 1)).toBe('2025-02-28'); expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); });
  it('distinguishes unconfigured intervals, missing baselines, and due soon', () => {
    const doc = newDocument(); expect(maintenanceDue(doc.schedules[0], doc).status).toBe('unconfigured');
    expect(maintenanceDue({ ...doc.schedules[0], intervalKm: 5000 }, doc).status).toBe('unknown');
    doc.services = [service('2025-01-10', 'replace', 100000)]; doc.vehicle.odometerKm = 104600;
    expect(maintenanceDue({ ...doc.schedules[0], intervalKm: 5000 }, doc, '2025-02-01').status).toBe('soon');
  });
  it('ignores future visits as a completion baseline', () => {
    const doc = newDocument(); doc.services = [service('2027-01-10', 'replace', 100000)];
    expect(maintenanceDue({ ...doc.schedules[0], intervalKm: 5000 }, doc, '2025-02-01').last.date).toBeNull();
  });
});
describe('Backup validation', () => {
  it('round trips the application document', () => { const doc = newDocument(); expect(validateDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc); });
  it('rejects invalid dates and unsupported versions', () => {
    const doc = newDocument(); doc.services = [service('2025-02-30', 'replace', 100000)];
    expect(() => validateDocument(doc)).toThrow('valid YYYY-MM-DD');
    expect(() => validateDocument({ schemaVersion: 1 })).toThrow('version 2');
  });
  it('rejects duplicate IDs and dangling follow-up references', () => {
    const doc = newDocument(); doc.services = [service('2025-01-10', 'replace', 100000), service('2025-01-10', 'replace', 100000)];
    expect(() => validateDocument(doc)).toThrow('unique');
    doc.services = []; doc.followUps = [{ id: 'follow-up', title: 'Check', done: false, dueDate: null, serviceId: 'missing' }];
    expect(() => validateDocument(doc)).toThrow('missing service');
  });
});
