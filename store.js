export const STORAGE_KEY = "kc_support_v2";
export const LEGACY_KEY = "kc_singlefile_v1";
export const TRIGGERS = [
  "工作压力",
  "烦躁",
  "习惯",
  "饭后",
  "无聊",
  "社交",
  "其他",
];
export const METHODS = ["breathe", "walk", "ground", "hands", "task"];
export const OUTCOMES = ["eased", "still", "smoked", "left"];

const text = (v, max = 600) => (typeof v === "string" ? v.slice(0, max) : "");
const number = (v, fallback, min, max) =>
  Number.isFinite(Number(v)) && v !== "" && v !== null
    ? Math.min(max, Math.max(min, Number(v)))
    : fallback;
const timestamp = (v) =>
  typeof v === "string" && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
const rating = (v) =>
  v === null || v === undefined || v === "" ? null : number(v, null, 0, 10);
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `kc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function dayKey(value = new Date()) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDay(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d, 12)) === key;
}
export function previousDays(count = 7, now = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (count - 1 - i));
    return dayKey(d);
  });
}
export function defaultState() {
  return {
    version: 2,
    profile: {
      baseline: 20,
      packSize: 20,
      packPrice: 25,
      minutes: 2,
      reason: "",
      plan: "离开工位，喝口水，再写下一个能完成的小步骤。",
      scene: "mist-lake",
      motivation: "focus",
      tone: "gentle",
      motion: true,
      quitStartedAt: null,
    },
    events: [],
    confirmations: {},
    legacyDays: {},
    legacyLogs: [],
    images: [],
    quotes: [],
    activeSession: null,
    migratedAt: null,
    lastExportAt: null,
    legacyLastSmokeAt: null,
  };
}
function profile(input = {}) {
  const p = defaultState().profile;
  return {
    baseline: Math.round(number(input.baseline, p.baseline, 0, 200)),
    packSize: Math.round(number(input.packSize, p.packSize, 1, 100)),
    packPrice: number(input.packPrice, p.packPrice, 0, 10000),
    minutes: Math.round(number(input.minutes, p.minutes, 1, 15)),
    reason: text(input.reason, 240),
    plan: text(input.plan, 400) || p.plan,
    scene: text(input.scene, 60) || p.scene,
    motivation: ["focus", "moment", "persist", "forward", "passion"].includes(
      input.motivation,
    )
      ? input.motivation
      : p.motivation,
    tone: ["gentle", "direct", "reflective", "off"].includes(input.tone)
      ? input.tone
      : p.tone,
    motion: input.motion !== false,
    quitStartedAt: timestamp(input.quitStartedAt),
  };
}
function legacyDays(input) {
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input))
    return result;
  for (const [key, v] of Object.entries(input)) {
    if (!validDay(key) || !v || typeof v !== "object") continue;
    const entry = {
      crave: Math.round(number(v.crave, 0, 0, 100000)),
      resist: Math.round(number(v.resist, 0, 0, 100000)),
      smoke: Math.round(number(v.smoke, 0, 0, 100000)),
    };
    if (entry.crave + entry.resist + entry.smoke > 0) result[key] = entry;
  }
  return result;
}
function safeImages(input) {
  return Array.isArray(input)
    ? input
        .filter(
          (s) =>
            typeof s === "string" &&
            /^data:image\/(png|jpeg|webp|gif);base64,/.test(s) &&
            s.length < 4000000,
        )
        .slice(0, 50)
    : [];
}
export function migrateLegacy(input, now = new Date()) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !("days" in input || "settings" in input || "logs" in input)
  )
    throw new Error("文件不包含可识别的旧版记录。");
  const s = defaultState();
  s.profile.minutes = Math.round(
    number(input.settings?.challengeMinutes, 2, 1, 15),
  );
  // The old amount meant a whole smoke-free day. Keep its meaning as a 20-cigarette baseline estimate.
  s.profile.packPrice = number(input.settings?.savePerDay, 25, 0, 10000);
  s.legacyDays = legacyDays(input.days);
  s.legacyLogs = Array.isArray(input.logs)
    ? input.logs
        .filter(
          (e) =>
            e &&
            timestamp(e.ts) &&
            ["crave", "resist", "smoke", "skip"].includes(e.type),
        )
        .map((e) => ({ ts: timestamp(e.ts), type: e.type }))
    : [];
  s.images = safeImages(input.images);
  s.legacyLastSmokeAt = timestamp(input.lastSmokeTs);
  s.quotes = Array.isArray(input.quotes)
    ? input.quotes
        .filter((q) => typeof q === "string")
        .map((q) => text(q, 500))
        .slice(0, 300)
    : [];
  s.migratedAt = new Date(now).toISOString();
  // Missing legacy days were never confirmations of abstinence; do not manufacture them.
  return s;
}
export function normalizeState(input) {
  if (
    !input ||
    typeof input !== "object" ||
    input.version !== 2 ||
    !Array.isArray(input.events) ||
    !input.profile
  )
    throw new Error("这不是有效的 Kill Cigarette 备份。");
  if (input.events.length > 100000)
    throw new Error("记录数量过多，请选择较小的备份文件。");
  const s = defaultState();
  s.profile = profile(input.profile);
  const ids = new Set();
  for (const v of input.events) {
    if (
      !v ||
      typeof v !== "object" ||
      !timestamp(v.at) ||
      !["smoke", "craving"].includes(v.type)
    )
      throw new Error("备份中的记录格式不完整，原有数据未修改。");
    const id = text(v.id, 100) || uid();
    if (ids.has(id)) throw new Error("备份中有重复记录，请检查文件。");
    ids.add(id);
    const e = {
      id,
      type: v.type,
      at: timestamp(v.at),
      trigger: TRIGGERS.includes(v.trigger) ? v.trigger : "其他",
      note: text(v.note, 400),
    };
    if (v.type === "smoke") {
      if (!Number.isInteger(v.count) || v.count < 1 || v.count > 200)
        throw new Error("备份中有无效的抽烟根数，原有数据未修改。");
      e.count = v.count;
    } else
      Object.assign(e, {
        before: rating(v.before),
        after: rating(v.after),
        method: METHODS.includes(v.method) ? v.method : "breathe",
        outcome: OUTCOMES.includes(v.outcome) ? v.outcome : null,
        endedAt: timestamp(v.endedAt),
        endAt: timestamp(v.endAt),
        steps: Math.round(number(v.steps, 0, 0, 10000)),
        followUp: ["smoked", "no-smoke", "unsure"].includes(v.followUp)
          ? v.followUp
          : null,
      });
    if (typeof v.sessionId === "string") e.sessionId = text(v.sessionId, 100);
    s.events.push(e);
  }
  if (
    input.confirmations &&
    typeof input.confirmations === "object" &&
    !Array.isArray(input.confirmations)
  ) {
    for (const [key, v] of Object.entries(input.confirmations)) {
      if (
        validDay(key) &&
        v &&
        Number.isInteger(v.total) &&
        v.total >= 0 &&
        v.total <= 1000 &&
        timestamp(v.at)
      )
        s.confirmations[key] = { total: v.total, at: timestamp(v.at) };
    }
  }
  s.legacyDays = legacyDays(input.legacyDays);
  s.legacyLogs = Array.isArray(input.legacyLogs)
    ? input.legacyLogs
        .filter(
          (e) =>
            e &&
            timestamp(e.ts) &&
            ["crave", "resist", "smoke", "skip"].includes(e.type),
        )
        .map((e) => ({ ts: timestamp(e.ts), type: e.type }))
    : [];
  s.images = safeImages(input.images);
  s.quotes = Array.isArray(input.quotes)
    ? input.quotes
        .filter((q) => typeof q === "string")
        .map((q) => text(q, 500))
        .slice(0, 300)
    : [];
  s.activeSession = s.events.some(
    (e) => e.id === input.activeSession && e.type === "craving" && !e.outcome,
  )
    ? input.activeSession
    : null;
  s.migratedAt = timestamp(input.migratedAt);
  s.lastExportAt = timestamp(input.lastExportAt);
  s.legacyLastSmokeAt = timestamp(input.legacyLastSmokeAt);
  const active = s.events.find((e) => e.id === s.activeSession);
  if (active && !active.endAt)
    active.endAt = new Date(
      Date.parse(active.at) + s.profile.minutes * 60000,
    ).toISOString();
  return s;
}
export function parseBackup(raw) {
  if (typeof raw !== "string" || raw.length > 25000000)
    throw new Error("备份文件过大。");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("文件不是有效的 JSON 备份。");
  }
  return value?.version === 2 ? normalizeState(value) : migrateLegacy(value);
}
export function loadStore(storage, now = new Date()) {
  try {
    const current = storage.getItem(STORAGE_KEY);
    if (current !== null)
      return {
        state: normalizeState(JSON.parse(current)),
        issue: null,
        rawBackup: storage.getItem(LEGACY_KEY),
      };
    const old = storage.getItem(LEGACY_KEY);
    if (old !== null) {
      const state = migrateLegacy(JSON.parse(old), now);
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        return { state, issue: "storage-full", rawBackup: old };
      }
      return { state, issue: "migrated", rawBackup: old };
    }
    return { state: defaultState(), issue: null, rawBackup: null };
  } catch {
    let rawBackup = null;
    try {
      rawBackup = storage.getItem(STORAGE_KEY) || storage.getItem(LEGACY_KEY);
    } catch {
      /* browser storage denied */
    }
    return { state: defaultState(), issue: "unreadable", rawBackup };
  }
}
export function dailyStats(s, key = dayKey()) {
  const legacy = s.legacyDays[key] || { crave: 0, resist: 0, smoke: 0 };
  const events = s.events.filter((e) => dayKey(e.at) === key);
  const smokes = events.filter((e) => e.type === "smoke");
  const cravings = events.filter((e) => e.type === "craving");
  const logged = smokes.reduce((sum, e) => sum + e.count, legacy.smoke);
  const confirmation = s.confirmations[key];
  return {
    key,
    logged,
    total: Math.max(logged, confirmation?.total ?? 0),
    confirmed: !!confirmation,
    cravings: cravings.length + legacy.crave,
    practices:
      cravings.filter((e) => ["eased", "still"].includes(e.outcome)).length +
      legacy.resist,
    events,
    known: events.length > 0 || !!s.legacyDays[key] || !!confirmation,
  };
}
export function summary(s, now = new Date()) {
  const today = dayKey(now);
  let savings = 0,
    confirmedDays = 0,
    smokeFreeDays = 0;
  for (const key of Object.keys(s.confirmations)) {
    if (key >= today) continue;
    const d = dailyStats(s, key);
    confirmedDays++;
    if (d.total === 0) smokeFreeDays++;
    savings +=
      (Math.max(0, s.profile.baseline - d.total) * s.profile.packPrice) /
      s.profile.packSize;
  }
  const cravings = s.events.filter((e) => e.type === "craving");
  return {
    today: dailyStats(s, today),
    confirmedDays,
    smokeFreeDays,
    savings: Math.round(savings * 100) / 100,
    practices:
      cravings.filter((e) => ["eased", "still"].includes(e.outcome)).length +
      Object.values(s.legacyDays).reduce((n, d) => n + d.resist, 0),
    rated: cravings.filter(
      (e) =>
        e.before !== null &&
        e.after !== null &&
        e.outcome &&
        e.outcome !== "left",
    ),
  };
}
export function addSmoke(
  s,
  { count = 1, trigger = "工作压力", note = "", sessionId = null } = {},
  now = new Date(),
) {
  const event = {
    id: uid(),
    type: "smoke",
    at: new Date(now).toISOString(),
    count: Math.round(number(count, 1, 1, 200)),
    trigger: TRIGGERS.includes(trigger) ? trigger : "其他",
    note: text(note, 400),
  };
  if (sessionId) event.sessionId = sessionId;
  s.events.push(event);
  const key = dayKey(now);
  // A later cigarette invalidates a previous complete-day claim. Require a fresh confirmation.
  delete s.confirmations[key];
  return event;
}
export function startSession(s, method = "breathe", now = new Date()) {
  const active = s.events.find((e) => e.id === s.activeSession && !e.outcome);
  if (active) return active;
  const at = new Date(now).toISOString();
  const event = {
    id: uid(),
    type: "craving",
    at,
    trigger: "工作压力",
    before: null,
    after: null,
    method: METHODS.includes(method) ? method : "breathe",
    outcome: null,
    endedAt: null,
    endAt: new Date(
      new Date(now).getTime() + s.profile.minutes * 60000,
    ).toISOString(),
    steps: 0,
    note: "",
    followUp: null,
  };
  s.events.push(event);
  s.activeSession = event.id;
  return event;
}
export function finishSession(s, outcome, after = null, now = new Date()) {
  const e = s.events.find((e) => e.id === s.activeSession && !e.outcome);
  if (!e || !OUTCOMES.includes(outcome)) return null;
  e.outcome = outcome;
  e.after = rating(after);
  e.endedAt = new Date(now).toISOString();
  s.activeSession = null;
  if (outcome === "smoked")
    addSmoke(s, { trigger: e.trigger, sessionId: e.id }, now);
  return e;
}
export function remainingSeconds(session, now = Date.now()) {
  return Math.max(
    0,
    Math.ceil((Date.parse(session.endAt) - Number(now)) / 1000),
  );
}
export function confirmDay(s, key, total, now = new Date()) {
  if (!validDay(key) || key >= dayKey(now))
    throw new Error("只能确认已经结束的日期；今天还在进行中。");
  if (!Number.isInteger(total) || total < 0 || total > 1000)
    throw new Error("请输入 0–1000 之间的整数。");
  if (total < dailyStats(s, key).logged)
    throw new Error("总根数不能少于当天已有的抽烟记录。");
  s.confirmations[key] = { total, at: new Date(now).toISOString() };
}
export function insights(s) {
  const ended = s.events.filter(
    (e) =>
      e.type === "craving" && ["eased", "still", "smoked"].includes(e.outcome),
  );
  const triggers = TRIGGERS.map((name) => ({
    name,
    count: s.events.filter((e) => e.trigger === name).length,
  }))
    .filter((x) => x.count)
    .sort((a, b) => b.count - a.count);
  const methods = METHODS.map((method) => {
    const uses = ended.filter((e) => e.method === method);
    return {
      method,
      count: uses.length,
      eased: uses.filter((e) => e.outcome === "eased").length,
      rated: uses.filter((e) => e.before !== null && e.after !== null),
    };
  })
    .filter((x) => x.count)
    .sort((a, b) => b.eased - a.eased || b.count - a.count);
  return { triggers, methods, samples: ended.length };
}
