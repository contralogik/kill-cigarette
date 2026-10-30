import {
  STORAGE_KEY,
  LEGACY_KEY,
  TRIGGERS,
  defaultState,
  loadStore,
  normalizeState,
  parseBackup,
  dayKey,
  previousDays,
  dailyStats,
  summary,
  addSmoke,
  startSession,
  finishSession,
  remainingSeconds,
  confirmDay,
  insights,
} from "./store.js";
import {
  SCENES,
  sceneById,
  art,
  MOTIVATION,
  EXERCISES,
  exerciseById,
  QUOTES,
  SOURCES,
} from "./content.js";

const h = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  leaf: '<path d="M20 4C10 3 4 6 4 12a7 7 0 0 0 7 7c6 0 9-7 9-15Z"/><path d="M4 21 15 10"/>',
  settings:
    '<path d="m9 3-.6 3-2 .9L4 6l-2 3 2.4 2v2L2 15l2 3 2.4-.9 2 .9.6 3h4l.6-3 2-.9 2.4.9 2-3-2.4-2v-2L20 9l-2-3-2.4.9-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/>',
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  note: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  person:
    '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2Z"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h15"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  walk: '<circle cx="13" cy="4" r="2"/><path d="m10 21 2-7-3-3 3-5 3 5 4 1M5 14l4-3M8 21l2-6m2-1 5 7"/>',
  water: '<path d="M5 4h14l-2 17H7L5 4Z"/><path d="M6 10c3-3 7 3 12 0"/>',
  wind: '<path d="M3 8h12c5 0 4-6 1-5M3 12h16c4 0 4 6 0 6M3 16h8c3 0 3 5 0 5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hand: '<path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v8c0 4-3 6-7 6-3 0-5-2-7-4l-3-4c-1-2 1-4 3-2l2 2Z"/>',
  chart: '<path d="M4 20V9m8 11V4m8 16v-8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  image:
    '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4m0 3v.2"/>',
  edit: '<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.leaf}</svg>`;
const root = document.getElementById("app");
let loaded = loadStore({
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
});
let state = loaded.state,
  issue = loaded.issue,
  rawBackup = loaded.rawBackup;
let blocked = issue === "unreadable";
let page = "home",
  recoveryId = null,
  resultId = null,
  quoteIndex = 0,
  selectedDay = dayKey(),
  historyLimit = 20,
  recordFilter = "all";
let motivationReturn = "home";
let toastTimer,
  saveTimer,
  handStarted = false;
