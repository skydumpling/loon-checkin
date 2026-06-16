/******************************************
 * @name Discuz 每日签到
 * @description PCBeta / cnCalc / UIWOW Cookie 抓取与自动签到
 * @version 1.0.0
 *
 * Loon 用法见 loon/loon.conf.example
 ******************************************/

const SITE_CONFIGS = {
  pcbeta: {
    name: "PCBeta",
    cookieKey: "CHECKIN_PCBETA_COOKIE",
    captureHosts: ["i.pcbeta.com", "bbs.pcbeta.com"],
    baseUrl: "https://i.pcbeta.com/",
    taskUrl: "https://i.pcbeta.com/home.php?mod=task",
    type: "task",
  },
  cncalc: {
    name: "cnCalc",
    cookieKey: "CHECKIN_CNCALC_COOKIE",
    captureHosts: ["www.cncalc.org", "cncalc.org"],
    baseUrl: "https://www.cncalc.org/",
    signUrl: "https://www.cncalc.org/dsu_paulsign-sign.html",
    mood: "kx",
    saying: "签到",
    type: "dsu",
  },
  uiwow: {
    name: "UIWOW",
    cookieKey: "CHECKIN_UIWOW_COOKIE",
    captureHosts: ["uiwow.com", "www.uiwow.com"],
    baseUrl: "https://uiwow.com/",
    mood: "kx",
    saying: "签到",
    type: "auto",
  },
};

const $ = new Env("Discuz 每日签到");
const args = parseArguments(typeof $argument === "string" ? $argument : "");
const siteKey = args.site || detectSiteFromRequest();
const site = SITE_CONFIGS[siteKey];

if (!site) {
  $.msg($.name, "", "未指定或无法识别站点，请在 Loon 配置里使用 argument=site=pcbeta/cncalc/uiwow");
  $.done();
} else if (typeof $request !== "undefined") {
  captureCookie(site);
} else {
  run(site).catch((error) => {
    $.logErr(error);
    $.msg(`${site.name} 签到失败`, "", error.message);
  }).finally(() => $.done());
}

function captureCookie(site) {
  const cookie = getHeader($request.headers, "Cookie");
  if (!cookie) {
    $.msg(`${site.name} Cookie 获取失败`, "", "当前请求没有 Cookie 请求头");
    $.done();
    return;
  }

  const oldCookie = $.getdata(site.cookieKey);
  if (oldCookie === cookie) {
    $.log(`${site.name} Cookie 未变化`);
  } else {
    $.setdata(cookie, site.cookieKey);
    $.msg(`${site.name} Cookie 获取成功`, "", "可以关闭抓取脚本，保留定时任务");
  }

  $.done();
}

async function run(site) {
  applyRuntimeOverrides(site);

  const cookie = $.getdata(site.cookieKey);
  if (!cookie) {
    throw new Error(`缺少 Cookie，请先登录 ${site.name} 并触发对应 http-request 抓取规则`);
  }

  let result;
  if (site.type === "task") {
    result = await runDiscuzTask(site, cookie);
  } else if (site.type === "dsu") {
    result = await runDsuPaulSign(site, cookie, site.signUrl);
  } else {
    result = await runAutoDiscuz(site, cookie);
  }

  $.msg(`${site.name} 签到完成`, "", result);
  $.log(`${site.name}: ${result}`);
}

async function runAutoDiscuz(site, cookie) {
  const configuredSignUrl = args.signUrl || $.getdata(`${site.cookieKey}_SIGN_URL`);
  const configuredTaskUrl = args.taskUrl || $.getdata(`${site.cookieKey}_TASK_URL`);

  if (configuredSignUrl) {
    return runDsuPaulSign(site, cookie, configuredSignUrl);
  }

  if (configuredTaskUrl) {
    return runDiscuzTask({ ...site, taskUrl: configuredTaskUrl }, cookie);
  }

  const home = await request({
    url: site.baseUrl,
    headers: buildHeaders(site, cookie, site.baseUrl),
  });
  assertHttpOk(site, home);
  assertLoggedIn(site, home.body);

  const signCandidates = unique([
    ...extractLinks(home.body, home.url).filter((link) => /dsu_paulsign|qiandao|sign|签到/i.test(`${link.href} ${link.text}`)).map((link) => link.href),
    new URL("/plugin.php?id=dsu_paulsign:sign", site.baseUrl).href,
    new URL("/dsu_paulsign-sign.html", site.baseUrl).href,
  ]);

  for (const signUrl of signCandidates) {
    try {
      const probe = await request({
        url: signUrl,
        headers: buildHeaders(site, cookie, home.url),
      });
      if (probe.status === 404 || /找不到|不存在|404/i.test(stripHtml(probe.body))) {
        continue;
      }
      if (/dsu_paulsign|qdxq|operation=qiandao|每日签到|签到/i.test(probe.body)) {
        return runDsuPaulSign(site, cookie, signUrl);
      }
    } catch (error) {
      $.log(`${site.name} 探测 ${signUrl} 失败: ${error.message}`);
    }
  }

  return runDiscuzTask({ ...site, taskUrl: new URL("/home.php?mod=task", site.baseUrl).href }, cookie);
}

