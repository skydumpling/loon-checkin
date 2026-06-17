/******************************************
 * @name UIWOW 签到
 * @description UIWOW dc_signin 自动签到，支持 Quantumult X / Surge / Loon / Node.js
 * @version 2.0.0
 ******************************************
使用说明:
1. Loon/Surge/QX 中先启用订阅里的“签到Cookie获取”，手机登录并打开 https://uiwow.com/
2. Cookie 获取脚本静默保存登录 Cookie；登录后刷新过首页即可禁用 Cookie 获取脚本。
3. Node.js 调试可设置环境变量 UIWOW_COOKIE。
4. 默认心情 mood=kx，默认输入 saying=签到。

Loon:
[Script]
cron "0 9 * * *" script-path=https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/uiwow.js, timeout=60, tag=UIWOW签到

[MITM]
hostname = %APPEND% uiwow.com, www.uiwow.com
******************************************/

const CONFIG = {
  name: "UIWOW",
  storage: "UIWOW_CHECKIN",
  envCookie: "UIWOW_COOKIE",
  baseUrl: "https://uiwow.com/",
  signUrls: [
    "https://uiwow.com/plugin.php?id=dc_signin:sign",
    "https://uiwow.com/plugin.php?id=dc_signin:dc_signin",
    "https://uiwow.com/",
  ],
  fallbackAction: "https://uiwow.com/plugin.php?id=dc_signin:sign",
  mood: "kx",
  saying: "签到",
  cookieCheck: /(?:^|;\s*)[^=]*_auth=/i,
};

const $ = API(CONFIG.storage);
const args = parseArguments(typeof $argument === "string" ? $argument : "");
const storedCookie = $.read("COOKIE");
const cookie = CONFIG.cookieCheck.test(storedCookie) ? storedCookie : getNodeEnv(CONFIG.envCookie);
const mood = args.mood || getNodeEnv("UIWOW_MOOD") || CONFIG.mood;
const saying = args.saying || getNodeEnv("UIWOW_SAYING") || CONFIG.saying;

