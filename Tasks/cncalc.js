/******************************************
 * @name cnCalc 签到
 * @description cnCalc dsu_paulsign 自动签到，支持 Quantumult X / Surge / Loon / Node.js
 * @version 2.0.0
 ******************************************
使用说明:
1. Loon/Surge/QX 中先启用“cnCalc 获取 Cookie”，手机登录并打开 https://www.cncalc.org/
2. Cookie 获取脚本静默保存登录 Cookie；登录后刷新过首页即可禁用获取 Cookie 脚本。
3. Node.js 调试可设置环境变量 CNCALC_COOKIE。
4. 默认心情 qdxq=kx，默认输入 todaysay=签到。

Loon:
[Script]
http-request ^https:\/\/www\.cncalc\.org\/($|forum\.php|index\.php|member\.php|dsu_paulsign-sign\.html|plugin\.php\?id=dsu_paulsign:sign) tag=cnCalc获取Cookie, script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/cncalc.js
cron "0 9 * * *" script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/cncalc.js, timeout=60, tag=cnCalc签到

[MITM]
hostname = %APPEND% www.cncalc.org
******************************************/

const CONFIG = {
  name: "cnCalc",
  storage: "CNCALC_CHECKIN",
  envCookie: "CNCALC_COOKIE",
  baseUrl: "https://www.cncalc.org/",
  signUrls: [
    "https://www.cncalc.org/dsu_paulsign-sign.html",
    "https://www.cncalc.org/plugin.php?id=dsu_paulsign:sign",
  ],
  fallbackAction: "https://www.cncalc.org/plugin.php?id=dsu_paulsign:sign&operation=qiandao",
  mood: "kx",
  saying: "签到",
  cookieCheck: /(?:^|;\s*)[^=]*_auth=/i,
};

const $ = API(CONFIG.storage);
const args = parseArguments(typeof $argument === "string" ? $argument : "");
const storedCookie = $.read("COOKIE");
const cookie = CONFIG.cookieCheck.test(storedCookie) ? storedCookie : getNodeEnv(CONFIG.envCookie);
const mood = args.mood || getNodeEnv("CNCALC_MOOD") || CONFIG.mood;
const saying = args.saying || getNodeEnv("CNCALC_SAYING") || CONFIG.saying;

if ($.isRequest) {
  getCookie();
} else if (!cookie) {
  $.notify(CONFIG.name, "", "未获取 Cookie，请先启用获取 Cookie 脚本并登录访问签到页。");
  $.done();
} else {
  sign()
    .then((message) => $.notify(CONFIG.name, "", message))
    .catch((error) => $.notify(CONFIG.name, "", `签到失败: ${error.message || error}`))
    .finally(() => $.done());
}

function getCookie() {
  const requestCookie = getHeader($request.headers, "Cookie");
  if (!requestCookie) {
    $.done();
    return;
  }

  const savedCookie = $.read("COOKIE");
  if (requestCookie === savedCookie) {
    $.done();
    return;
  }

  const hasLoginToken = CONFIG.cookieCheck.test(requestCookie);
  if (!hasLoginToken) {
    $.done();
    return;
  }

  $.write(requestCookie, "COOKIE");
  $.done();
}

async function sign() {
  const signPage = await getSignPage();
  assertOk(signPage, "打开签到页失败");
  assertLoggedIn(signPage.body);

  if (/今日已签|已经签到|已签到|您今天已经|今日已经/i.test(stripHtml(signPage.body))) {
    return "今日已经签到。";
  }

  const formhash = extractFormHash(signPage.body);
  if (!formhash) {
    throw new Error("未找到 formhash，可能 Cookie 无效或页面结构变化。");
  }

  const form = extractSignForm(signPage.body, signPage.url);
  const fields = {
    ...form.fields,
    formhash: form.fields.formhash || formhash,
    qdxq: mood,
    qdmode: form.fields.qdmode || "1",
    todaysay: saying,
    fastreply: form.fields.fastreply || "0",
  };
  return submitSignAttempts(buildSubmitAttempts(form, fields, signPage.url));
}

