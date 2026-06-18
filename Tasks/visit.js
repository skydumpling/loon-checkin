/******************************************
 * @name 访问领奖
 * @description 登录后打开页面即可领奖的站点通用访问脚本，支持多账号
 * @version 1.0.0
 ******************************************/

const SITES = {
  mjtd: {
    name: "MJTD",
    storage: "VISIT_MJTD",
    url: "https://www.mjtd.com/",
    host: /^(?:www\.)?mjtd\.com$/i,
    envCookie: "MJTD_COOKIE",
  },
  iopq: {
    name: "IOPQ",
    storage: "VISIT_IOPQ",
    url: "https://www.iopq.net/forum.php?gid=112",
    host: /^(?:www\.)?iopq\.net$/i,
    envCookie: "IOPQ_COOKIE",
  },
  javbus: {
    name: "JavBus",
    storage: "VISIT_JAVBUS",
    url: "https://www.javbus.com/forum/",
    host: /^(?:www\.)?javbus\.com$/i,
    envCookie: "JAVBUS_COOKIE",
  },
};

const args = parseArguments(typeof $argument === "string" ? $argument : "");
const siteKey = String(args.site || "").toLowerCase();
const slot = String(args.slot || "1").replace(/[^\w-]/g, "") || "1";
const inferredSite = siteKey ? SITES[siteKey] : inferSite();

if (!inferredSite) {
  done();
} else if (typeof $request !== "undefined") {
  captureCookie(inferredSite, slot);
} else {
  visit(inferredSite, slot)
    .then((message) => notify(displayName(inferredSite, slot), "", message))
    .catch((error) => notify(displayName(inferredSite, slot), "", `访问失败: ${error.message || error}`))
    .finally(() => done());
}

function inferSite() {
  const host = typeof $request !== "undefined" ? getHost($request.url || "") : "";
  return Object.values(SITES).find((site) => site.host.test(host));
}

function captureCookie(site, accountSlot) {
  const host = getHost($request.url || "");
  if (!site.host.test(host)) return done();

  const cookie = getHeader($request.headers, "Cookie");
  if (!cookie || cookie.length < 20) return done();

  const store = API(storageName(site, accountSlot));
  if (store.read("COOKIE") !== cookie) {
    store.write(cookie, "COOKIE");
  }
  done();
}

async function visit(site, accountSlot) {
  const store = API(storageName(site, accountSlot));
  const cookie = store.read("COOKIE") || getEnvCookie(site, accountSlot);
  if (!cookie) {
    throw new Error("未获取 Cookie，请临时启用对应获取 Cookie 脚本，登录后打开目标页面。");
  }

  const targetUrl = args.url || site.url;
  const response = await request("GET", {
    url: targetUrl,
    headers: headers(site, cookie, targetUrl),
  });
  if (response.statusCode < 200 || response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}`);
  }

  const text = stripHtml(response.body || "");
  const title = extractTitle(response.body || "");
  const reward = summarizeReward(text);
  const loginHint = looksLoggedOut(text) ? "可能未登录，请重新获取 Cookie。" : "访问完成。";
  return [loginHint, title && `页面: ${title}`, reward].filter(Boolean).join("\n");
}

function headers(site, cookie, referer) {
  return {
    Cookie: cookie,
    Referer: referer || site.url,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9,en;q=0.8",
  };
}

function summarizeReward(text) {
  const matches = text.match(/(?:领取|获得|奖励|金币|积分|威望|经验)[^。！!；;\n]{0,40}/g) || [];
  const useful = [...new Set(matches.map(cleanMessage).filter((item) => item.length >= 3))].slice(0, 3);
  return useful.length ? useful.join("\n") : "";
}

function looksLoggedOut(text) {
  const loggedIn = /退出|注销|个人中心|用户组|消息|提醒|我的|账号|积分/i.test(text);
  const loggedOut = /登录|登入|注册|sign in|log in/i.test(text);
  return loggedOut && !loggedIn;
}

function storageName(site, accountSlot) {
  return site.storage + (site.storage === "VISIT_JAVBUS" ? `_ACCOUNT_${accountSlot}` : "");
}

function displayName(site, accountSlot) {
  return site.name + (site.storage === "VISIT_JAVBUS" ? ` 账号${accountSlot}` : "");
}

function getEnvCookie(site, accountSlot) {
  const direct = getNodeEnv(site.envCookie);
  if (direct) return direct;
  return getNodeEnv(`${site.envCookie}_${accountSlot}`);
}

function request(method, options) {
  const isQX = typeof $task !== "undefined";
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isLoon;
  const isNode = typeof require === "function" && typeof process !== "undefined";
  if (isQX) return $task.fetch({ ...options, method }).then(normalizeResponse);
  if (isLoon || isSurge) {
    return new Promise((resolve, reject) => {
      $httpClient[method.toLowerCase()](options, (error, response, body) => {
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
}

function API(name) {
  const isQX = typeof $task !== "undefined";
  const isLoon = typeof $loon !== "undefined";
  const isSurge = typeof $httpClient !== "undefined" && !isLoon;
  const isNode = typeof require === "function" && typeof process !== "undefined";
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
    read(key) {
      const fullKey = `${name}_${key}`;
      if (isQX) return $prefs.valueForKey(fullKey) || "";
      if (isLoon || isSurge) return $persistentStore.read(fullKey) || "";
      return loadStore()[key] || "";
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
  };
}

function normalizeResponse(response) {
  return {
    statusCode: Number(response.statusCode || response.status || 0),
    headers: response.headers || {},
    body: response.body || "",
  };
}

function parseArguments(argument) {
  const result = {};
  for (const item of String(argument || "").split(/[&\n]/)) {
    if (!item) continue;
    const index = item.indexOf("=");
    if (index === -1) result[decodeURIComponent(item)] = "";
    else result[decodeURIComponent(item.slice(0, index))] = decodeURIComponent(item.slice(index + 1));
  }
  return result;
}

function getHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function getHeader(headersObject, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headersObject || {})) {
    if (key.toLowerCase() === target) return headersObject[key];
  }
  return "";
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return cleanMessage(stripHtml(match?.[1] || ""));
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

function cleanMessage(message) {
  return String(message || "").replace(/\s+/g, " ").trim();
}

function getNodeEnv(key) {
  return typeof process !== "undefined" && process.env ? process.env[key] || "" : "";
}

function notify(title, subtitle, body) {
  if (typeof $notify !== "undefined") return $notify(title, subtitle, body);
  if (typeof $notification !== "undefined") return $notification.post(title, subtitle, body);
  console.log(`${title}\n${subtitle || ""}\n${body || ""}`);
}

function done(value = {}) {
  if (typeof $done !== "undefined") $done(value);
}