async function runDsuPaulSign(site, cookie, signUrl) {
  const signPage = await request({
    url: signUrl,
    headers: buildHeaders(site, cookie, site.baseUrl),
  });
  assertHttpOk(site, signPage);
  assertLoggedIn(site, signPage.body);

  if (/今日已签|已经签到|已签到|您今天已经|今日已经/i.test(stripHtml(signPage.body))) {
    return "今日已经签到";
  }

  const formhash = extractFormHash(signPage.body);
  if (!formhash) {
    throw new Error("未找到 formhash，可能页面结构变化或 Cookie 无效");
  }

  const postUrl = new URL("/plugin.php?id=dsu_paulsign:sign&operation=qiandao&infloat=1&inajax=1", signUrl).href;
  const body = toFormBody({
    fastreply: "0",
    formhash,
    qdmode: "1",
    qdxq: site.mood || "kx",
    todaysay: site.saying || "签到",
  });
  const response = await request({
    method: "POST",
    url: postUrl,
    headers: {
      ...buildHeaders(site, cookie, signUrl),
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "Origin": new URL(signUrl).origin,
      "X-Requested-With": "XMLHttpRequest",
    },
    body,
  });
  assertHttpOk(site, response);
  assertLoggedIn(site, response.body);

  return extractDiscuzMessage(response.body) || stripHtml(response.body).slice(0, 120) || "签到请求已提交";
}

async function runDiscuzTask(site, cookie) {
  let currentUrl = site.taskUrl;
  const done = new Set();
  const messages = [];

  for (let round = 0; round < 4; round += 1) {
    const page = await request({
      url: currentUrl,
      headers: buildHeaders(site, cookie, currentUrl),
    });
    assertHttpOk(site, page);
    assertLoggedIn(site, page.body);

    const formhash = extractFormHash(page.body);
    const actions = extractTaskActions(page.body, page.url).filter((action) => !done.has(action.key));
    if (actions.length === 0) {
      break;
    }

    for (const action of actions) {
      done.add(action.key);
      const url = new URL(action.href);
      if (formhash && !url.searchParams.has("formhash")) {
        url.searchParams.set("formhash", formhash);
      }

      const response = await request({
        url: url.href,
        headers: buildHeaders(site, cookie, page.url),
      });
      assertHttpOk(site, response);
      assertLoggedIn(site, response.body);
      messages.push(`${action.do}#${action.id}: ${extractDiscuzMessage(response.body) || extractTitle(response.body) || "完成"}`);
    }

    currentUrl = site.taskUrl;
  }

  return messages.length ? messages.join(" | ") : "没有找到可领取任务，可能今天已完成";
}

function applyRuntimeOverrides(site) {
  if (args.mood) site.mood = args.mood;
  if (args.saying) site.saying = args.saying;
  if (args.baseUrl) site.baseUrl = args.baseUrl;
  if (args.signUrl) site.signUrl = args.signUrl;
  if (args.taskUrl) site.taskUrl = args.taskUrl;
}

function buildHeaders(site, cookie, referer) {
  return {
    "User-Agent": args.ua || "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
    "Cookie": cookie,
    "Referer": referer || site.baseUrl,
  };
}

function request(options) {
  const method = (options.method || "GET").toUpperCase();
  const requestOptions = {
    url: options.url,
    headers: options.headers || {},
  };

  if (method === "POST") {
    requestOptions.body = options.body || "";
  }

  return new Promise((resolve, reject) => {
    if (typeof $task !== "undefined") {
      $task.fetch({ ...requestOptions, method }).then((response) => {
        resolve(normalizeResponse(response, options.url));
      }, reject);
      return;
    }

    const client = method === "POST" ? $httpClient.post : $httpClient.get;
    client(requestOptions, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(normalizeResponse({ statusCode: response.status || response.statusCode, headers: response.headers, body }, options.url));
    });
  });
}

