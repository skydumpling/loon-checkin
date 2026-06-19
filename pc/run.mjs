import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { chromium } from "playwright";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(ROOT, "config.json");
const PROFILES_DIR = path.join(ROOT, "profiles");
const LOGS_DIR = path.join(ROOT, "logs");

const command = process.argv[2] || "run";
const targetId = process.argv[3] || "";

main().catch(async (error) => {
  await logLine(`FATAL ${formatError(error)}`);
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const config = await readConfig();
  if (command === "list") {
    listTasks(config);
    return;
  }
  if (command === "login") {
    await loginTask(config, targetId);
    return;
  }
  if (command === "run") {
    await runTasks(config, targetId);
    return;
  }
  console.log("Usage:");
  console.log("  node run.mjs list");
  console.log("  node run.mjs login <task-id>");
  console.log("  node run.mjs run [task-id]");
}

async function readConfig() {
  return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"));
}

function listTasks(config) {
  for (const task of config.tasks) {
    console.log(`${task.enabled ? "on " : "off"} ${task.id.padEnd(8)} ${task.name} (${task.type})`);
  }
}

async function loginTask(config, id) {
  const task = findTask(config, id);
  if (!task) throw new Error(`Unknown task: ${id || "<empty>"}`);
  await ensureDirs();
  const context = await openContext(config, task, { headless: false });
  const page = await context.newPage();
  await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  console.log(`已打开 ${task.name}: ${task.url}`);
  console.log("请在浏览器里完成登录；登录完成后回到终端按回车保存。");
  const rl = readline.createInterface({ input, output });
  await rl.question("");
  rl.close();
  await context.close();
  console.log(`已保存 profile: ${task.profile}`);
}

async function runTasks(config, id) {
  await ensureDirs();
  const tasks = id ? [findTask(config, id)].filter(Boolean) : config.tasks.filter((task) => task.enabled);
  if (!tasks.length) throw new Error(id ? `Unknown task: ${id}` : "No enabled tasks");

  const results = [];
  for (const task of tasks) {
    const result = await runOneTask(config, task);
    results.push(result);
    await notify(config, result.title, result.body);
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length) {
    process.exitCode = 1;
  }
}

async function runOneTask(config, task) {
  const started = new Date();
  const title = task.name;
  try {
    const delay = randomDelay(task.delaySeconds);
    if (delay > 0) {
      await logLine(`${title} random delay ${delay}s`);
      await sleep(delay * 1000);
    }

    const context = await openContext(config, task);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    let body;
    if (task.type === "uiwow-sign") {
      body = await runUIWOW(page, task);
    } else if (task.type === "visit") {
      body = await runVisit(page, task);
    } else {
      throw new Error(`Unsupported task type: ${task.type}`);
    }

    await context.close();
    const elapsed = Math.round((Date.now() - started.getTime()) / 1000);
    const result = { ok: true, title, body: `${body}\n耗时: ${elapsed}s` };
    await logLine(`OK ${title}\n${body}`);
    console.log(`OK ${title}\n${body}`);
    return result;
  } catch (error) {
    const body = `失败: ${formatError(error)}`;
    await logLine(`FAIL ${title} ${formatError(error)}`);
    console.error(`FAIL ${title}: ${formatError(error)}`);
    return { ok: false, title, body };
  }
}

async function runUIWOW(page, task) {
  await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await closeDiscuzPopup(page);

  const pageStatus = await getUIWOWStatus(page);
  if (isUIWOWSigned(pageStatus)) {
    return formatUIWOWStatus(pageStatus) || "今日已签到。";
  }

  const signLink = page.locator("#dcsignin_tips");
  if (await signLink.count()) {
    await signLink.click();
  } else {
    await page.goto("https://uiwow.com/plugin.php?id=dc_signin:sign&infloat=yes&handlekey=sign&inajax=1&ajaxtarget=fwin_content_sign", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
  }

  await page.waitForTimeout(800);
  await setUIWOWMood(page, task.mood || "1");
  await fillIfExists(page, "#content", task.saying || "签到");
  await clickFirstVisible(page, [
    "#signform button",
    "#signform input[type=submit]",
    "#fwin_sign button",
    "button:has-text('确定')",
    "input[value='确定']",
  ]);
  await page.waitForLoadState("domcontentloaded", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);

  const message = await readMessage(page);
  const finalStatus = await getUIWOWStatus(page);
  return formatUIWOWStatus(finalStatus) || message || "签到请求已提交。";
}

async function runVisit(page, task) {
  await page.goto(task.url, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const text = clean(await page.locator("body").innerText({ timeout: 10000 }).catch(() => ""));
  const title = clean(await page.title().catch(() => ""));
  const account = extractAccountId(text) || task.accountId || task.profile;
  const prompt = extractPrompt(text);
  const reward = summarizeReward(text);
  const loginHint = looksLoggedOut(text) ? "可能未登录，请重新登录该 profile。" : "访问完成。";
  return [
    `账号ID: ${account}`,
    prompt || loginHint,
    title ? `页面: ${title}` : "",
    reward,
  ].filter(Boolean).join("\n");
}

async function getUIWOWStatus(page) {
  await page.goto("https://uiwow.com/plugin.php?id=dc_signin:dc_signin", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  }).catch(() => {});
  return clean(await page.locator("body").innerText({ timeout: 10000 }).catch(() => ""));
}

function isUIWOWSigned(text) {
  return /今天已签到|今日已签到|已签到|您今天已经签到|今日签到已完成/i.test(text);
}

function formatUIWOWStatus(text) {
  const total = findStat(text, /(?:您)?累计已签到\s*[:：]\s*(\d+\s*天)/i);
  const streak = findStat(text, /连续签到\s*[:：]\s*(\d+\s*天)/i);
  const monthTotal = findStat(text, /(?:您)?本月已累计签到\s*[:：]\s*(\d+\s*天)/i);
  const monthStreak = findStat(text, /本月连续签到\s*[:：]\s*(\d+\s*天)/i);
  const reward = findStat(text, /上次获得的奖励为\s*[:：]\s*([^。！!；;，,]*?(?:金币|喵币|DKP|声望|时沙|积分|奖励)\s*\d+)/i)
    || findStat(text, /获得的奖励为\s*[:：]\s*([^。！!；;，,]*?(?:金币|喵币|DKP|声望|时沙|积分|奖励)\s*\d+)/i);
  const lines = [];
  if (total || streak) lines.push(`累计已签到: ${total || "-"} ，连续签到: ${streak || "-"}`);
  if (monthTotal || monthStreak) lines.push(`您本月已累计签到: ${monthTotal || "-"} ，本月连续签到: ${monthStreak || "-"}`);
  if (reward) lines.push(`获得的奖励为: ${reward}`);
  return lines.join("\n\n");
}

async function setUIWOWMood(page, mood) {
  const value = String(mood || "1");
  await page.evaluate((selectedMood) => {
    const input = document.querySelector("#emotid, input[name='emotid']");
    if (input) input.value = selectedMood;
  }, value).catch(() => {});
  const moodImg = page.locator(`img[src*="/emot/${value}."]`);
  if (await moodImg.count().catch(() => 0)) {
    await moodImg.first().click().catch(() => {});
  }
}

async function fillIfExists(page, selector, value) {
  const locator = page.locator(selector);
  if (await locator.count().catch(() => 0)) {
    await locator.first().fill(value).catch(() => {});
  }
}

async function clickFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index++) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        return true;
      }
    }
  }
  throw new Error("未找到可点击的提交按钮");
}