let renderedDay = dayKey();
const outcomes = {
  eased: "感觉缓和",
  still: "仍有烟瘾",
  smoked: "之后抽了",
  left: "暂时退出",
};

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 4000);
}
function save() {
  clearTimeout(saveTimer);
  if (blocked) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (issue === "storage-full") {
      issue = null;
      updateStorageBanner();
    }
    return true;
  } catch {
    issue = "storage-full";
    updateStorageBanner();
    return false;
  }
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 200);
}
function storageBanner() {
  if (issue === "migrated")
    return `<div class="notice">旧版记录已接续；未记录的日期保留为空白。<button data-action="dismiss-migration" class="text-button">知道了</button></div>`;
  if (issue === "storage-full")
    return `<div class="notice warning">当前记录暂时无法保存到这个浏览器。请先导出，避免刷新后丢失。<button data-action="export" class="text-button">导出当前记录</button></div>`;
  if (issue === "unreadable")
    return `<div class="notice warning">本机记录暂时无法读取，原始数据已保留。当前练习只会暂存在页面中。<button data-action="raw-backup" class="text-button">下载原始备份</button><button data-action="import" class="text-button">导入备份恢复</button></div>`;
  return "";
}
function updateStorageBanner() {
  const n = document.getElementById("storage-status");
  if (n) n.innerHTML = storageBanner();
}
function sceneData(id = state.profile.scene) {
  if (id?.startsWith("legacy-")) {
    const image = state.images[Number(id.slice(7))];
    if (image)
      return {
        id,
        name: "我的旧版照片",
        line: "留一张对自己有意义的照片。",
        alt: "从旧版保留的自选照片",
        src: image,
      };
  }
  const scene = sceneById(id);
  return { ...scene, src: art(scene.id) };
}
function picture(id, cls = "", eager = false) {
  const s = sceneData(id);
  return `<img class="${cls}" src="${h(s.src)}" alt="${h(s.alt)}" width="1200" height="800" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function quote(context = "general") {
  if (state.profile.tone === "off") return "";
  const pool =
    context === "restart"
      ? QUOTES.restart
      : QUOTES[state.profile.tone] || QUOTES.gentle;
  return pool[(quoteIndex + new Date().getDate()) % pool.length];
}
function quoteBlock(context) {
  const q = quote(context);
  return q
    ? `<aside class="quiet-quote">${icon("leaf")}<p>${h(q)}</p><button class="icon-button" data-action="quote" aria-label="换一句话">${icon("arrow")}</button></aside>`
    : "";
}
function header() {
  const title = {
    rescue: "压力救急",
    recovery: "记下这一根",
    gallery: "给这一刻换个风景",
    motivation: "我的激励",
    help: "找到更多支持",
    result: "练习记录",
  }[page];
  if (title)
    return `<header class="app-header narrow"><button class="icon-button" data-action="${page === "rescue" ? "exit-session" : page === "motivation" ? "motivation-return" : "back-home"}" aria-label="${page === "rescue" ? "先退出练习" : page === "motivation" ? "返回上一页" : "返回现在"}">${icon("back")}</button><span class="header-title">${title}</span><span class="header-spacer"></span></header>`;
  return `<header class="app-header"><button class="brand" data-page="home" aria-label="Kill Cigarette 首页">Kill Cigarette</button><button class="icon-button" data-page="my" aria-label="打开设置">${icon("settings")}</button></header>`;
}
function nav() {
  if (["rescue", "result"].includes(page)) return "";
  return `<nav class="bottom-nav" aria-label="主要导航">${[
    ["home", "home", "现在"],
    ["records", "note", "记录"],
    ["my", "person", "我的"],
  ]
    .map(
      ([id, i, label]) =>
        `<button data-page="${id}" ${page === id || (page === "recovery" && id === "records") ? 'aria-current="page"' : ""}>${icon(i)}<span>${label}</span></button>`,
    )
    .join("")}</nav>`;
}
function planSteps() {
  return `<div class="plan-steps"><span>${icon("walk")}离开工位</span>${icon("arrow", "step-arrow")}<span>${icon("water")}喝口水</span>${icon("arrow", "step-arrow")}<span>${icon("note")}写下下一步</span></div>`;
}
function homePage() {
  const stats = summary(state),
    d = stats.today;
  const rated = d.events.filter(
    (e) =>
      e.type === "craving" &&
      e.before !== null &&
      e.after !== null &&
      e.outcome &&
      e.outcome !== "left",
  );
  const last = rated.at(-1);
  return `${state.activeSession ? `<button class="resume-banner" data-action="start">${icon("wind")}继续刚才的练习${icon("arrow")}</button>` : ""}
  <section class="home-hero">
    <div class="home-text"><h1>压力上来时，<br>先停一会儿。</h1><p class="lead">工作卡住了，也可以先照顾自己。</p></div>
    <figure class="home-landscape">${picture(state.profile.scene, "", true)}</figure>
    <div class="home-actions"><button class="button primary" data-action="start">${state.activeSession ? "继续刚才的练习" : "我现在想抽烟"}</button><button class="button secondary" data-action="log-smoke">刚刚抽了，记一下</button></div>
  </section>
  <section class="open-section home-plan"><div class="section-heading"><h2>我的工作减压预案</h2><button class="text-button" data-page="my" aria-label="编辑工作减压预案">修改</button></div>${planSteps()}<p class="muted plan-copy">${h(state.profile.plan)}</p><p class="caption">先试两分钟，结束后再看看感觉。</p></section>
  <section class="open-section"><div class="section-heading"><h2>今天</h2><button class="text-button" data-page="records">查看记录${icon("arrow")}</button></div><div class="today-stats"><div>${icon("note")}<span>抽烟记录<strong>${d.total > 0 ? `${d.total} 根` : "尚未记录"}</strong></span></div><div>${icon("leaf")}<span>应对练习<strong>${d.practices ? `${d.practices} 次` : "尚未记录"}</strong></span></div><div>${icon("chart")}<span>烟瘾变化<strong>${last ? `${last.before} → ${last.after}` : "尚未记录"}</strong></span></div></div></section>
  ${state.profile.reason ? `<section class="personal-reason"><p class="caption">我想重新停下来的理由</p><p>${h(state.profile.reason)}</p></section>` : ""}
  ${quoteBlock("general")}
  <section class="motivation-invitation"><div><h2>给自己一点激励</h2><p class="muted">留一个喜欢的画面，陪自己停一会儿。</p><button class="text-button" data-page="motivation">打开我的激励${icon("arrow")}</button></div><button data-page="motivation" aria-label="打开五张激励图"><img src="./assets/motivation/${state.profile.motivation}.png" alt="你选择的激励图" loading="lazy" width="160" height="120"></button></section>
  <section class="scene-invitation"><div><h2>给自己换个风景</h2><p class="muted">12 个安静的地方，留一小段空隙。</p><button class="text-button" data-page="gallery">去场景里坐一会儿${icon("arrow")}</button></div><button data-page="gallery" aria-label="打开水彩场景库">${picture("morning-coast")}</button></section>
  <button class="support-link" data-page="help">${icon("help")}也可以找人一起制定戒烟计划${icon("arrow")}</button>`;
}
function ratingControl(kind, value, title) {
  return `<div class="rating-control"><label for="rating-${kind}">${title}<span id="rating-${kind}-value">${value === null ? "可跳过" : `${value} / 10`}</span></label><input id="rating-${kind}" data-rating="${kind}" type="range" min="0" max="10" step="1" value="${value ?? 5}" aria-valuetext="${value === null ? "尚未评分，可跳过" : `${value} 分`}"><div class="range-labels"><span>不太想</span><span>很强烈</span></div></div>`;
}
function triggerButtons(value, owner) {
  const buttons = (list) =>
    `<div class="choices" aria-label="触发场景">${list.map((t) => `<button class="choice" data-trigger="${t}" data-owner="${owner}" aria-pressed="${t === value}">${t}</button>`).join("")}</div>`;
  if (owner === "smoke")
    return `${buttons(TRIGGERS.slice(0, 3))}<details class="more-triggers"><summary>更多场景${TRIGGERS.slice(3).includes(value) ? `：${h(value)}` : ""}</summary>${buttons(TRIGGERS.slice(3))}</details>`;
  return buttons(TRIGGERS);
}
function rescuePage() {
  const e = state.events.find((e) => e.id === state.activeSession);
  if (!e) return homePage();
  const m = exerciseById(e.method);
  const visual =
    e.method === "breathe" || e.method === "hands"
      ? `<${e.method === "hands" ? "button" : "div"} class="breath-visual ${e.method === "hands" ? "hand-orb" : ""}" ${e.method === "hands" ? 'id="hand-orb" aria-label="按住轻握拳，松开时放松手掌"' : ""}><img src="./assets/art/breath-ring.webp" alt="" width="500" height="500"><span class="orb-label">${e.method === "hands" ? "按住 · 再放松" : "慢慢呼气"}</span><span class="timer" data-timer>02:00</span></${e.method === "hands" ? "button" : "div"}>`
      : `<figure class="exercise-landscape">${picture(m.scene, "", true)}<figcaption><span class="timer" data-timer>02:00</span></figcaption></figure>`;
  return `<section class="rescue-intro"><h1>${m.title}</h1><p class="lead">${m.intro}</p></section>${visual}
  <p class="exercise-instruction">${e.method === "breathe" ? "按舒服的节奏，不用憋气。" : h(m.step)}</p>${e.method === "hands" ? `<p class="caption centered" id="hand-count">已放松 ${e.steps} 次 · 按自己的节奏</p>` : ""}
  <p id="timer-hint" class="caption centered"></p>
  ${e.method === "task" ? `<label class="field-label" for="task-note">我的最小下一步（可选）</label><textarea id="task-note" data-session-note maxlength="400" rows="2" placeholder="例如：只写一个标题。">${h(e.note)}</textarea>` : ""}
  ${ratingControl("before", e.before, "现在有多想抽？")}
  <div class="action-note">${icon("note")}<span>下一步：喝水，然后写下工作中最小的一步。</span></div>
  <div class="stack"><button class="button primary" data-outcome="eased">现在缓下来一些了</button><button class="button secondary" data-outcome="still">还很想抽，换个办法</button><button class="text-button subtle" data-outcome="smoked">这次抽了，记下来</button></div>
  <details class="trigger-details"><summary>这次的触发：${h(e.trigger)} <span>修改</span></summary>${triggerButtons(e.trigger, "session")}</details>
  <button class="motivation-link" data-page="motivation">${icon("image")}看一张我的激励图${icon("arrow")}</button>
  <details class="method-options"><summary>换一种练习</summary>${methodList(e.method)}</details>
  <div class="rescue-footer"><button class="text-button" data-action="exit-session">先退出</button>${quoteBlock("general")}</div>`;
}
function methodList(current = "") {
  return `<div class="method-list">${EXERCISES.filter((m) => m.id !== current)
    .map(
      (m) =>
        `<button data-method="${m.id}"><img src="./assets/art/${m.scene}-thumb.webp" alt="" width="160" height="106" loading="lazy"><span><strong>${m.name}</strong><small>${m.short}</small></span>${icon("arrow")}</button>`,
    )
    .join("")}</div>`;
}
function resultPage() {
  const e = state.events.find((e) => e.id === resultId);
  if (!e) return homePage();
  return `<h1>${e.outcome === "still" ? "还很想抽，<br>也可以换条路。" : "这段练习记下了。"}</h1><p class="lead">${e.outcome === "still" ? "试试另一个办法，也可以找人一起帮忙。" : "给自己留出停顿的空间，就是这次的练习。"}</p>
  <figure class="result-art">${picture(e.outcome === "still" ? "water-break" : "paper-boat", "", true)}</figure>
  ${ratingControl("after", e.after, "现在的烟瘾强度（可选）")}
  <p class="muted">记录真实感受就好。之后的情况，也可以在记录页补充。</p>
  ${e.outcome === "still" ? methodList(e.method) : ""}
  <div class="stack"><button class="button primary" data-page="home">回到现在</button>${e.outcome !== "still" ? '<button class="button secondary" data-action="start">再给自己一小段时间</button>' : ""}</div>
  <button class="support-link" data-page="help">${icon("help")}了解戒烟门诊与药物支持${icon("arrow")}</button>${quoteBlock("general")}`;
}
function recoveryPage() {
  const e = state.events.find((e) => e.id === recoveryId && e.type === "smoke");
  if (!e)
    return `<h1>接下来继续。</h1><p class="lead">这条记录已撤销。</p><button class="button primary" data-page="home">回到现在</button>`;
  return `<h1>这根记下了。<br>接下来继续。</h1><p class="lead">之前没抽的那些时刻，依然算数。</p><p class="muted">先把烟和打火机收远一点。</p>
  <figure class="recovery-art">${picture("mist-lake", "", true)}</figure>
  <div class="count-row"><label for="smoke-count">这次抽了几根</label><div class="stepper"><button class="icon-button" data-count="-1" aria-label="减少一根">−</button><input id="smoke-count" data-smoke-count type="number" min="1" max="200" step="1" value="${e.count}" inputmode="numeric"><button class="icon-button" data-count="1" aria-label="增加一根">${icon("plus")}</button></div></div>
  <section class="open-section recovery-triggers"><h2>刚才发生了什么？</h2>${triggerButtons(e.trigger, "smoke")}<details class="optional-note" ${e.note ? "open" : ""}><summary>补充一句（可选）</summary><label class="sr-only" for="smoke-note">补充这次的情况</label><textarea id="smoke-note" data-smoke-note maxlength="400" rows="2" placeholder="想说的话，可以记在这里，也可以以后再补。">${h(e.note)}</textarea></details></section>
  <section class="open-section"><h2>下次压力上来时</h2><label class="sr-only" for="recovery-plan">下次的应对计划</label><div class="editable-plan">${icon("edit")}<textarea id="recovery-plan" data-plan maxlength="400" rows="2">${h(state.profile.plan)}</textarea></div></section>
  <div class="stack"><button class="button primary" data-page="home">从现在继续</button><button class="text-button" data-page="records">看看今天的记录</button><button class="text-button subtle" data-action="undo-smoke">撤销这条记录</button></div>`;
}
function dateLabel(key) {
  const d = new Date(`${key}T12:00:00`);
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}
function eventItem(e) {
  const smoke = e.type === "smoke";
  const time = new Date(e.at).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `<li class="event-row"><div class="event-marker">${icon(smoke ? "note" : "leaf")}</div><div class="event-body"><div class="event-title"><strong>${smoke ? `记录抽烟 ${e.count} 根` : exerciseById(e.method).name}</strong><time datetime="${h(e.at)}">${time}</time></div><p class="muted">${h(e.trigger)}${!smoke ? ` · ${outcomes[e.outcome] || "练习进行中"}` : ""}${!smoke && e.before !== null && e.after !== null ? ` · 烟瘾 ${e.before} → ${e.after}` : ""}</p>${e.note ? `<p class="event-note">${h(e.note)}</p>` : ""}${
    !smoke && e.outcome && e.outcome !== "left"
      ? `<details class="followup"><summary>后来有没有抽？${e.followUp ? ` · ${{ smoked: "抽了", "no-smoke": "没有抽", unsure: "暂不确定" }[e.followUp]}` : ""}</summary><div class="choices">${[
          ["no-smoke", "后来没有抽"],
          ["smoked", "后来抽了"],
          ["unsure", "暂时不确定"],
        ]
          .map(
            ([v, t]) =>
              `<button class="choice" data-followup="${v}" data-id="${h(e.id)}" aria-pressed="${e.followUp === v}">${t}</button>`,
          )
          .join(
            "",
          )}</div><p class="caption">选择“后来抽了”会记一根；同一次练习不会重复添加。</p></details>`
      : ""
  }</div>${smoke ? `<button class="icon-button small" data-undo="${h(e.id)}" aria-label="撤销这条抽烟记录">${icon("close")}</button>` : ""}</li>`;
}
function recordsPage() {
  const totals = summary(state),
    days = previousDays(),
    today = dayKey();
  const d = dailyStats(state, selectedDay),
    info = insights(state);
  const filtered = [...d.events]
    .filter((e) => recordFilter === "all" || e.type === recordFilter)
    .sort((a, b) => b.at.localeCompare(a.at));
  const logs = state.legacyLogs.filter((e) => dayKey(e.ts) === selectedDay);
  const yesterday = previousDays(2)[0];
  const confirmationKey = selectedDay < today ? selectedDay : yesterday;
  const confirmedStats = dailyStats(state, confirmationKey);
  return `<div class="page-heading"><h1>一步一步，<br>都有记录。</h1><p class="lead">留意发生了什么，慢慢找到适合自己的办法。</p></div>
  <section class="record-totals"><div><strong>${totals.smokeFreeDays}</strong><span>已确认无烟日</span></div><div><strong>${totals.practices}</strong><span>累计应对练习</span></div><div><strong>${totals.confirmedDays ? `¥${totals.savings.toFixed(2).replace(/\.00$/, "")}` : "—"}</strong><span>估算少花的钱</span></div></section><p class="caption">仅按 ${totals.confirmedDays} 个已确认日期、当前用量和烟价设置估算。</p>
  <section class="open-section"><h2>最近七天</h2><div class="week-strip">${days
    .map((key) => {
      const x = dailyStats(state, key);
      const free = key < today && x.confirmed && x.total === 0;
      return `<button data-day="${key}" class="day-cell ${free ? "confirmed-free" : x.total > 0 ? "has-record" : ""}" aria-pressed="${key === selectedDay}"><span>${["日", "一", "二", "三", "四", "五", "六"][new Date(`${key}T12:00:00`).getDay()]}</span><strong>${Number(key.slice(-2))}</strong><small>${x.total > 0 ? `${x.total} 根` : free ? "无烟" : key === today ? "进行中" : "未确认"}</small></button>`;
    })
    .join(
      "",
    )}</div><p class="caption">空白和未确认的日期，不算作无烟日。</p></section>
  <section class="open-section"><div class="section-heading"><h2>${dateLabel(selectedDay)}${selectedDay === today ? " · 今天" : ""}</h2><input type="date" class="date-picker" id="history-date" value="${selectedDay}" max="${today}" aria-label="查看其他日期的记录"></div>
  <div class="filter-tabs" role="group" aria-label="记录类型">${[
    ["all", "全部"],
    ["smoke", "抽烟"],
    ["craving", "练习"],
  ]
    .map(
      ([v, label]) =>
        `<button data-filter="${v}" aria-pressed="${recordFilter === v}">${label}</button>`,
    )
    .join("")}</div>
  ${filtered.length ? `<ul class="event-list">${filtered.slice(0, historyLimit).map(eventItem).join("")}</ul>${filtered.length > historyLimit ? '<button class="text-button" data-action="more-records">查看更多记录</button>' : ""}` : `<div class="empty-state">${picture("new-leaf")}<p>${d.known ? "这一天还没有这类新版明细。" : "这一天还没有记录。"}</p><span class="caption">真实发生时再记下，未记录不代表没有抽烟。</span></div>`}
  ${state.legacyDays[selectedDay] ? `<div class="legacy-summary"><strong>保留的旧版汇总</strong><p class="muted">冲动 ${state.legacyDays[selectedDay].crave} 次 · 忍住 ${state.legacyDays[selectedDay].resist} 次 · 抽烟计数 ${state.legacyDays[selectedDay].smoke} 次</p><p class="caption">旧版抽烟计数已计入当天总数，明细不重复累加。</p>${logs.length ? `<details><summary>查看旧版明细（${logs.length} 条）</summary><ul>${logs.map((e) => `<li>${new Date(e.ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} · ${{ smoke: "抽了", crave: "想抽", resist: "忍住", skip: "跳过 / 顶过去" }[e.type]}</li>`).join("")}</ul></details>` : ""}</div>` : ""}</section>
  <section class="open-section confirmation-section"><h2>把已经过去的一天补完整</h2><p class="muted">确认全天总根数后，才会计入无烟日与节省估算。</p><form id="confirm-day"><div class="two-fields"><label>日期<input name="day" type="date" max="${yesterday}" value="${confirmationKey}" required></label><label>当天一共抽了几根<input name="total" type="number" min="0" max="1000" step="1" inputmode="numeric" value="${confirmedStats.known ? confirmedStats.total : ""}" placeholder="没抽填 0" required></label></div><button class="button secondary" type="submit">确认这一天</button></form></section>
  <section class="open-section"><h2>从自己的记录里找线索</h2>${info.samples >= 3 ? `<p class="muted">已记录 ${info.samples} 段练习${info.triggers[0] ? `，常见触发是“${h(info.triggers[0].name)}”` : ""}。</p><div class="insight-list">${info.methods.map((m) => `<p><strong>${exerciseById(m.method).name}</strong><span>${m.count} 次记录 · ${m.eased} 次自报缓和</span></p>`).join("")}</div><p class="caption">这里只描述你的自报记录，样本少，也不能证明某个方法的疗效。</p>` : `<p class="muted">再积累几次“场景—办法—结果”，这里会帮你回顾。现在先从一条真实记录开始。</p>`}</section>`;
}
function galleryPage() {
  return `<h1>找个地方，<br>让目光歇一会儿。</h1><p class="lead">选一张喜欢的，留在首页。随时可以换。</p><div class="gallery">${SCENES.map((s) => `<button class="scene-choice" data-scene="${s.id}" aria-pressed="${state.profile.scene === s.id}"><img src="./assets/art/${s.id}-thumb.webp" alt="${h(s.alt)}" width="360" height="240" loading="lazy"><span><strong>${s.name}</strong>${state.profile.scene === s.id ? icon("check") : ""}</span><small>${s.line}</small></button>`).join("")}</div>${state.images.length ? `<section class="open-section"><h2>从旧版保留的照片</h2><div class="gallery">${state.images.map((src, i) => `<button class="scene-choice" data-scene="legacy-${i}" aria-pressed="${state.profile.scene === `legacy-${i}`}"><img src="${h(src)}" alt="旧版自选照片 ${i + 1}" loading="lazy"><span>我的照片 ${i + 1}</span></button>`).join("")}</div></section>` : ""}<p class="caption">内置场景由 AI 生成，用于陪伴与视觉休息；照片和场景选择保存在本机。</p>`;
}
function motivationPage() {
  const selected =
    MOTIVATION.find((m) => m.id === state.profile.motivation) || MOTIVATION[0];
  return `<h1>给自己一点力量。</h1><p class="lead">你选的画面，留给此刻的一点提醒。</p><figure class="motivation-feature"><img src="./assets/motivation/${selected.id}.png" alt="${selected.alt}" width="600" height="600"><figcaption><strong>${selected.name}</strong><p>${selected.line}</p></figcaption></figure><div class="motivation-controls"><button class="button secondary" data-motivation-step="-1">上一张</button><span>${MOTIVATION.indexOf(selected) + 1} / ${MOTIVATION.length}</span><button class="button secondary" data-motivation-step="1">下一张</button></div><div class="motivation-thumbnails" aria-label="选择激励图">${MOTIVATION.map((m) => `<button data-motivation="${m.id}" aria-label="${m.name}" aria-pressed="${selected.id === m.id}"><img src="./assets/motivation/${m.id}.png" alt="" loading="lazy" width="120" height="120"></button>`).join("")}</div>${quoteBlock("general")}<div class="stack"><button class="button primary" data-action="${state.activeSession ? "start" : "motivation-return"}">${state.activeSession ? "继续刚才的练习" : "带着这点力量，继续"}</button></div><p class="caption">图片保留原貌。配文是应用提供的提醒。</p>`;
}
function myPage() {
  return `<h1>给自己，<br>一点合适的支持。</h1><p class="lead">把理由和下一步，写成自己的话。</p>
  <form id="profile-form"><section class="open-section"><h2>我想停下来的理由</h2><label class="field-label" for="reason">只写对你有意义的一句（可选）</label><textarea id="reason" name="reason" maxlength="240" rows="3" placeholder="例如：想让工作间隙，重新成为真正的休息。">${h(state.profile.reason)}</textarea><label class="field-label" for="plan">工作压力上来时，我先做什么</label><textarea id="plan" name="plan" maxlength="400" rows="3" required>${h(state.profile.plan)}</textarea></section>
  <section class="open-section"><h2>用量与节省估算</h2><p class="muted">这些是用于估算的基线，可以按自己的情况修改。</p><div class="two-fields"><label>原本每天大约几根<input name="baseline" type="number" min="0" max="200" step="1" value="${state.profile.baseline}" required></label><label>一包有几根<input name="packSize" type="number" min="1" max="100" step="1" value="${state.profile.packSize}" required></label></div><label class="field-label">一包价格（元）<input name="packPrice" type="number" min="0" max="10000" step="0.01" value="${state.profile.packPrice}" required></label></section>
  <section class="open-section"><h2>练习与陪伴</h2><div class="two-fields"><label>每段练习（分钟）<input name="minutes" type="number" min="1" max="15" step="1" value="${state.profile.minutes}" required></label><label>一句话的语气<select name="tone">${[
    ["gentle", "温和陪伴"],
    ["direct", "直接行动"],
    ["reflective", "一点哲思"],
    ["off", "关闭短句"],
  ]
    .map(
      ([v, label]) =>
        `<option value="${v}" ${state.profile.tone === v ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></label></div><label class="check-field"><input type="checkbox" name="motion" ${state.profile.motion ? "checked" : ""}>启用轻柔的呼吸动效</label><p class="caption">也会尊重设备的“减少动态效果”设置。时长只是练习安排，不保证烟瘾到点消失。</p></section><button class="button primary" type="submit">保存我的设置</button></form>
  <section class="open-section"><div class="section-heading"><h2>我的戒烟计划</h2><button class="text-button" data-action="quit-start">${state.profile.quitStartedAt ? "重新设置起点" : "从现在开始"}</button></div><p class="muted">${state.profile.quitStartedAt ? `计划起点：${new Date(state.profile.quitStartedAt).toLocaleString("zh-CN", { hour12: false })}。历史记录会一直保留。` : "准备好时，给这次计划留一个起点。历史上的努力会一直保留。"}</p></section>
  <section class="open-section"><h2>激励、场景与更多支持</h2><button class="menu-row" data-page="motivation">${icon("image")}我的激励<span>你选择的 5 张图</span>${icon("arrow")}</button><button class="menu-row" data-page="gallery">${icon("image")}选择首页风景<span>12 张水彩</span>${icon("arrow")}</button><button class="menu-row" data-page="help">${icon("help")}戒烟支持与使用说明${icon("arrow")}</button></section>
  <section class="open-section"><h2>记录与备份</h2><p class="muted">记录保存在这个浏览器。换设备或清理浏览器前，记得导出备份。</p><div class="two-buttons"><button class="button secondary" data-action="export">${icon("download")}导出数据</button><button class="button secondary" data-action="import">导入备份</button></div>${state.lastExportAt ? `<p class="caption">最近导出：${new Date(state.lastExportAt).toLocaleString("zh-CN", { hour12: false })}</p>` : ""}${rawBackup ? '<button class="text-button" data-action="raw-backup">下载升级前的原始备份</button>' : ""}<details class="data-details"><summary>管理本机数据</summary><p class="caption">建议先导出，再操作。清空会同时移除这个浏览器里的新版记录和旧版备份。</p><button class="text-button" data-action="reset">清空本机数据</button></details></section>
  <footer class="app-about">Kill Cigarette 2.0 · 给每一次重新开始留个位置。</footer>`;
}
function helpPage() {
  return `<h1>可以找人，<br>一起把计划做好。</h1><figure class="help-art">${picture("new-leaf", "", true)}</figure><section class="open-section"><h2>把戒断和压力都照顾到</h2><p>如果每天抽得较多、醒来很快就想抽，或反复复抽，可以联系戒烟门诊、全科或呼吸科医生，讨论行为支持和适合自己的戒烟药物。</p><p>WHO 推荐行为支持与药物结合。尼古丁替代治疗等方案需要结合个人情况选择；用药种类、剂量和禁忌，请由医生或药师评估。</p><p>你可以带着这里导出的记录，描述常见触发、烟瘾强度和之前尝试过的办法。</p></section><section class="open-section"><h2>这几分钟里，先做点什么</h2><p>离开吸烟线索、喝水、慢呼吸、短距离走动或让手忙起来，都可以作为应对练习。按舒适的节奏做，不用憋气；感觉不适就停。</p><p>已经抽过，也可以记录这次发生了什么，为下一次准备一个具体动作。此前没抽的那些时刻，依然算数。</p></section><section class="open-section"><h2>关于统计与本机数据</h2><p>未记录不代表无烟。只有已经结束、由你确认总根数的日期，才计入无烟日和节省估算。节省按“基线根数减实际总根数 × 每根成本”估算，低于零按零计。</p><p>烟瘾评分与后续结果都是自报，用于回顾经验，不代表诊断或疗效评估。两分钟、七分钟或一次互动，都不保证烟瘾消失。</p><p>应用不会上传你的记录、评分、理由或旧版照片。首次联网打开后可缓存基础页面和看过的插图；本机记录仍建议定期导出备份。</p></section><section class="open-section"><h2>参考资料</h2><ul class="source-list">${SOURCES.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name}${icon("arrow")}</a></li>`).join("")}</ul><p class="caption">短句是应用原创文案；内置插图由 AI 生成。应用用于自我记录与应对练习。</p></section><button class="button primary" data-page="home">回到现在</button>`;
}

function navigate(next, replace = false) {
  if (next === "motivation" && page !== "motivation") motivationReturn = page;
  clearTimeout(saveTimer);
  save();
  if (replace) {
    history.replaceState(null, "", `#${next}`);
    route();
  } else if (location.hash === `#${next}`) route();
  else location.hash = next;
}
function route() {
  const next = location.hash.slice(1);
  const allowed = [
    "home",
    "records",
    "my",
    "gallery",
    "motivation",
    "help",
    "rescue",
    "recovery",
    "result",
  ];
  page = allowed.includes(next) ? next : "home";
  if (page === "rescue" && !state.activeSession) page = "home";
  if (page === "recovery" && !recoveryId)
    recoveryId = [...state.events]
      .reverse()
      .find((e) => e.type === "smoke")?.id;
  if (page === "result" && !resultId)
    resultId = [...state.events]
      .reverse()
      .find((e) => e.type === "craving" && e.outcome)?.id;
  render();
  window.scrollTo(0, 0);
}
function render(focus = true) {
  renderedDay = dayKey();
  document.documentElement.dataset.motion = state.profile.motion ? "on" : "off";
  const renderers = {
    home: homePage,
    rescue: rescuePage,
    result: resultPage,
    recovery: recoveryPage,
    records: recordsPage,
    gallery: galleryPage,
    motivation: motivationPage,
    my: myPage,
    help: helpPage,
  };
  root.innerHTML = `${header()}<div id="storage-status" class="storage-status">${storageBanner()}</div><main id="content" tabindex="-1" data-screen="${page}" class="page ${page === "home" ? "page-home" : "page-narrow"}">${renderers[page]()}</main>${nav()}`;
  tick();
  if (focus)
    requestAnimationFrame(() =>
      document.getElementById("content")?.focus({ preventScroll: true }),
    );
}
function tick() {
  if (renderedDay !== dayKey() && ["home", "records"].includes(page)) {
    selectedDay = dayKey();
    render(false);
    return;
  }
  if (page !== "rescue") return;
  const e = state.events.find((e) => e.id === state.activeSession);
  if (!e) return;
  const remaining = remainingSeconds(e);
  const timer = document.querySelector("[data-timer]");
  if (timer)
    timer.textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  const hint = document.getElementById("timer-hint");
  if (hint)
    hint.innerHTML =
      remaining === 0
        ? '这段时间到了，感觉怎么样？ <button class="text-button" data-action="more-time">再留两分钟</button>'
        : "";
}
function currentSmoke() {
  return state.events.find((e) => e.id === recoveryId && e.type === "smoke");
}
function download(content, filename, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportData() {
  state.lastExportAt = new Date().toISOString();
  save();
  download(JSON.stringify(state, null, 2), `kill-cigarette-${dayKey()}.json`);
  toast("备份已开始下载，请保管好其中的个人记录。");
}
function undoSmoke(id) {
  const e = state.events.find((e) => e.id === id && e.type === "smoke");
  if (!e) return;
  state.events = state.events.filter((e) => e.id !== id);
  if (e.sessionId) {
    const session = state.events.find((s) => s.id === e.sessionId);
    if (session) session.followUp = null;
  }
  save();
  render(false);
  toast("已撤销这条抽烟记录。");
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  if (button.dataset.page) {
    navigate(button.dataset.page);
    return;
  }
  if (button.dataset.scene) {
    state.profile.scene = button.dataset.scene;
    save();
    render(false);
    toast("首页风景已换好。");
    return;
  }
  if (button.dataset.motivation || button.dataset.motivationStep) {
    if (button.dataset.motivation)
      state.profile.motivation = button.dataset.motivation;
    else {
      const i = MOTIVATION.findIndex((m) => m.id === state.profile.motivation);
      state.profile.motivation =
        MOTIVATION[
          (i + Number(button.dataset.motivationStep) + MOTIVATION.length) %
            MOTIVATION.length
        ].id;
    }
    save();
    render(false);
    return;
  }
  if (button.dataset.day) {
    selectedDay = button.dataset.day;
    historyLimit = 20;
    render(false);
    return;
  }
  if (button.dataset.filter) {
    recordFilter = button.dataset.filter;
    historyLimit = 20;
    render(false);
    return;
  }
  if (button.dataset.undo) {
    undoSmoke(button.dataset.undo);
    return;
  }
  if (button.dataset.trigger) {
    const e =
      button.dataset.owner === "session"
        ? state.events.find((e) => e.id === state.activeSession)
        : currentSmoke();
    if (e) {
      e.trigger = button.dataset.trigger;
      save();
      root
        .querySelectorAll(
          `[data-trigger][data-owner="${button.dataset.owner}"]`,
        )
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(b.dataset.trigger === e.trigger),
          ),
        );
      const group = button.closest(".choices");
      const details = group.closest("details");
      if (details?.classList.contains("trigger-details"))
        details.querySelector("summary").innerHTML =
          `这次的触发：${h(e.trigger)} <span>修改</span>`;
      const more = root.querySelector(".more-triggers>summary");
      if (more)
        more.textContent = TRIGGERS.slice(3).includes(e.trigger)
          ? `更多场景：${e.trigger}`
          : "更多场景";
    }
    return;
  }
  if (button.dataset.method) {
    if (state.activeSession) {
      const e = state.events.find((e) => e.id === state.activeSession);
      e.method = button.dataset.method;
      save();
      render(false);
    } else {
      startSession(state, button.dataset.method);
      save();
      navigate("rescue");
    }
    return;
  }
  if (button.dataset.outcome) {
    const e = finishSession(state, button.dataset.outcome);
    if (!e) return;
    resultId = e.id;
    save();
    if (e.outcome === "smoked") {
      recoveryId = state.events.find(
        (s) => s.sessionId === e.id && s.type === "smoke",
      )?.id;
      navigate("recovery");
    } else navigate("result");
    return;
  }
  if (button.dataset.followup) {
    const e = state.events.find((e) => e.id === button.dataset.id);
    if (!e) return;
    e.followUp = button.dataset.followup;
    if (
      e.followUp === "smoked" &&
      !state.events.some((s) => s.type === "smoke" && s.sessionId === e.id)
    )
      addSmoke(state, { trigger: e.trigger, sessionId: e.id });
    save();
    render(false);
    toast("后续情况已记下。");
    return;
  }
  if (button.dataset.count) {
    const e = currentSmoke();
    if (!e) return;
    e.count = Math.min(
      200,
      Math.max(1, e.count + Number(button.dataset.count)),
    );
    document.getElementById("smoke-count").value = e.count;
    save();
    return;
  }
  switch (button.dataset.action) {
    case "start":
      startSession(state);
      save();
      navigate("rescue");
      break;
    case "log-smoke": {
      if (state.activeSession) finishSession(state, "left");
      const e = addSmoke(state);
      recoveryId = e.id;
      save();
      navigate("recovery");
      break;
    }
    case "exit-session":
      finishSession(state, "left");
      save();
      navigate("home");
      break;
    case "back-home":
      navigate("home");
      break;
    case "motivation-return":
      navigate(motivationReturn);
      break;
    case "undo-smoke":
      undoSmoke(recoveryId);
      break;
    case "quote":
      quoteIndex++;
      {
        const block = button.closest(".quiet-quote");
        if (block)
          block.querySelector("p").textContent = quote(
            page === "recovery" ? "restart" : "general",
          );
      }
      break;
    case "more-time": {
      const e = state.events.find((e) => e.id === state.activeSession);
      if (e) {
        e.endAt = new Date(
          Math.max(Date.now(), Date.parse(e.endAt)) + 120000,
        ).toISOString();
        save();
        tick();
      }
      break;
    }
    case "dismiss-migration":
      issue = null;
      updateStorageBanner();
      break;
    case "more-records":
      historyLimit += 30;
      render(false);
      break;
    case "quit-start":
      state.profile.quitStartedAt = new Date().toISOString();
      save();
      render(false);
      toast("这次计划的起点已记下，历史进展会保留。");
      break;
    case "export":
      exportData();
      break;
    case "raw-backup":
      if (rawBackup)
        download(rawBackup, `kill-cigarette-original-${dayKey()}.json`);
      else toast("没有需要恢复的原始备份。");
      break;
    case "import":
      document.getElementById("import-file").click();
      break;
    case "reset":
      if (
        confirm(
          "清空这个浏览器里的全部记录和旧版备份？建议先导出。此操作无法在应用内撤销。",
        )
      ) {
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(LEGACY_KEY);
          state = defaultState();
          blocked = false;
          issue = null;
          rawBackup = null;
          save();
          navigate("home");
          toast("本机记录已清空。");
        } catch {
          toast("浏览器暂时无法修改存储，数据未清空。");
        }
      }
      break;
  }
});

