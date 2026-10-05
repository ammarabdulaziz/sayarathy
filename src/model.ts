export const CATEGORIES = {
  oil: 'Engine oil', oilFilter: 'Oil filter', coolant: 'Coolant', cooling: 'Radiator & cooling system', acFilter: 'AC filter', ac: 'Air conditioning',
  brakePads: 'Brake pads', brakes: 'Other brake work', tyres: 'Tyres', suspension: 'Suspension', steering: 'Steering', drivetrain: 'Axles & drivetrain',
  electrical: 'Lights & electrical', body: 'Bodywork', other: 'Other',
} as const;
export type Category = keyof typeof CATEGORIES;
export const ACTIONS = { replace: 'Replace / change', clean: 'Clean', inspect: 'Check / inspect', repair: 'Repair', other: 'Other work' } as const;
export type Action = keyof typeof ACTIONS;
export interface ServiceItem { id: string; description: string; category: Category; action: Action }
export interface Attachment { id: string; name: string; mimeType: string; size: number }
export interface Service { id: string; date: string; odometerKm: number | null; items: ServiceItem[]; notes: string; attachments: Attachment[]; needsReview: boolean }
export interface Schedule { id: string; name: string; category: Category; action: Action; intervalKm: number | null; intervalMonths: number | null; baselineDate: string | null; baselineKm: number | null }
export interface FollowUp { id: string; title: string; serviceId: string | null; dueDate: string | null; done: boolean }
export interface Mileage { id: string; date: string; odometerKm: number }
export interface AppDocument {
  schemaVersion: 2;
  vehicle: { make: string; model: string; year: number; fuel: string; engine: string; odometerKm: number | null; odometerDate: string | null };
  services: Service[];
  schedules: Schedule[];
  followUps: FollowUp[];
  mileage: Mileage[];
  settings: { dueSoonKm: number; dueSoonDays: number };
  updatedAt: string;
}
export const uid = () => crypto.randomUUID();
export function todayISO() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export const formatKm = (km: number | null) => km === null ? 'Not recorded' : `${km.toLocaleString()} km`;
export function formatDate(date: string) { return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)); }
export function isDate(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function numericInput(value: string, label: string, max = 5_000_000): number | null {
  if (!value.trim()) return null;
  const n = Number(value); if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`${label} must be a whole number between 0 and ${max.toLocaleString()}.`);
  return n;
}
export function newDocument(): AppDocument {
  return {
    schemaVersion: 2, vehicle: { make: 'Toyota', model: 'Camry', year: 2006, fuel: '', engine: '', odometerKm: null, odometerDate: null },
    services: [], followUps: [], mileage: [], settings: { dueSoonKm: 500, dueSoonDays: 30 }, updatedAt: new Date().toISOString(),
    schedules: [
      ['Engine oil', 'oil'], ['Oil filter', 'oilFilter'], ['Coolant replacement', 'coolant'], ['AC filter replacement', 'acFilter'], ['Tyre replacement', 'tyres'], ['Brake pad replacement', 'brakePads'],
    ].map(([name, category]) => ({ id: uid(), name, category: category as Category, action: 'replace', intervalKm: null, intervalMonths: null, baselineDate: null, baselineKm: null })),
  };
}
export function sortServices(services: Service[]) { return [...services].sort((a, b) => b.date.localeCompare(a.date) || (b.odometerKm ?? -1) - (a.odometerKm ?? -1)); }
export function latestCompletion(schedule: Schedule, services: Service[], today = todayISO()): { date: string | null; km: number | null; serviceId: string | null } {
  const service = sortServices(services).find(s => s.date <= today && s.items.some(i => i.category === schedule.category && i.action === schedule.action));
  const useService = service && (!schedule.baselineDate || service.date >= schedule.baselineDate);
  return useService ? { date: service.date, km: service.odometerKm, serviceId: service.id } : { date: schedule.baselineDate, km: schedule.baselineKm, serviceId: null };
}
export function addMonths(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`); const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay)); return d.toISOString().slice(0, 10);
}
export interface Due { status: 'overdue' | 'soon' | 'upcoming' | 'unconfigured' | 'unknown'; dueKm: number | null; dueDate: string | null; remainingKm: number | null; remainingDays: number | null; last: ReturnType<typeof latestCompletion>; missing: string[] }
export function maintenanceDue(schedule: Schedule, doc: AppDocument, today = todayISO()): Due {
  const last = latestCompletion(schedule, doc.services, today);
  const dueKm = schedule.intervalKm && last.km !== null ? last.km + schedule.intervalKm : null;
  const dueDate = schedule.intervalMonths && last.date ? addMonths(last.date, schedule.intervalMonths) : null;
  const remainingKm = dueKm !== null && doc.vehicle.odometerKm !== null ? dueKm - doc.vehicle.odometerKm : null;
  const remainingDays = dueDate ? Math.round((Date.parse(dueDate) - Date.parse(today)) / 86400000) : null;
  const missing: string[] = [];
  if (schedule.intervalKm && last.km === null) missing.push('Last completion mileage is missing');
  if (schedule.intervalKm && doc.vehicle.odometerKm === null) missing.push('Enter your current mileage');
  if (schedule.intervalMonths && !last.date) missing.push('Last completion date is missing');
  let status: Due['status'] = 'upcoming';
  if (!schedule.intervalKm && !schedule.intervalMonths) status = 'unconfigured';
  else if ((remainingKm !== null && remainingKm <= 0) || (remainingDays !== null && remainingDays <= 0)) status = 'overdue';
  else if ((remainingKm !== null && remainingKm <= doc.settings.dueSoonKm) || (remainingDays !== null && remainingDays <= doc.settings.dueSoonDays)) status = 'soon';
  else if (remainingKm === null && remainingDays === null) status = 'unknown';
  return { status, dueKm, dueDate, remainingKm, remainingDays, last, missing };
}
export const DUE_LABELS = { overdue: 'Due now / overdue', soon: 'Due soon', upcoming: 'Upcoming', unconfigured: 'Set intervals', unknown: 'Needs a baseline' };

// Validate imported and remote JSON before it can replace a working document.
export function validateDocument(input: unknown): AppDocument {
  const fail = (message: string): never => { throw new Error(`Invalid Sayarathy backup: ${message}`); };
  const object = (x: unknown): Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x) ? x as Record<string, unknown> : fail('expected an object');
  const text = (x: unknown, name: string, max = 10000): string => typeof x === 'string' && x.length <= max ? x : fail(`${name} must be text`);
  const num = (x: unknown, name: string, nullable = false, max = 5_000_000): number | null => nullable && x === null ? null : typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max ? x : fail(`${name} must be a valid whole number`);
  const date = (x: unknown, name: string, nullable = false): string | null => nullable && x === null ? null : isDate(x) ? x : fail(`${name} must be a valid YYYY-MM-DD date`);
  const array = (x: unknown, name: string, max = 5000): unknown[] => Array.isArray(x) && x.length <= max ? x : fail(`${name} must be an array with at most ${max} entries`);
  const bool = (x: unknown, name: string): boolean => typeof x === 'boolean' ? x : fail(`${name} must be true or false`);
  const ids = new Set<string>();
  const id = (x: unknown): string => { const s = text(x, 'ID', 200); if (!s || ids.has(s)) fail('IDs must be nonempty and unique'); ids.add(s); return s; };
  const category = (x: unknown): Category => typeof x === 'string' && Object.hasOwn(CATEGORIES, x) ? x as Category : fail('unknown category');
  const action = (x: unknown): Action => typeof x === 'string' && Object.hasOwn(ACTIONS, x) ? x as Action : fail('unknown completion action');
  const root = object(input); if (root.schemaVersion !== 2) fail('this file is not a version 2 application backup; download the original file before converting it');
  const v = object(root.vehicle); const year = num(v.year, 'Vehicle year', false, new Date().getFullYear() + 1)!; if (year < 1900) fail('vehicle year is too early');
  const vehicle: AppDocument['vehicle'] = { make: text(v.make, 'Make', 100), model: text(v.model, 'Model', 100), year, fuel: text(v.fuel, 'Fuel', 100), engine: text(v.engine, 'Engine', 100), odometerKm: num(v.odometerKm, 'Current mileage', true), odometerDate: date(v.odometerDate, 'Mileage date', true) };
  if (!vehicle.make.trim() || !vehicle.model.trim()) fail('vehicle make and model are required');
  if ((vehicle.odometerKm === null) !== (vehicle.odometerDate === null)) fail('current mileage and its date must be recorded together');
  const services: Service[] = array(root.services, 'Services').map(x => { const s = object(x); return { id: id(s.id), date: date(s.date, 'Service date')!, odometerKm: num(s.odometerKm, 'Service mileage', true), notes: text(s.notes, 'Service notes'), needsReview: bool(s.needsReview, 'Review status'),
    items: array(s.items, 'Service items', 100).map(x => { const i = object(x); const description = text(i.description, 'Work description', 1000); if (!description.trim()) fail('work descriptions cannot be empty'); return { id: id(i.id), description, category: category(i.category), action: action(i.action) }; }),
    attachments: array(s.attachments, 'Attachments', 20).map(x => { const a = object(x); const attachmentId = text(a.id, 'Drive file ID', 200); if (!/^[\w-]{5,200}$/.test(attachmentId)) fail('invalid attachment file ID'); const mimeType = text(a.mimeType, 'Attachment type', 100); if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mimeType)) fail('unsupported attachment type'); return { id: attachmentId, name: text(a.name, 'Attachment name', 300), mimeType, size: num(a.size, 'Attachment size', false, 10 * 1024 * 1024)! }; }),
  }; });
  if (services.some(s => !s.items.length)) fail('every service must contain completed work');
  const schedules: Schedule[] = array(root.schedules, 'Schedules', 200).map(x => { const s = object(x); const intervalKm = num(s.intervalKm, 'Distance interval', true); const intervalMonths = num(s.intervalMonths, 'Month interval', true, 1200); if (intervalKm === 0 || intervalMonths === 0) fail('intervals must be positive or unset'); return { id: id(s.id), name: text(s.name, 'Schedule name', 200), category: category(s.category), action: action(s.action), intervalKm, intervalMonths, baselineDate: date(s.baselineDate, 'Baseline date', true), baselineKm: num(s.baselineKm, 'Baseline mileage', true) }; });
  if (schedules.some(s => !s.name.trim())) fail('schedule names cannot be empty');
  const followUps: FollowUp[] = array(root.followUps, 'Follow-ups').map(x => { const f = object(x); const serviceId = f.serviceId === null ? null : text(f.serviceId, 'Service reference', 200); if (serviceId && !services.some(s => s.id === serviceId)) fail('follow-up refers to a missing service'); return { id: id(f.id), title: text(f.title, 'Follow-up description', 2000), serviceId, dueDate: date(f.dueDate, 'Follow-up date', true), done: bool(f.done, 'Follow-up status') }; });
  if (followUps.some(f => !f.title.trim())) fail('follow-up descriptions cannot be empty');
  const mileage: Mileage[] = array(root.mileage, 'Mileage readings').map(x => { const m = object(x); return { id: id(m.id), date: date(m.date, 'Mileage date')!, odometerKm: num(m.odometerKm, 'Mileage')! }; });
  const settings = object(root.settings);
  const updatedAt = text(root.updatedAt, 'Last update', 100); if (Number.isNaN(Date.parse(updatedAt))) fail('last update timestamp is invalid');
  return { schemaVersion: 2, vehicle, services, schedules, followUps, mileage, updatedAt, settings: { dueSoonKm: num(settings.dueSoonKm, 'Due-soon distance')!, dueSoonDays: num(settings.dueSoonDays, 'Due-soon days', false, 3650)! } };
}