async function closeDiscuzPopup(page) {
  for (const selector of [".flbc", ".flb em a", "a[title='关闭']"]) {
    const locator = page.locator(selector);
    if (await locator.count().catch(() => 0)) {
      await locator.first().click().catch(() => {});
    }
  }
}

async function readMessage(page) {
  for (const selector of ["#messagetext", ".alert_info", ".alert_right", ".alert_error", "#fwin_dialog"]) {
    const locator = page.locator(selector);
    if (await locator.count().catch(() => 0)) {
      const text = clean(await locator.first().innerText().catch(() => ""));
      if (text) return text;
    }
  }
  return "";
}

async function openContext(config, task, overrides = {}) {
  const profilePath = path.join(PROFILES_DIR, task.profile);
  await fs.mkdir(profilePath, { recursive: true });
  const browserConfig = config.browser || {};
  const options = {
    headless: overrides.headless ?? browserConfig.headless ?? true,
    slowMo: browserConfig.slowMo || 0,
    viewport: { width: 1280, height: 900 },
    locale: "zh-CN",
    timezoneId: "Asia/Hong_Kong",
  };
  const channel = browserConfig.channel || "msedge";
  try {
    return await chromium.launchPersistentContext(profilePath, { ...options, channel });
  } catch (error) {
    if (channel) {
      await logLine(`Browser channel ${channel} failed, fallback to bundled chromium: ${formatError(error)}`);
    }
    return chromium.launchPersistentContext(profilePath, options);
  }
}