if ($.isRequest) {
  $.done();
} else if (!cookie) {
  $.notify(CONFIG.name, "", "未获取 Cookie，请先启用获取 Cookie 脚本并登录访问 UIWOW。");
  $.done();
} else {
  sign()
    .then((message) => $.notify(CONFIG.name, "", message))
    .catch((error) => $.notify(CONFIG.name, "", formatError(error)))
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

function captureSignRequest() {
  const requestCookie = getHeader($request.headers, "Cookie");
  if (requestCookie && CONFIG.cookieCheck.test(requestCookie)) {
    $.write(requestCookie, "COOKIE");
  }

  const method = ($request.method || "").toUpperCase();
  const url = $request.url || "";
  const body = $request.body || "";
  const summary = [
    method || "GET",
    url.replace(/^https:\/\/(www\.)?uiwow\.com\//i, ""),
    body ? `body=${body.slice(0, 260)}` : "body=<empty>",
  ].join("\n");
  $.write(summary, "LAST_SIGN_REQUEST");
  $.notify(`${CONFIG.name}抓签到请求`, "", summary);
  $.done();
}

async function sign() {
  const signPage = await getSignPage(args.signUrl || getNodeEnv("UIWOW_SIGN_URL"));
  assertOk(signPage, "打开签到页失败");
  assertLoggedIn(signPage.body);

  const formhash = extractFormHash(signPage.body);
  if (!formhash) {
    throw new Error("未找到 formhash，可能 Cookie 无效、页面结构变化，或需要设置 signUrl 参数。");
  }

  const form = extractSignForm(signPage.body, signPage.url);
  const fields = prepareSignFields(form.fields, formhash);
  return submitSignAttempts(buildSubmitAttempts(form, fields, formhash, signPage.url, signPage.body));
}

async function getSignPage(overrideUrl) {
  const urls = overrideUrl ? [overrideUrl] : CONFIG.signUrls;
  let lastError;
  for (const signUrl of urls) {
    try {
      const response = await requestText("GET", signUrl, null, headers(CONFIG.baseUrl));
      if (response.statusCode >= 200 && response.statusCode < 400) {
        return response;
      }
      lastError = new Error(`HTTP ${response.statusCode}`);
    } catch (error) {
      lastError = error;
      console.log(`${CONFIG.name} 探测 ${signUrl} 失败: ${error.message || error}`);
    }
  }
  throw lastError || new Error("无法打开签到页。");
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
    const message = cleanMessage(extractMessage(response.body) || text.slice(0, 160));
    if (isNavigationPage(text)) {
      failures.push(`${attempt.name}: 返回普通页面，未提交签到`);
      continue;
    }
    if (isAlreadySigned(text)) return message || "今日已经签到。";
    if (isNotSignedPage(text)) {
      failures.push(summarizeStatus(text));
      continue;
    }
    if (isSuccessMessage(text)) return message || summarizeSuccess(text);
    if (isFailureMessage(text)) {
      failures.push(`${attempt.name}: ${message || "站点拒绝请求"}`);
      continue;
    }
    failures.push(`${attempt.name}: ${summarizeStatus(text) || message || "未确认签到成功"}`);
  }
  throw new Error(preferUsefulFailures(failures) || "所有签到提交方式都失败。");
}

function buildSubmitAttempts(form, fields, formhash, referer, html) {
  const attempts = [];
  const submitFields = {
    ...fields,
    formhash,
    signsubmit: fields.signsubmit || "yes",
    submit: fields.submit || "1",
  };
  const formAction = form.action || "";
  if (formAction) attempts.push({ name: "页面表单", method: form.method || "POST", url: formAction, fields: submitFields, referer });
  for (const url of extractCandidateUrls(html, referer)) {
    attempts.push({ name: "页面链接", method: "GET", url, fields: { formhash }, referer });
  }
  attempts.push(
    { name: "mobile-sign-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:sign&inajax=1", fields: submitFields, referer },
    { name: "mobile-sign-get", method: "GET", url: "https://uiwow.com/plugin.php?id=dc_signin:sign&inajax=1", fields: submitFields, referer },
    { name: "op-qiandao-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&operation=qiandao&inajax=1", fields: submitFields, referer },
    { name: "op-signin-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&operation=signin&inajax=1", fields: submitFields, referer },
    { name: "op-add-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&operation=add&inajax=1", fields: submitFields, referer },
    { name: "op-sign-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&operation=sign&inajax=1", fields: submitFields, referer },
    { name: "ac-qiandao-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&action=qiandao&inajax=1", fields: submitFields, referer },
    { name: "ac-signin-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&action=signin&inajax=1", fields: submitFields, referer },
    { name: "ac-sign-post", method: "POST", url: "https://uiwow.com/plugin.php?id=dc_signin:dc_signin&action=sign&inajax=1", fields: submitFields, referer },
    { name: "dc-check-get", method: "GET", url: `https://uiwow.com/plugin.php?id=dc_signin:check&formhash=${encodeURIComponent(formhash)}`, fields: {}, referer },
  );
  return uniqueAttempts(attempts);
}

function extractCandidateUrls(html, baseUrl) {
  const urls = [];
  const patterns = [
    /\bhref\s*=\s*(["'])(.*?)\1/gi,
    /\bonclick\s*=\s*(["'])(.*?)\1/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html))) {
      const value = decodeHtml(match[2] || "");
      for (const item of value.match(/(?:https?:\/\/[^'"<>\s]+|plugin\.php\?[^'"<>\s]+|\/plugin\.php\?[^'"<>\s]+)/gi) || []) {
        if (!/dc_signin|signin|qiandao|签到/i.test(item)) continue;
        try {
          urls.push(new URL(item, baseUrl).href);
        } catch {}
      }
    }
  }
  return urls;
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
  return /您需要先登录|尚未登录|请\s*登录|Cookie|非法字符|插件不存在|插件已关闭|未定义操作|请选择|请填写|失败|错误|无效/i.test(text);
}

function isNotSignedPage(text) {
  return /您今天还未签到|今天还未签到|今日还未签到|尚未签到|还没有签到/i.test(text);
}

function isNavigationPage(text) {
  return /积分\s*:\s*\d+|用户组\s*:|我的\s*\|\s*设置\s*\|\s*消息\s*\|\s*提醒\s*\|\s*退出/i.test(text);
}

function isAlreadySigned(text) {
  return /(?:您|你|我).{0,8}(?:今(?:日|天)).{0,8}(?:已经|已).{0,4}签|已经签到过|请明(?:日|天)再来|今日签到已完成/i.test(text);
}

function isSuccessMessage(text) {
  return /签到成功|成功签到|打卡成功|获得.{0,12}(?:喵币|DKP|金币|声望|时沙|积分|奖励)|奖励.{0,12}(?:喵币|DKP|金币|声望|时沙|积分)|连续签到.{0,8}\d+\s*天/i.test(text);
}

function summarizeSuccess(text) {
  const status = summarizeStatus(text);
  if (status) return status;
  const parts = [];
  const patterns = [
    /签到成功[^。！!；;]*/i,
    /获得[^。！!；;]*(?:喵币|DKP|金币|声望|时沙|积分|奖励)[^。！!；;]*/i,
    /(?:喵币|DKP|金币|声望|时沙|积分|奖励)[^。！!；;]*/i,
    /连续签到[^。！!；;]*天/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && !parts.includes(match[0])) parts.push(match[0]);
  }
  return cleanMessage(parts.join("；") || text.slice(0, 160) || "签到成功。");
}

function summarizeStatus(text) {
  const start = text.search(/已连续签到|连续签到/i);
  if (start === -1) return "";
  return cleanMessage(text.slice(start, start + 220));
}

function preferUsefulFailures(failures) {
  const status = failures.find((item) => /已连续签到|连续签到/.test(item));
  if (status) return status;
  return failures.slice(0, 3).join("；");
}

function formatError(error) {
  const message = String(error && error.message ? error.message : error || "");
  if (/^已连续签到|^连续签到/i.test(message)) return message;
  return `签到失败: ${message}`;
}

function extractSignForm(html, baseUrl) {
  const fallback = { action: "", method: "POST", fields: {} };
  const pattern = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    const actionRaw = getAttribute(attrs, "action");
    const action = actionRaw ? new URL(decodeHtml(actionRaw), baseUrl).href : "";
    const text = `${attrs}\n${body}\n${action}`;
    if (!/dc_signin|signin|签到|mood|say|content|message/i.test(text)) continue;
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

function prepareSignFields(fields, formhash) {
  const result = { ...fields, formhash: fields.formhash || formhash };
  const moodKeys = ["qdxq", "mood", "emotion", "feeling", "type"];
  const sayingKeys = ["todaysay", "saying", "message", "content", "say", "signmsg"];
  setFirstExisting(result, moodKeys, mood, "qdxq");
  setFirstExisting(result, sayingKeys, saying, "todaysay");
  return result;
}

function setFirstExisting(target, keys, value, fallbackKey) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      target[key] = value;
      return;
    }
  }
  target[fallbackKey] = value;
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
    const message = cleanMessage(stripHtml(item));
    if (message) return message;
  }
  return "";
}

function cleanMessage(message) {
  return String(message || "")
    .replace(/\[?\s*点此返回\s*\]?/g, "")
    .replace(/如果您的浏览器没有自动跳转[^。！!；;]*/g, "")
    .replace(/\s+/g, " ")
    .trim();
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
