/******************************************
 * @name UIWOW 签到
 * @description UIWOW dsu_paulsign 自动签到，支持 Quantumult X / Surge / Loon / Node.js
 * @version 2.0.0
 ******************************************
使用说明:
1. Loon/Surge/QX 中先启用“UIWOW 获取 Cookie”，手机登录并打开 https://uiwow.com/
2. 收到 Cookie 获取成功后，可以禁用“UIWOW 获取 Cookie”，只保留 cron 签到任务。
3. Node.js 调试可设置环境变量 UIWOW_COOKIE。
4. 默认心情 qdxq=kx，默认输入 todaysay=签到。

Loon:
[Script]
http-request ^https:\/\/(www\.)?uiwow\.com\/ tag=UIWOW获取Cookie, script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/Tasks/uiwow.js
cron "0 9 * * *" script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/Tasks/uiwow.js, timeout=60, tag=UIWOW签到

[MITM]
hostname = %APPEND% uiwow.com, www.uiwow.com
******************************************/

const CONFIG = {
  name: "UIWOW",
  storage: "UIWOW_CHECKIN",
  envCookie: "UIWOW_COOKIE",
  baseUrl: "https://uiwow.com/",
  signUrls: [
    "https://uiwow.com/plugin.php?id=dsu_paulsign:sign",
    "https://uiwow.com/dsu_paulsign-sign.html",
  ],
  postPath: "/plugin.php?id=dsu_paulsign:sign&operation=qiandao&infloat=1&inajax=1",
  mood: "kx",
  saying: "签到",
  cookieCheck: /auth|saltkey|login|session/i,
};

const $ = API(CONFIG.storage);
const args = parseArguments(typeof $argument === "string" ? $argument : "");
const cookie = $.read("COOKIE") || getNodeEnv(CONFIG.envCookie);
const mood = args.mood || getNodeEnv("UIWOW_MOOD") || CONFIG.mood;
const saying = args.saying || getNodeEnv("UIWOW_SAYING") || CONFIG.saying;

if ($.isRequest) {
  getCookie();
} else if (!cookie) {
  $.notify(CONFIG.name, "", "未获取 Cookie，请先启用获取 Cookie 脚本并登录访问 UIWOW。");
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
    $.notify(CONFIG.name, "", "当前请求没有 Cookie 请求头。");
    $.done();
    return;
  }

  $.write(requestCookie, "COOKIE");
  const hasLoginToken = CONFIG.cookieCheck.test(requestCookie);
  $.notify(CONFIG.name, "", hasLoginToken ? "Cookie 获取成功，可以禁用获取 Cookie 脚本。" : "Cookie 已保存，但未识别到登录字段；如签到失败请重新登录后获取。");
  $.done();
}

async function sign() {
  const signUrl = args.signUrl || getNodeEnv("UIWOW_SIGN_URL") || await detectSignUrl();
  const signPage = await requestText("GET", signUrl, null, headers(CONFIG.baseUrl));
  assertOk(signPage, "打开签到页失败");
  assertLoggedIn(signPage.body);

  if (/今日已签|已经签到|已签到|您今天已经|今日已经/i.test(stripHtml(signPage.body))) {
    return "今日已经签到。";
  }

  const formhash = extractFormHash(signPage.body);
  if (!formhash) {
    throw new Error("未找到 formhash，可能 Cookie 无效、页面结构变化，或需要设置 signUrl 参数。");
  }

  const postUrl = new URL(CONFIG.postPath, CONFIG.baseUrl).href;
  const body = toFormBody({
    formhash,
    qdxq: mood,
    qdmode: "1",
    todaysay: saying,
    fastreply: "0",
  });
  const response = await requestText("POST", postUrl, body, {
    ...headers(signUrl),
    Origin: new URL(CONFIG.baseUrl).origin,
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
  });
  assertOk(response, "提交签到失败");
  assertLoggedIn(response.body);

  return extractMessage(response.body) || stripHtml(response.body).slice(0, 160) || "签到请求已提交。";
}

async function detectSignUrl() {
  for (const signUrl of CONFIG.signUrls) {
    try {
      const response = await requestText("GET", signUrl, null, headers(CONFIG.baseUrl));
      if (response.statusCode >= 200 && response.statusCode < 400 && /dsu_paulsign|qdxq|签到|qiandao/i.test(response.body)) {
        return signUrl;
      }
    } catch (error) {
      console.log(`${CONFIG.name} 探测 ${signUrl} 失败: ${error.message || error}`);
    }
  }
  return CONFIG.signUrls[0];
}

function headers(referer) {
  return {
    Cookie: cookie,
    Referer: referer || CONFIG.baseUrl,
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
