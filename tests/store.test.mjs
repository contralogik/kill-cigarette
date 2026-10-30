import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  LEGACY_KEY,
  defaultState,
  loadStore,
  migrateLegacy,
  normalizeState,
  parseBackup,
  dayKey,
  dailyStats,
  summary,
  addSmoke,
  startSession,
  finishSession,
  remainingSeconds,
  confirmDay,
} from "../store.js";

const now = new Date("2026-10-30T12:00:00");
const yesterday = new Date("2026-10-29T12:00:00");
function memory(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  };
}

test("a new user has no invented smoke-free days or advance savings", () => {
  const s = defaultState();
  startSession(s, "breathe", now);
  assert.equal(summary(s, now).smokeFreeDays, 0);
  assert.equal(summary(s, now).savings, 0);
  assert.equal(dailyStats(s, "2026-10-28").known, false);
});
test("legacy migration preserves aggregate counts without double-counting old logs or filling missing days", () => {
  const old = {
    settings: { savePerDay: 30, challengeMinutes: 7 },
    days: {
      "2026-10-29": { crave: 4, resist: 2, smoke: 2 },
      "2026-10-28": { crave: 0, resist: 0, smoke: 0 },
    },
    logs: [{ ts: yesterday.toISOString(), type: "smoke" }],
    lastSmokeTs: yesterday.toISOString(),
    quotes: ["自己的话"],
  };
  const raw = JSON.stringify(old),
    storage = memory({ [LEGACY_KEY]: raw });
  const { state: s, issue } = loadStore(storage, now);
  assert.equal(issue, "migrated");
  assert.equal(storage.getItem(LEGACY_KEY), raw);
  assert.ok(storage.getItem(STORAGE_KEY));
  assert.equal(dailyStats(s, "2026-10-29").total, 2);
  assert.equal(dailyStats(s, "2026-10-28").known, false);
  assert.equal(summary(s, now).smokeFreeDays, 0);
  assert.equal(s.profile.minutes, 7);
  assert.equal(s.legacyLastSmokeAt, yesterday.toISOString());
  assert.deepEqual(s.quotes, ["自己的话"]);
  assert.equal(loadStore(storage, now).rawBackup, raw);
  addSmoke(s, {}, yesterday);
  assert.equal(dailyStats(s, "2026-10-29").total, 3);
});
test("corrupt saved data is reported and never overwritten by loading", () => {
  const storage = memory({ [STORAGE_KEY]: "{broken" });
  const result = loadStore(storage);
  assert.equal(result.issue, "unreadable");
  assert.equal(result.rawBackup, "{broken");
  assert.equal(storage.getItem(STORAGE_KEY), "{broken");
});
test("storage quota failure during migration preserves both the recovered state and original backup", () => {
  const raw = JSON.stringify({ days: { "2026-10-29": { smoke: 3 } } });
  const storage = {
    getItem: (k) => (k === LEGACY_KEY ? raw : null),
    setItem() {
      throw new Error("Quota");
    },
  };
  const result = loadStore(storage, now);
  assert.equal(result.issue, "storage-full");
  assert.equal(dailyStats(result.state, "2026-10-29").total, 3);
  assert.equal(result.rawBackup, raw);
});
test("blocked browser storage returns usable in-memory state", () => {
  const result = loadStore({
    getItem() {
      throw new Error("SecurityError");
    },
  });
  assert.equal(result.issue, "unreadable");
  assert.equal(result.state.version, 2);
});
test("savings use actual confirmed completed days and cost per cigarette", () => {
  const s = defaultState();
  confirmDay(s, "2026-10-29", 10, now);
  confirmDay(s, "2026-10-28", 0, now);
  const stats = summary(s, now);
  assert.equal(stats.savings, 37.5);
  assert.equal(stats.smokeFreeDays, 1);
  assert.equal(stats.confirmedDays, 2);
  assert.equal(summary(s, yesterday).confirmedDays, 1);
});
test("an incomplete day and totals lower than existing records cannot be confirmed", () => {
  const s = defaultState();
  addSmoke(s, { count: 3 }, yesterday);
  assert.throws(() => confirmDay(s, "2026-10-30", 0, now), /已经结束/);
  assert.throws(() => confirmDay(s, "2026-10-29", 2, now), /少于/);
  assert.throws(() => confirmDay(s, "2026-02-30", 0, now), /已经结束/);
});
test("a later smoke entry invalidates an already confirmed day", () => {
  const s = defaultState();
  confirmDay(s, "2026-10-29", 0, now);
  addSmoke(s, {}, yesterday);
  assert.equal(summary(s, now).smokeFreeDays, 0);
  assert.equal(dailyStats(s, "2026-10-29").confirmed, false);
});
test("sessions resume with the original deadline and reaching zero never awards success", () => {
  const s = defaultState(),
    e = startSession(s, "breathe", now);
  assert.equal(startSession(s, "walk", now).id, e.id);
  assert.equal(s.events.length, 1);
  const restored = normalizeState(JSON.parse(JSON.stringify(s)));
  const session = restored.events[0];
  assert.equal(remainingSeconds(session, now.getTime() + 60000), 60);
  assert.equal(remainingSeconds(session, now.getTime() + 300000), 0);
  assert.equal(session.outcome, null);
  assert.equal(summary(restored, now).practices, 0);
});
test("leaving does not count as a completed practice; still craving is recorded honestly", () => {
  const s = defaultState();
  startSession(s, "walk", now);
  finishSession(s, "left", null, now);
  assert.equal(summary(s, now).practices, 0);
  startSession(s, "walk", now);
  finishSession(s, "still", 9, now);
  assert.equal(summary(s, now).practices, 1);
  assert.equal(s.events[1].outcome, "still");
  assert.equal(summary(s, now).rated.length, 0);
});
test("zero is a valid craving rating; optional scores remain missing when skipped", () => {
  const s = defaultState(),
    e = startSession(s, "breathe", now);
  e.before = 8;
  finishSession(s, "eased", 0, now);
  const restored = normalizeState(s);
  assert.equal(restored.events[0].after, 0);
  assert.equal(summary(restored, now).rated.length, 1);
  startSession(s, "breathe", now);
  finishSession(s, "eased", null, now);
  assert.equal(summary(s, now).rated.length, 1);
});
test("smoked session records one cigarette and cannot be completed twice", () => {
  const s = defaultState();
  startSession(s, "breathe", now);
  finishSession(s, "smoked", null, now);
  finishSession(s, "smoked", null, now);
  assert.equal(dailyStats(s, dayKey(now)).total, 1);
  assert.equal(s.events.filter((e) => e.type === "smoke").length, 1);
});
test("more than sixty new records survive export and import", () => {
  const s = defaultState();
  for (let i = 0; i < 85; i++) addSmoke(s, {}, now);
  const restored = parseBackup(JSON.stringify(s));
  assert.equal(restored.events.length, 85);
  assert.equal(dailyStats(restored, dayKey(now)).total, 85);
});
test("malformed, duplicate or unsupported imports are rejected before changing the source", () => {
  assert.throws(() => parseBackup("{bad"), /JSON/);
  assert.throws(() => parseBackup('{"unrelated":true}'), /旧版/);
  const s = defaultState();
  addSmoke(s, {}, now);
  s.events.push({ ...s.events[0] });
  assert.throws(() => parseBackup(JSON.stringify(s)), /重复/);
  s.events.pop();
  s.events[0].count = -2;
  assert.throws(() => parseBackup(JSON.stringify(s)), /无效/);
});
test("migrated photos and text survive a v2 roundtrip without creating executable image sources", () => {
  const s = migrateLegacy({
    days: {},
    images: ["data:image/png;base64,AAAA", "javascript:alert(1)"],
    quotes: ["<script>not executed</script>"],
  });
  const restored = parseBackup(JSON.stringify(s));
  assert.deepEqual(restored.images, ["data:image/png;base64,AAAA"]);
  assert.deepEqual(restored.quotes, ["<script>not executed</script>"]);
});
