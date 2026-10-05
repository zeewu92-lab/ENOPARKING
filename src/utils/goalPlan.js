const KEY = 'engnocrazy:goalPlan';
const VERSION = 1;

// 这里先把这一步处理好，后面的逻辑就顺了。
function jindayKey(date = new Date()) {
  const d = new Date(date);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseRiqiKey(value) {
  if (!value) return new Date();
  const [year, month, day] = String(value).split('-').map(Number);
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (year && month && day) date.setFullYear(year, month - 1, day);
  return date;
}
function addTianshu(date, dayshu) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + Number(dayshu || 0));
  return next;
}
function normalizeDanciKey(word) {
  return String(word?.word || word?.w || word || '').trim().toLowerCase();
}
export function huoquMubiaoJihua() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null');
    if (!saved || saved.version !== VERSION || saved.source !== 'gaokao-3500') return null;
    return saved;
  } catch { return null; }
}
export function baocunMubiaoJihua(plan) {
  if (typeof window === 'undefined') return plan;
  const next = {
    version: VERSION,
    source: 'gaokao-3500',
    createdAt: plan.createdAt || new Date().toISOString(),
    totalWords: Math.max(0, Number(plan.totalWords) || 0),
    stageCount: Math.max(1, Number(plan.stageCount) || 1),
    wordKeys: Array.isArray(plan.wordKeys) ? plan.wordKeys : [],
    currentStage: Math.max(0, Number(plan.currentStage) || 0),
    completedStages: Math.max(0, Number(plan.completedStages) || 0),
    cycleStageCount: Math.max(0, Number(plan.cycleStageCount) || 0),
    lastCycleDate: plan.lastCycleDate || '',
    schedule: {
      type: plan.schedule?.type === 'weekly' || plan.schedule?.type === 'monthly' ? plan.schedule.type : 'interval',
      intervalDays: Math.max(1, Math.min(365, Number(plan.schedule?.intervalDays) || 1)),
      weekdays: Array.isArray(plan.schedule?.weekdays) ? [...new Set(plan.schedule.weekdays.map(Number).filter(v => v >= 0 && v <= 6))].sort((a, b) => a - b) : [1, 3, 5],
      monthDays: Array.isArray(plan.schedule?.monthDays) ? [...new Set(plan.schedule.monthDays.map(Number).filter(v => v >= 1 && v <= 31))].sort((a, b) => a - b) : [],
      monthFirst: Boolean(plan.schedule?.monthFirst),
      monthLast: Boolean(plan.schedule?.monthLast),
      stagesPerCycle: Math.max(1, Math.min(Math.max(1, Number(plan.stageCount) || 1), Number(plan.schedule?.stagesPerCycle) || 1))
    }
  };
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}
export function qingchuMubiaoJihua() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
}
export function goujianMubiaoJihua({ words = [], rememberedWords = [], stageCount = 70, schedule = {}, existingPlan = null } = {}) {
  const remembered = new Set((rememberedWords || []).map(normalizeDanciKey).filter(Boolean));
  const remaining = [];
  const seen = new Set();
  (Array.isArray(words) ? words : []).forEach(word => {
    const key = normalizeDanciKey(word);
    if (!key || remembered.has(key) || seen.has(key)) return;
    seen.add(key);
    remaining.push(key);
  });
  const stageCountValue = Math.max(1, Math.min(Math.max(1, remaining.length), Number(stageCount) || 1));
  const previousProgress = existingPlan?.stageCount ? existingPlan.currentStage / existingPlan.stageCount : 0;
  const preservedStage = existingPlan ? Math.min(stageCountValue, Math.floor(previousProgress * stageCountValue)) : 0;
  return baocunMubiaoJihua({
    source: 'gaokao-3500',
    totalWords: remaining.length,
    stageCount: stageCountValue,
    wordKeys: remaining,
    currentStage: preservedStage,
    completedStages: preservedStage,
    cycleStageCount: existingPlan ? Math.min(Number(existingPlan.cycleStageCount) || 0, Number(schedule.stagesPerCycle) || 1) : 0,
    lastCycleDate: existingPlan?.lastCycleDate || '',
    schedule
  });
}
export function huoquMubiaoStageRange(plan, stageIndex = 0) {
  if (!plan || !plan.stageCount || !plan.totalWords) return { start: 0, end: 0 };
  const index = Math.max(0, Math.min(plan.stageCount - 1, Number(stageIndex) || 0));
  const start = Math.floor(index * plan.totalWords / plan.stageCount);
  const end = Math.floor((index + 1) * plan.totalWords / plan.stageCount);
  return { start, end: Math.max(start, end) };
}
export function huoquMubiaoStageDanciList(allWordList, plan, stageIndex = 0) {
  if (!plan?.wordKeys?.length) return [];
  const byKey = new Map();
  (Array.isArray(allWordList) ? allWordList : []).forEach(word => {
    const key = normalizeDanciKey(word);
    if (key && !byKey.has(key)) byKey.set(key, word);
  });
  const { start, end } = huoquMubiaoStageRange(plan, stageIndex);
  return plan.wordKeys.slice(start, end).map(key => byKey.get(key)).filter(Boolean);
}
export function isMubiaoJihuaComplete(plan) {
  return Boolean(plan && plan.currentStage >= plan.stageCount);
}
export function isMubiaoJihuaDue(plan, date = new Date()) {
  if (!plan || isMubiaoJihuaComplete(plan)) return false;
  const schedule = plan.schedule || {};
  const jinday = new Date(date);
  jinday.setHours(0, 0, 0, 0);
  if (!plan.lastCycleDate) return true;
  if (jindayKey(jinday) === plan.lastCycleDate) return false;
  if (schedule.type === 'interval') return jinday >= addTianshu(parseRiqiKey(plan.lastCycleDate), schedule.intervalDays || 1);
  if (schedule.type === 'weekly') return Array.isArray(schedule.weekdays) && schedule.weekdays.includes(jinday.getDay());
  if (schedule.type === 'monthly') return Boolean((schedule.monthFirst && jinday.getDate() === 1) || (schedule.monthLast && jinday.getDate() === new Date(jinday.getFullYear(), jinday.getMonth() + 1, 0).getDate()) || (Array.isArray(schedule.monthDays) && schedule.monthDays.includes(jinday.getDate())));
  return true;
}
export function wanchengMubiaoStage(plan) {
  if (!plan || isMubiaoJihuaComplete(plan)) return plan;
  const schedule = plan.schedule || {};
  const nextCycleStageShuliang = (Number(plan.cycleStageCount) || 0) + 1;
  const cycleDone = nextCycleStageShuliang >= Math.max(1, Number(schedule.stagesPerCycle) || 1);
  return baocunMubiaoJihua({
    ...plan,
    currentStage: Math.min(plan.stageCount, plan.currentStage + 1),
    completedStages: Math.min(plan.stageCount, plan.completedStages + 1),
    cycleStageCount: cycleDone ? 0 : nextCycleStageShuliang,
    lastCycleDate: cycleDone ? jindayKey() : plan.lastCycleDate
  });
}
export function huoquMubiaoJihuaSummary(plan) {
  if (!plan) return '尚未建立學習計畫';
  if (isMubiaoJihuaComplete(plan)) return '3500 詞已全部完成';
  const schedule = plan.schedule || {};
  if (schedule.type === 'interval') return '共 ' + plan.stageCount + ' 階段 · 每 ' + (schedule.intervalDays || 1) + ' 天';
  if (schedule.type === 'weekly') return '共 ' + plan.stageCount + ' 階段 · 每週 ' + formatWeekdays(schedule.weekdays);
  return '共 ' + plan.stageCount + ' 階段 · 每月 ' + formatYueTianshu(schedule.monthDays, schedule.monthFirst, schedule.monthLast);
}
export function formatWeekdays(dayshu = []) {
  const labels = ['日', '一', '二', '三', '四', '五', '六'];
  return dayshu.length ? dayshu.map(day => labels[day]).join('、') : '未設定';
}
export function formatYueTianshu(dayshu = [], first = false, last = false) {
  const labels = [];
  if (first) labels.push('第一天');
  if (last) labels.push('最後一天');
  if (dayshu.length) labels.push(...dayshu.map(day => day + ' 號'));
  return labels.length ? labels.join('、') : '未設定';
}
export function huoquXiayiMubiaoRiqi(plan, date = new Date()) {
  if (!plan || isMubiaoJihuaComplete(plan)) return null;
  const schedule = plan.schedule || {};
  const base = new Date(date);
  base.setHours(0, 0, 0, 0);
  if (!plan.lastCycleDate) return base;
  if (schedule.type === 'interval') return addTianshu(parseRiqiKey(plan.lastCycleDate), schedule.intervalDays || 1);
  for (let offset = 1; offset <= 370; offset += 1) {
    const next = addTianshu(base, offset);
    if (schedule.type === 'weekly' && schedule.weekdays?.includes(next.getDay())) return next;
    if (schedule.type === 'monthly' && ((schedule.monthFirst && next.getDate() === 1) || (schedule.monthLast && next.getDate() === new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()) || schedule.monthDays?.includes(next.getDate()))) return next;
  }
  return null;
}
export { jindayKey };