root.addEventListener("input", (event) => {
  const node = event.target;
  if (node.dataset.rating) {
    const e = state.events.find(
      (e) =>
        e.id ===
        (node.dataset.rating === "before" ? state.activeSession : resultId),
    );
    if (e) {
      e[node.dataset.rating] = Number(node.value);
      document.getElementById(`${node.id}-value`).textContent =
        `${node.value} / 10`;
      node.setAttribute("aria-valuetext", `${node.value} 分`);
      saveSoon();
    }
  }
  if (node.matches("[data-session-note]")) {
    const e = state.events.find((e) => e.id === state.activeSession);
    if (e) {
      e.note = node.value.slice(0, 400);
      saveSoon();
    }
  }
  if (node.matches("[data-smoke-note]")) {
    const e = currentSmoke();
    if (e) {
      e.note = node.value.slice(0, 400);
      saveSoon();
    }
  }
  if (node.matches("[data-plan]")) {
    state.profile.plan = node.value.slice(0, 400);
    saveSoon();
  }
  if (
    node.matches("[data-smoke-count]") &&
    node.validity.valid &&
    node.value !== ""
  ) {
    const e = currentSmoke();
    if (e) {
      e.count = Number(node.value);
      saveSoon();
    }
  }
});
root.addEventListener("change", (event) => {
  if (
    event.target.id === "history-date" &&
    event.target.value &&
    event.target.value <= dayKey()
  ) {
    selectedDay = event.target.value;
    historyLimit = 20;
    render(false);
  }
  if (event.target.matches('#confirm-day [name="day"]')) {
    const d = dailyStats(state, event.target.value),
      total = document.querySelector('#confirm-day [name="total"]');
    total.value = d.known ? d.total : "";
  }
});
root.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  if (!form.reportValidity()) return;
  const values = new FormData(form);
  if (form.id === "profile-form") {
    const next = {
      ...state,
      profile: {
        ...state.profile,
        reason: values.get("reason"),
        plan: values.get("plan"),
        baseline: Number(values.get("baseline")),
        packSize: Number(values.get("packSize")),
        packPrice: Number(values.get("packPrice")),
        minutes: Number(values.get("minutes")),
        tone: values.get("tone"),
        motion: values.has("motion"),
      },
    };
    state = normalizeState(next);
    const saved = save();
    if (saved) toast("你的设置已保存。");
    render(false);
  }
  if (form.id === "confirm-day") {
    try {
      confirmDay(state, String(values.get("day")), Number(values.get("total")));
      save();
      selectedDay = String(values.get("day"));
      render(false);
      toast("这一天已确认。");
    } catch (error) {
      toast(error.message);
    }
  }
});