async function getSignPage() {
  let lastError;
  for (const url of CONFIG.signUrls) {
    try {
      const response = await requestText("GET", url, null, headers(CONFIG.baseUrl));
      if (response.statusCode >= 200 && response.statusCode < 400) {
        return response;
      }
      lastError = new Error(`HTTP ${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("无法打开签到页。");
}

function headers(referer) {
  return {
    Cookie: cookie,
    Referer: referer || CONFIG.signUrl,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
  };
}

function assertLoggedIn(html) {
  const text = stripHtml(html);
  if (/discuz_uid\s*=\s*['"]0['"]/i.test(html) || /您需要先登录|请\s*登录\s*后|登录后才能|请先登录/i.test(text)) {
    throw new Error("Cookie 无效或已过期，请重新获取。");
  }
}

function assertOk(response, message) {
  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`${message}: HTTP ${response.statusCode}`);
  }
}

function requestText(method, url, body, requestHeaders) {
  return $.request(method, { url, headers: requestHeaders, body }).then((response) => ({
    statusCode: response.statusCode,
    headers: response.headers || {},
    body: response.body || "",
    url,
  }));
}

async function submitSignAttempts(attempts) {
  const failures = [];
  for (const attempt of attempts) {
    const response = attempt.method === "GET"
      ? await requestText("GET", appendQuery(attempt.url, attempt.fields), null, headers(attempt.referer))
      : await requestText("POST", attempt.url, toFormBody(attempt.fields), {
        ...headers(attempt.referer),
        Origin: new URL(CONFIG.baseUrl).origin,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      });
    if (response.statusCode < 200 || response.statusCode >= 400) {
      failures.push(`${attempt.name}: HTTP ${response.statusCode}`);
      continue;
    }
    const text = stripHtml(response.body);
    const message = extractMessage(response.body) || text.slice(0, 160);
    if (/今日已签|已经签到|已签到|您今天已经|今日已经/i.test(text)) return "今日已经签到。";
    if (isFailureMessage(text)) {
      failures.push(`${attempt.name}: ${message || "站点拒绝请求"}`);
      continue;
    }
    if (/<form\b/i.test(response.body) && !/签到成功|成功|奖励|积分|连续签到/i.test(text)) {
      failures.push(`${attempt.name}: 返回签到页但未确认成功`);
      continue;
    }
    return message || "签到请求已提交。";
  }
  throw new Error(failures.slice(0, 3).join("；") || "所有签到提交方式都失败。");
}

function buildSubmitAttempts(form, fields, referer) {
  const attempts = [];
  const formAction = form.action || "";
  if (formAction) attempts.push({ name: "页面表单", method: form.method || "POST", url: formAction, fields, referer });
  attempts.push(
    { name: "plugin-post", method: "POST", url: "https://www.cncalc.org/plugin.php?id=dsu_paulsign:sign&operation=qiandao&infloat=1&inajax=1", fields, referer },
    { name: "plugin-get", method: "GET", url: "https://www.cncalc.org/plugin.php?id=dsu_paulsign:sign&operation=qiandao&infloat=1&inajax=1", fields, referer },
    { name: "rewrite-post", method: "POST", url: "https://www.cncalc.org/dsu_paulsign-sign.html?operation=qiandao&infloat=1&inajax=1", fields, referer },
  );
  return uniqueAttempts(attempts);
}

function uniqueAttempts(attempts) {
  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = `${attempt.method} ${attempt.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isFailureMessage(text) {
  return /您需要先登录|尚未登录|请\s*登录|Cookie|非法字符|插件不存在|未定义操作|请选择|请填写|失败|错误|无效/i.test(text);
}

function extractSignForm(html, baseUrl) {
  const fallback = { action: CONFIG.fallbackAction, method: "POST", fields: {} };
  const pattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const actionRaw = getAttribute(attrs, "action");
    const action = actionRaw ? new URL(decodeHtml(actionRaw), baseUrl).href : "";
    const text = `${attrs}\n${body}\n${action}`;
    if (!/dsu_paulsign|qiandao|qdxq|todaysay/i.test(text)) continue;
    return {
      action: action || fallback.action,
      method: (getAttribute(attrs, "method") || "POST").toUpperCase(),
      fields: extractFormFields(body),
    };
  }
  return fallback;
}

function extractFormFields(html) {
  const fields = {};
  const inputPattern = /<input\b([^>]*)>/gi;
  let match;
  while ((match = inputPattern.exec(html))) {
    const attrs = match[1] || "";
    const name = getAttribute(attrs, "name");
    if (!name) continue;
    const type = (getAttribute(attrs, "type") || "").toLowerCase();
    if (["button", "image", "reset", "submit"].includes(type)) continue;
    if (type === "checkbox" && !/\bchecked\b/i.test(attrs)) continue;
    if (type === "radio" && !/\bchecked\b/i.test(attrs) && Object.prototype.hasOwnProperty.call(fields, name)) continue;
    fields[name] = getAttribute(attrs, "value") || "";
  }

  const textareaPattern = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
  while ((match = textareaPattern.exec(html))) {
    const name = getAttribute(match[1] || "", "name");
    if (name) fields[name] = stripHtml(match[2] || "");
  }
  return fields;
}

function getAttribute(attrs, name) {
  const pattern = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  return decodeHtml(attrs.match(pattern)?.[2] || "");
}

function appendQuery(url, data) {
  const target = new URL(url, CONFIG.baseUrl);
  for (const key of Object.keys(data)) {
    target.searchParams.set(key, data[key]);
  }
  return target.href;
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

function extractMessage(html) {
  const candidates = [
    html.match(/<div[^>]+id=["']messagetext["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<div[^>]+class=["'][^"']*alert_[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<root><!\[CDATA\[([\s\S]*?)\]\]><\/root>/i)?.[1],
    html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1],
  ].filter(Boolean);
  for (const item of candidates) {
    const message = stripHtml(item);
    if (message) return message;
  }
  return "";
}

function toFormBody(data) {
  return Object.keys(data).map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`).join("&");
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
      const hex = entity[1] && entity[1].toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return map[entity.toLowerCase()] || raw;
  });
}

function getHeader(headersObject, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headersObject || {})) {
    if (key.toLowerCase() === target) return headersObject[key];
  }
  return "";
}

function parseArguments(argument) {
  const result = {};
  for (const item of argument.split(/[&\n]/)) {
    if (!item) continue;
    const index = item.indexOf("=");
    if (index === -1) result[decodeURIComponent(item)] = "";
    else result[decodeURIComponent(item.slice(0, index))] = decodeURIComponent(item.slice(index + 1));
  }
  return result;
}

function getNodeEnv(key) {
  return typeof process !== "undefined" && process.env ? process.env[key] || "" : "";
}

function API(name) {
  const isQX = typeof $task !== "undefined";
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isLoon;
  const isNode = typeof require === "function" && typeof process !== "undefined";
  const isRequest = typeof $request !== "undefined";
  const fs = isNode ? require("fs") : null;
  const storeFile = `${name}.json`;

  function loadStore() {
    if (!isNode || !fs.existsSync(storeFile)) return {};
    try {
      return JSON.parse(fs.readFileSync(storeFile, "utf8"));
    } catch {
      return {};
    }
  }

  function saveStore(store) {
    if (isNode) fs.writeFileSync(storeFile, JSON.stringify(store, null, 2));
  }

  return {
    isRequest,
    read(key) {
      const fullKey = `${name}_${key}`;
      if (isQX) return $prefs.valueForKey(fullKey) || "";
      if (isLoon || isSurge) return $persistentStore.read(fullKey) || "";
      const store = loadStore();
      return store[key] || "";
    },
    write(value, key) {
      const fullKey = `${name}_${key}`;
      if (isQX) return $prefs.setValueForKey(value, fullKey);
      if (isLoon || isSurge) return $persistentStore.write(value, fullKey);
      const store = loadStore();
      store[key] = value;
      saveStore(store);
      return true;
    },
    notify(title, subtitle, body) {
      if (isQX) return $notify(title, subtitle, body);
      if (isLoon || isSurge) return $notification.post(title, subtitle, body);
      console.log(`${title}\n${subtitle || ""}\n${body || ""}`);
    },
    done(value = {}) {
      if (typeof $done !== "undefined") $done(value);
    },
    request(method, options) {
      const requestOptions = { ...options, method };
      if (isQX) return $task.fetch(requestOptions).then(normalizeResponse);
      if (isLoon || isSurge) {
        return new Promise((resolve, reject) => {
          const client = $httpClient[method.toLowerCase()];
          client(options, (error, response, body) => {
            if (error) reject(error);
            else resolve(normalizeResponse({ statusCode: response.status || response.statusCode, headers: response.headers, body }));
          });
        });
      }
      if (isNode) {
        return fetch(options.url, { method, headers: options.headers, body: options.body })
          .then(async (response) => normalizeResponse({ statusCode: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.text() }));
      }
      return Promise.reject(new Error("Unsupported runtime"));
    },
  };
}

function normalizeResponse(response) {
  return {
    statusCode: Number(response.statusCode || response.status || 0),
    headers: response.headers || {},
    body: response.body || "",
  };
}
