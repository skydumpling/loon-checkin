/******************************************
 * @name PCBeta 签到
 * @description 远景论坛任务中心自动签到，支持 Quantumult X / Surge / Loon / Node.js
 * @version 2.0.0
 ******************************************
使用说明:
1. Loon/Surge/QX 中先启用“PCBeta 获取 Cookie”，手机登录并打开 https://i.pcbeta.com/home.php?mod=task
2. Cookie 获取脚本静默保存登录 Cookie；登录后刷新过任务页即可禁用获取 Cookie 脚本。
3. Node.js 调试可设置环境变量 PCBETA_COOKIE。

Loon:
[Script]
http-request ^https:\/\/i\.pcbeta\.com\/home\.php\?mod=task tag=PCBeta获取Cookie, script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/pcbeta.js
cron "0 9 * * *" script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/pcbeta.js, timeout=60, tag=PCBeta签到

[MITM]
hostname = %APPEND% i.pcbeta.com
******************************************/

const CONFIG = {
  name: "PCBeta",
  storage: "PCBETA_CHECKIN",
  envCookie: "PCBETA_COOKIE",
  taskUrl: "https://i.pcbeta.com/home.php?mod=task",
  cookieCheck: /(?:^|;\s*)[^=]*_auth=/i,
};

const $ = API(CONFIG.storage);
const storedCookie = $.read("COOKIE");
const cookie = CONFIG.cookieCheck.test(storedCookie) ? storedCookie : getNodeEnv(CONFIG.envCookie);

if ($.isRequest) {
  getCookie();
} else if (!cookie) {
  $.notify(CONFIG.name, "", "未获取 Cookie，请先启用获取 Cookie 脚本并登录访问任务页。");
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
  const results = [];
  const done = {};

  for (let round = 0; round < 4; round++) {
    const page = await requestText("GET", CONFIG.taskUrl, null, headers(CONFIG.taskUrl));
    assertOk(page, "打开任务页失败");
    assertLoggedIn(page.body);

    const formhash = extractFormHash(page.body);
    const actions = extractTaskActions(page.body, page.url).filter((item) => !done[item.key]);
    if (!actions.length) {
      break;
    }

    for (const action of actions) {
      done[action.key] = true;
      const url = new URL(action.href);
      if (formhash && !url.searchParams.has("formhash")) {
        url.searchParams.set("formhash", formhash);
      }
      const response = await requestText("GET", url.href, null, headers(page.url));
      assertOk(response, `${action.label}失败`);
      assertLoggedIn(response.body);
      results.push(formatResult(action, response.body));
    }
  }

  return results.length ? results.join("\n") : "没有发现可领取任务，可能今天已经完成。";
}

function formatResult(action, html) {
  const message = cleanMessage(extractMessage(html) || extractTitle(html) || "完成");
  const reward = extractReward(message);
  const prefix = action.label.replace("申请任务", "申请").replace("领取奖励", "领取");
  return reward ? `${prefix}: ${reward}` : `${prefix}: ${message}`;
}

function extractReward(message) {
  const patterns = [
    /(?:获得|奖励|领取)[^。！!；;]*(?:积分|金币|威望|热心值|PCB|经验|贡献)[^。！!；;]*/i,
    /(?:积分|金币|威望|热心值|PCB|经验|贡献)\s*[+-]?\d+/i,
    /任务(?:已完成|完成|申请成功|领取成功)[^。！!；;]*/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return match[0];
  }
  return "";
}

function extractTaskActions(html, baseUrl) {
  return extractLinks(html, baseUrl)
    .map((link) => {
      const url = new URL(link.href);
      if (url.searchParams.get("mod") !== "task") return null;
      const action = url.searchParams.get("do");
      const id = url.searchParams.get("id");
      if (!["apply", "draw"].includes(action) || !id) return null;
      return {
        href: url.href,
        key: `${action}:${id}`,
        label: `${action === "apply" ? "申请任务" : "领取奖励"}#${id}`,
      };
    })
    .filter(Boolean);
}

function headers(referer) {
  return {
    Cookie: cookie,
    Referer: referer || CONFIG.taskUrl,
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

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const href = match[1].match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!href || href.startsWith("javascript:") || href.startsWith("#")) continue;
    try {
      links.push({ href: new URL(decodeHtml(href), baseUrl).href, text: stripHtml(match[2]) });
    } catch {}
  }
  return links;
}

function extractMessage(html) {
  const candidates = [
    html.match(/<div[^>]+id=["']messagetext["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<div[^>]+class=["'][^"']*alert_[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1],
    html.match(/<root><!\[CDATA\[([\s\S]*?)\]\]><\/root>/i)?.[1],
    html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1],
  ].filter(Boolean);
  for (const item of candidates) {
    const message = cleanMessage(stripHtml(item));
    if (message) return message;
  }
  return "";
}

function extractTitle(html) {
  return cleanMessage(stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""));
}

function cleanMessage(message) {
  return String(message || "")
    .replace(/\[?\s*点此返回\s*\]?/g, "")
    .replace(/如果您的浏览器没有自动跳转[^。！!；;]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
