/******************************************
 * @name UIWOW 抓签到请求
 * @description 临时抓取 UIWOW dc_signin 弹窗签到请求，抓完后请禁用
 * @version 1.0.0
 ******************************************/

const CONFIG = {
  name: "UIWOW抓签到请求",
  storage: "UIWOW_CHECKIN",
  cookieCheck: /(?:^|;\s*)[^=]*_auth=/i,
};

const $ = API(CONFIG.storage);

if (typeof $request === "undefined") {
  $.notify(CONFIG.name, "", "这是请求抓取脚本，请启用后手动点击 UIWOW 签到弹窗。");
  $.done();
} else {
  capture();
}

function capture() {
  const requestCookie = getHeader($request.headers, "Cookie");
  if (requestCookie && CONFIG.cookieCheck.test(requestCookie)) {
    $.write(requestCookie, "COOKIE");
  }

  const method = ($request.method || "GET").toUpperCase();
  const url = $request.url || "";
  const body = $request.body || "";
  const summary = [
    method,
    url.replace(/^https:\/\/(www\.)?uiwow\.com\//i, ""),
    body ? `body=${body.slice(0, 500)}` : "body=<empty>",
  ].join("\n");

  $.write(summary, "LAST_SIGN_REQUEST");
  $.notify(CONFIG.name, "", summary);
  $.done();
}

function getHeader(headersObject, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headersObject || {})) {
    if (key.toLowerCase() === target) return headersObject[key];
  }
  return "";
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
  };
}
