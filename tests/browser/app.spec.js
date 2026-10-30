import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const KEY = "kc_support_v2";
const shots = path.join(os.tmpdir(), "kc-visual-qa");
const getState = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
async function shot(page, name, testInfo) {
  await mkdir(shots, { recursive: true });
  await page.screenshot({
    path: path.join(shots, `${testInfo.project.name}-${name}.png`),
    fullPage: true,
  });
}
async function noOverflow(page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}

test("page identity, responsive surface, all artwork and visible controls are healthy", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/smoking.html");
  await expect(page).toHaveTitle(/Kill Cigarette/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "先停一会儿",
  );
  await expect(
    page.getByRole("button", { name: "我现在想抽烟", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("3650");
  await expect(page.locator("body")).not.toContainText("¥25");
  await noOverflow(page);
  await shot(page, "home", info);
  await page.getByRole("button", { name: /去场景里坐一会儿/ }).click();
  await expect(page.locator(".scene-choice")).toHaveCount(12);
  for (const img of await page.locator(".gallery img").all()) {
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((n) => n.complete && n.naturalWidth > 0))
      .toBe(true);
  }
  await noOverflow(page);
  await shot(page, "gallery", info);
  await page.locator('[data-scene="quiet-night"]').click();
  await page.getByRole("button", { name: "返回现在", exact: true }).click();
  await expect(page.locator(".home-landscape img")).toHaveAttribute(
    "src",
    /quiet-night/,
  );
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await noOverflow(page);
  await shot(page, "records-empty", info);
  await page.getByRole("button", { name: "我的", exact: true }).click();
  await noOverflow(page);
  await shot(page, "my", info);
  await page.getByRole("button", { name: /戒烟支持与使用说明/ }).click();
  await expect(page.locator("h1")).toContainText("一起把计划做好");
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("quick smoke recording, quantity correction, safe note rendering and undo persist", async ({
  page,
}, info) => {
  await page.goto("/smoking.html");
  await page
    .getByRole("button", { name: "刚刚抽了，记一下", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("这根记下了");
  if (info.project.name === "mobile") {
    const button = await page
      .getByRole("button", { name: "从现在继续", exact: true })
      .boundingBox();
    const nav = await page.locator(".bottom-nav").boundingBox();
    expect(button.y + button.height).toBeLessThanOrEqual(nav.y);
  }
  await page.getByRole("button", { name: "增加一根", exact: true }).click();
  await expect(page.getByLabel("这次抽了几根")).toHaveValue("2");
  await page.getByRole("button", { name: "烦躁", exact: true }).click();
  await page.locator(".more-triggers summary").click();
  await page.getByRole("button", { name: "饭后", exact: true }).click();
  await page.getByRole("button", { name: "烦躁", exact: true }).click();
  await expect(page.locator(".more-triggers summary")).toHaveText("更多场景");
  await expect(page.locator('[data-trigger][aria-pressed="true"]')).toHaveCount(
    1,
  );
  await page.locator(".optional-note summary").click();
  await page
    .getByLabel("补充这次的情况")
    .fill('<img src=x onerror="window.injected=true">工作卡住了');
  await noOverflow(page);
  await shot(page, "recovery", info);
  await page.getByRole("button", { name: "从现在继续", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.locator(".event-title")).toContainText("记录抽烟 2 根");
  await expect(page.locator(".event-note")).toContainText("<img src=x");
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  expect((await getState(page)).events[0].trigger).toBe("烦躁");
  await page
    .getByRole("button", { name: "撤销这条抽烟记录", exact: true })
    .click();
  await expect(page.locator(".event-title")).toHaveCount(0);
  expect((await getState(page)).events).toHaveLength(0);
});

test("all five supplied motivation images are complete, selectable and return to the same rescue", async ({
  page,
}, info) => {
  await page.goto("/smoking.html");
  await page.getByRole("button", { name: "我现在想抽烟", exact: true }).click();
  const sessionId = (await getState(page)).activeSession;
  await page
    .getByRole("button", { name: "看一张我的激励图", exact: true })
    .click();
  await expect(page.locator(".motivation-thumbnails button")).toHaveCount(5);
  for (const button of await page
    .locator(".motivation-thumbnails button")
    .all()) {
    await button.click();
    const img = page.locator(".motivation-feature>img");
    await expect
      .poll(() => img.evaluate((n) => n.complete && n.naturalWidth > 0))
      .toBe(true);
    expect(await img.evaluate((n) => getComputedStyle(n).objectFit)).toBe(
      "contain",
    );
  }
  await noOverflow(page);
  await shot(page, "motivation", info);
  await page
    .getByRole("button", { name: "继续刚才的练习", exact: true })
    .click();
  await expect(page.locator("[data-timer]")).toBeVisible();
  expect((await getState(page)).activeSession).toBe(sessionId);
  expect(
    (await getState(page)).events.filter((e) => e.type === "craving"),
  ).toHaveLength(1);
  expect((await getState(page)).profile.motivation).toBe("passion");
});

test("rescue deadline survives reload and elapsed time never becomes automatic success", async ({
  page,
}, info) => {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00+08:00") });
  await page.goto("/smoking.html");
  await page.getByRole("button", { name: "我现在想抽烟", exact: true }).click();
  await expect(page.locator("[data-timer]")).toHaveText("02:00");
  if (info.project.name === "mobile") {
    const control = await page
      .getByRole("button", { name: "还很想抽，换个办法", exact: true })
      .boundingBox();
    expect(control.y + control.height).toBeLessThan(844);
  }
  const before = (await getState(page)).events[0];
  expect(before.before).toBeNull();
  await shot(page, "rescue", info);
  await page.clock.fastForward(61000);
  await page.reload();
  expect((await getState(page)).events[0].endAt).toBe(before.endAt);
  await page.clock.fastForward(120000);
  await expect(page.locator("[data-timer]")).toHaveText("00:00");
  expect((await getState(page)).events[0].outcome).toBeNull();
  await expect(page.locator("body")).not.toContainText("已过峰值");
  await page.getByRole("button", { name: "再留两分钟", exact: true }).click();
  await expect(page.locator("[data-timer]")).toHaveText("02:00");
  await page
    .getByRole("button", { name: "还很想抽，换个办法", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("也可以换条路");
  expect((await getState(page)).events[0].outcome).toBe("still");
  await page.locator('[data-method="hands"]').click();
  await page.locator("#hand-orb").focus();
  await page.keyboard.down("Space");
  await page.keyboard.up("Space");
  await expect(page.locator("#hand-count")).toContainText("已放松 1 次");
  await page.getByRole("button", { name: "先退出", exact: true }).click();
  expect((await getState(page)).events[1].outcome).toBe("left");
});

test("optional craving scores and follow-up smoking are stored without duplicate cigarettes", async ({
  page,
}) => {
  await page.goto("/smoking.html");
  await page.getByRole("button", { name: "我现在想抽烟", exact: true }).click();
  await page.locator("#rating-before").focus();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page
    .getByRole("button", { name: "现在缓下来一些了", exact: true })
    .click();
  await page.locator("#rating-after").focus();
  await page.keyboard.press("Home");
  await page.getByRole("button", { name: "回到现在", exact: true }).click();
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.locator(".event-body")).toContainText("烟瘾 9 → 0");
  await page.locator(".followup summary").click();
  await page.getByRole("button", { name: "后来抽了", exact: true }).click();
  let data = await getState(page);
  expect(data.events.filter((e) => e.type === "smoke")).toHaveLength(1);
  await page.locator(".followup summary").click();
  await page.getByRole("button", { name: "后来抽了", exact: true }).click();
  data = await getState(page);
  expect(data.events.filter((e) => e.type === "smoke")).toHaveLength(1);
});

test("only a complete confirmed day contributes to savings and no-smoking days", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-30T12:00:00+08:00") });
  await page.goto("/smoking.html#records");
  const form = page.locator("#confirm-day");
  await expect(form.locator('[name="day"]')).toHaveAttribute(
    "max",
    "2026-10-29",
  );
  await form.getByLabel("当天一共抽了几根").fill("0");
  await form.getByRole("button", { name: "确认这一天", exact: true }).click();
  await expect(page.locator(".record-totals")).toContainText("¥25");
  await expect(page.locator(".confirmed-free")).toHaveCount(1);
  await expect(page.locator('[data-day="2026-10-30"]')).toContainText("进行中");
});

test("legacy counts migrate once and original data stays intact", async ({
  page,
}) => {
  const raw = JSON.stringify({
    settings: { savePerDay: 25, challengeMinutes: 7 },
    days: {
      "2026-10-29": { smoke: 2, crave: 4, resist: 1 },
      "2026-10-28": { smoke: 0, crave: 0, resist: 0 },
    },
    logs: [{ ts: "2026-10-29T12:00:00+08:00", type: "smoke" }],
  });
  await page.addInitScript((raw) => {
    if (!localStorage.getItem("kc_support_v2"))
      localStorage.setItem("kc_singlefile_v1", raw);
  }, raw);
  await page.goto("/smoking.html#records");
  await expect(page.locator(".notice")).toContainText("旧版记录已接续");
  expect(
    await page.evaluate(() => localStorage.getItem("kc_singlefile_v1")),
  ).toBe(raw);
  const data = await getState(page);
  expect(data.legacyDays["2026-10-29"].smoke).toBe(2);
  expect(data.confirmations).toEqual({});
  await page.locator("#history-date").fill("2026-10-29");
  await expect(page.locator(".legacy-summary")).toContainText("抽烟计数 2 次");
  await page.reload();
  expect((await getState(page)).legacyDays["2026-10-29"].smoke).toBe(2);
});

test("backup export and validated import roundtrip, malformed import is harmless", async ({
  page,
}) => {
  await page.goto("/smoking.html");
  await page
    .getByRole("button", { name: "刚刚抽了，记一下", exact: true })
    .click();
  await page.getByRole("button", { name: "从现在继续", exact: true }).click();
  await page.getByRole("button", { name: "我的", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出数据", exact: true }).click();
  const raw = await readFile(await (await download).path(), "utf8");
  const backup = JSON.parse(raw);
  expect(backup.events[0].count).toBe(1);
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
  await expect(page.locator("#toast")).toContainText("JSON");
  expect((await getState(page)).events).toHaveLength(1);
  backup.profile.reason = "留一点时间给自己 <script>window.bad=true</script>";
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await expect(page.locator(".personal-reason")).toContainText(
    "<script>window.bad=true</script>",
  );
  expect(await page.evaluate(() => window.bad)).toBeUndefined();
  expect((await getState(page)).events).toHaveLength(1);
});

test("damaged local storage is protected while temporary practice stays usable", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("kc_support_v2", "{broken"),
  );
  await page.goto("/smoking.html");
  await expect(page.locator(".notice")).toContainText("原始数据已保留");
  await page.getByRole("button", { name: "我现在想抽烟", exact: true }).click();
  await expect(page.locator("[data-timer]")).toHaveText("02:00");
  expect(await page.evaluate(() => localStorage.getItem("kc_support_v2"))).toBe(
    "{broken",
  );
});

test("saved settings, reduced motion and offline core work after a reload", async ({
  page,
  context,
}) => {
  await page.goto("/smoking.html#my");
  await page
    .getByLabel("只写对你有意义的一句（可选）")
    .fill("给自己一段真正的休息");
  await page.getByLabel("启用轻柔的呼吸动效").uncheck();
  await page.getByRole("button", { name: "保存我的设置", exact: true }).click();
  await page.getByRole("button", { name: "现在", exact: true }).click();
  await expect(page.locator(".personal-reason")).toContainText(
    "给自己一段真正的休息",
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "我现在想抽烟", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "我现在想抽烟", exact: true }).click();
  await expect(page.locator("[data-timer]")).toBeVisible();
  expect(
    await page
      .locator(".breath-visual img")
      .evaluate((n) => getComputedStyle(n).animationName),
  ).toBe("none");
  await context.setOffline(false);
});

test("a new calendar day refreshes the home count without inventing smoke-free progress", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-29T23:59:30+08:00") });
  await page.goto("/smoking.html");
  await page
    .getByRole("button", { name: "刚刚抽了，记一下", exact: true })
    .click();
  await page.getByRole("button", { name: "从现在继续", exact: true }).click();
  await expect(page.locator(".today-stats")).toContainText("1 根");
  await page.clock.fastForward(60000);
  await expect(page.locator(".today-stats")).not.toContainText("1 根");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.locator('[data-day="2026-10-29"]')).toContainText("1 根");
  await expect(page.locator(".confirmed-free")).toHaveCount(0);
});