function handDown(node) {
  if (handStarted) return;
  handStarted = true;
  node.classList.add("pressed");
  node.querySelector(".orb-label").textContent = "轻轻握住";
}
function handUp() {
  if (!handStarted) return;
  handStarted = false;
  const node = document.getElementById("hand-orb"),
    e = state.events.find((e) => e.id === state.activeSession);
  if (node) {
    node.classList.remove("pressed");
    node.querySelector(".orb-label").textContent = "慢慢放松";
  }
  if (e && e.method === "hands") {
    e.steps++;
    saveSoon();
    const label = document.getElementById("hand-count");
    if (label) label.textContent = `已放松 ${e.steps} 次 · 按自己的节奏`;
  }
}
root.addEventListener("pointerdown", (event) => {
  const orb = event.target.closest("#hand-orb");
  if (orb) {
    event.preventDefault();
    orb.setPointerCapture(event.pointerId);
    handDown(orb);
  }
});
root.addEventListener("pointerup", handUp);
root.addEventListener("pointercancel", handUp);
root.addEventListener("keydown", (event) => {
  if (event.target.id === "hand-orb" && [" ", "Enter"].includes(event.key)) {
    event.preventDefault();
    handDown(event.target);
  }
});
root.addEventListener("keyup", (event) => {
  if (event.target.id === "hand-orb" && [" ", "Enter"].includes(event.key)) {
    event.preventDefault();
    handUp();
  }
});
window.addEventListener("blur", handUp);
document
  .getElementById("import-file")
  .addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 25000000)
        throw new Error("备份文件过大，请选择 25MB 以内的 JSON 文件。");
      const imported = parseBackup(await file.text());
      if (
        !confirm(
          `将导入 ${imported.events.length} 条新版记录和 ${Object.keys(imported.legacyDays).length} 天旧版汇总，并替换当前记录。建议先导出当前数据。继续吗？`,
        )
      )
        return;
      // Back up current readable data in a separate download before replacement.
      if (
        state.events.length ||
        Object.keys(state.legacyDays).length ||
        Object.keys(state.confirmations).length
      )
        download(
          JSON.stringify(state, null, 2),
          `kill-cigarette-before-import-${Date.now()}.json`,
        );
      state = imported;
      blocked = false;
      issue = null;
      recoveryId = null;
      resultId = null;
      const saved = save();
      navigate("home");
      if (saved) toast("备份已导入。");
    } catch (error) {
      toast(error.message || "导入失败，原有记录未修改。");
    } finally {
      event.target.value = "";
    }
  });
window.addEventListener("hashchange", route);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) save();
  else tick();
});
window.addEventListener("pagehide", save);
setInterval(tick, 1000);
route();
if ("serviceWorker" in navigator && location.protocol !== "file:")
  navigator.serviceWorker.register("./sw.js").catch(() => {
    /* ordinary online mode remains usable */
  });