function normalizeResponse(response, fallbackUrl) {
  return {
    body: response.body || "",
    headers: response.headers || {},
    status: Number(response.statusCode || response.status || 0),
    url: response.headers?.Location || response.headers?.location || fallbackUrl,
  };
}

function assertHttpOk(site, response) {
  if (response.status === 403) {
    throw new Error(`${site.name} 返回 403，若是 UIWOW 请先确认 Cookie 或配置 signUrl/taskUrl`);
  }
  if (response.status < 200 || response.status >= 400) {
    throw new Error(`${site.name} HTTP ${response.status}`);
  }
}

function assertLoggedIn(site, html) {
  const text = stripHtml(html);
  if (/discuz_uid\s*=\s*['"]0['"]/i.test(html) || /您需要先登录|请\s*登录\s*后|登录后才能|请先登录/i.test(text)) {
    throw new Error(`${site.name} Cookie 无效或已过期，请重新抓取`);
  }
}

function extractFormHash(html) {
  const patterns = [
    /\bformhash\s*=\s*["']([A-Za-z0-9]+)["']/i,
    /name=["']formhash["']\s+value=["']([A-Za-z0-9]+)["']/i,
    /value=["']([A-Za-z0-9]+)["']\s+name=["']formhash["']/i,
    /[?&]formhash=([A-Za-z0-9]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function extractTaskActions(html, baseUrl) {
  return extractLinks(html, baseUrl).map((link) => {
    const url = new URL(link.href);
    const mod = url.searchParams.get("mod");
    const action = url.searchParams.get("do");
    const id = url.searchParams.get("id");
    if (mod !== "task" || !["apply", "draw"].includes(action) || !id) {
      return null;
    }
    return {
      do: action,
      href: url.href,
      id,
      key: `${action}:${id}`,
      text: link.text,
    };
  }).filter(Boolean);
}

function extractDiscuzMessage(html) {
  const candidates = [
    html.match(/<div[^>]+id=["']messagetext["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<div[^>]+class=["'][^"']*alert_[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<root><!\[CDATA\[([\s\S]*?)\]\]><\/root>/i)?.[1],
    html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1],
  ].filter(Boolean);

  for (const candidate of candidates) {
    const message = stripHtml(candidate);
    if (message) return message;
  }
  return "";
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = pattern.exec(html))) {
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) {
      continue;
    }
    try {
      links.push({
        href: new URL(decodeHtml(href), baseUrl).href,
        text: stripHtml(match[2]),
      });
    } catch {}
  }

  return links;
}

function extractTitle(html) {
  return stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
}

function stripHtml(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  const map = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (raw, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return map[entity.toLowerCase()] || raw;
  });
}

function toFormBody(data) {
  return Object.keys(data).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`).join("&");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getHeader(headers, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === target) {
      return headers[key];
    }
  }
  return "";
}

function parseArguments(argument) {
  const output = {};
  for (const part of argument.split(/[&\n]/)) {
    if (!part) continue;
    const index = part.indexOf("=");
    if (index === -1) {
      output[decodeURIComponent(part)] = "";
      continue;
    }
    output[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
  }
  return output;
}

function detectSiteFromRequest() {
  if (typeof $request === "undefined") {
    return "";
  }
  const host = String($request.hostname || $request.host || new URL($request.url).hostname).toLowerCase();
  return Object.keys(SITE_CONFIGS).find((key) => SITE_CONFIGS[key].captureHosts.includes(host)) || "";
}

function Env(name) {
  this.name = name;
  this.log = (...args) => console.log(`[${name}]`, ...args);
  this.logErr = (error) => console.log(`[${name}]`, error && error.stack ? error.stack : error);
  this.getdata = (key) => {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
    return "";
  };
  this.setdata = (value, key) => {
    if (typeof $persistentStore !== "undefined") return $persistentStore.write(value, key);
    if (typeof $prefs !== "undefined") return $prefs.setValueForKey(value, key);
    return false;
  };
  this.msg = (title, subtitle, body) => {
    if (typeof $notification !== "undefined") return $notification.post(title, subtitle, body);
    if (typeof $notify !== "undefined") return $notify(title, subtitle, body);
    console.log(`${title}\n${subtitle || ""}\n${body || ""}`);
  };
  this.done = (value = {}) => {
    if (typeof $done !== "undefined") $done(value);
  };
}
