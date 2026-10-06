import { addDays, todayISO, type Action, type AppDocument, type Category, type RecommendationKey, type Schedule } from './model';
export const OWNER_MANUAL = 'https://cdn.dealereprocess.org/cdn/servicemanuals/toyota/2006-camry.pdf';
interface Recommendation { originalName: string; name: string; category: Category; action: Action; km: number; months: number; note: string }
export const RECOMMENDATIONS: Record<RecommendationKey, Recommendation> = {
  oil: { originalName: 'Engine oil', name: 'Engine oil', category: 'oil', action: 'replace', km: 5000, months: 6, note: 'Conservative starter for an older, high-mileage Camry. The U.S. 2006 manual describes an oil reminder at 8,000 km; 5,000 km is an earlier planning interval. Confirm the correct interval and oil grade for your engine, market, and driving conditions.' },
  oilFilter: { originalName: 'Oil filter', name: 'Oil filter', category: 'oilFilter', action: 'replace', km: 5000, months: 6, note: 'Starter: replace the oil filter with each planned oil change. Only recorded filter changes reset this rule; add the filter to a past oil-change visit if it was changed then.' },
  coolant: { originalName: 'Coolant replacement', name: 'Coolant condition check', category: 'coolant', action: 'inspect', km: 5000, months: 6, note: 'Check coolant level/condition at routine service and confirm the fluid type and replacement history. This is an inspection reminder, not a coolant replacement deadline. Unclear coolant entries do not establish a confirmed change.' },
  acFilter: { originalName: 'AC filter replacement', name: 'AC filter review / replacement', category: 'acFilter', action: 'replace', km: 15000, months: 12, note: 'Conservative annual / 15,000 km review: inspect and replace if dirty or airflow is reduced. The 2006 manual calls for earlier replacement in dusty areas. This starter is not a quoted factory interval; recent cleaning does not establish a replacement.' },
  tyres: { originalName: 'Tyre replacement', name: 'Tyre inspection / rotation review', category: 'tyres', action: 'inspect', km: 8000, months: 6, note: 'Review tread, pressure, damage, alignment, and rotation at regular service. Replacement is condition-based, not required every 8,000 km. The manual requires a qualified check for tyres over six years old; check their manufacture date separately.' },
  brakePads: { originalName: 'Brake pad replacement', name: 'Brake pad / disc inspection', category: 'brakePads', action: 'inspect', km: 5000, months: 6, note: 'Conservative inspection at routine service. Replacement depends on measured wear and condition, not a fixed pad lifetime. A previous pad replacement is a timing reference until a later inspection is recorded.' },
};
export function recommendationFor(schedule: Schedule): Recommendation | null {
  const r = schedule.recommendationKey ? RECOMMENDATIONS[schedule.recommendationKey] : null;
  return r && r.category === schedule.category && r.action === schedule.action ? r : null;
}
export function recommendationLabel(schedule: Schedule) {
  const r = recommendationFor(schedule); if (!r) return 'Your interval';
  return r.km === schedule.intervalKm && r.months === schedule.intervalMonths ? 'Starter recommendation' : 'Adjusted starter';
}
export function applyRecommendations(doc: AppDocument, today = todayISO()): { doc: AppDocument; changed: boolean } {
  if (doc.settings.recommendationsVersion === 1) return { doc, changed: false };
  const review = addDays(today, 7);
  const schedules = doc.schedules.map(s => {
    if (s.intervalKm || s.intervalMonths) return s;
    const entry = Object.entries(RECOMMENDATIONS).find(([, r]) => r.category === s.category && r.originalName === s.name);
    if (!entry) return s;
    const [key, r] = entry;
    return { ...s, name: r.name, action: r.action, intervalKm: r.km, intervalMonths: r.months, recommendationKey: key as RecommendationKey, initialReviewDate: review };
  });
  const followUps = doc.followUps
    .filter(f => f.title !== 'Temporary automatic-sync verification')
    .map(f => !f.done && !f.dueDate ? { ...f, dueDate: review, dueDateSuggested: true } : f);
  return { doc: { ...doc, schedules, followUps, settings: { ...doc.settings, recommendationsVersion: 1 } }, changed: true };
}