function findTask(config, id) {
  return config.tasks.find((task) => task.id === id);
}

function randomDelay(range) {
  if (!Array.isArray(range)) return 0;
  const min = Math.max(0, Number(range[0]) || 0);
  const max = Math.max(min, Number(range[1]) || 0);
  return Math.floor(min + Math.random() * (max - min + 1));
}

function extractAccountId(text) {
  const patterns = [
    /(?:用户名|用户|账号|會員|会员|UID|User(?:name)?)\s*[:：]?\s*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,32})/i,
    /欢迎(?:您)?[,，\s]*([A-Za-z0-9_\-\u4e00-\u9fa5]{2,32})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function extractPrompt(text) {
  const match = text.match(/(?:今日|每天|每日|访问|登录|领取|获得|奖励|金币|积分|威望|经验|成功|失败|已经|已领|已领取)[^。！!；;\n]{0,90}/);
  return clean(match?.[0] || "");
}

function summarizeReward(text) {
  const matches = text.match(/(?:领取|获得|奖励|金币|积分|威望|经验|成功|已领|已领取)[^。！!；;\n]{0,50}/g) || [];
  return [...new Set(matches.map(clean).filter((item) => item.length >= 3))].slice(0, 3).join("\n");
}

function looksLoggedOut(text) {
  const loggedIn = /退出|注销|个人中心|用户组|消息|提醒|我的|账号|积分/i.test(text);
  const loggedOut = /登录|登入|注册|sign in|log in/i.test(text);
  return loggedOut && !loggedIn;
}

function findStat(text, pattern) {
  const match = text.match(pattern);
  return clean(match?.[1] || match?.[0] || "");
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDirs() {
  await fs.mkdir(PROFILES_DIR, { recursive: true });
  await fs.mkdir(LOGS_DIR, { recursive: true });
}

async function logLine(message) {
  await fs.mkdir(LOGS_DIR, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const line = `[${new Date().toISOString()}] ${message}\n`;
  await fs.appendFile(path.join(LOGS_DIR, `${day}.log`), line, "utf8");
}

async function notify(config, title, body) {
  const barkUrl = config.notify?.barkUrl || process.env.BARK_URL || "";
  if (!barkUrl) return;
  try {
    const url = new URL(barkUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/${encodeURIComponent(title)}/${encodeURIComponent(body)}`;
    await fetch(url, { method: "GET" });
  } catch (error) {
    await logLine(`Notify failed: ${formatError(error)}`);
  }
}

function formatError(error) {
  return String(error && error.message ? error.message : error || "");
}
