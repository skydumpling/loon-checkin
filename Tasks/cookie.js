/******************************************
 * @name 签到 Cookie 获取
 * @description 合并获取 PCBeta / cnCalc / UIWOW 登录 Cookie，静默保存
 * @version 1.1.0
 ******************************************
使用说明:
1. 启用本脚本后，分别登录并打开对应页面：
   - https://i.pcbeta.com/home.php?mod=task
   - https://www.cncalc.org/
   - https://uiwow.com/
2. 脚本只在检测到登录 Cookie 时保存，不发送成功通知，避免通知风暴。
3. 三个站点都重新获取后，可以在 Loon 中禁用本脚本。
******************************************/

const SITES = [
  {
    name: "PCBeta",
    storage: "PCBETA_CHECKIN",
    host: /^i\.pcbeta\.com$/i,
    loginCookie: /(?:^|;\s*)[^=]*_auth=/i,
  },
  {
    name: "cnCalc",
    storage: "CNCALC_CHECKIN",
    host: /^www\.cncalc\.org$/i,
    loginCookie: /(?:^|;\s*)[^=]*_auth=/i,
  },
  {
    name: "UIWOW",
    storage: "UIWOW_CHECKIN",
    host: /^(?:www\.)?uiwow\.com$/i,
    loginCookie: /(?:^|;\s*)[^=]*_auth=/i,
  },
];

const $ = API("CHECKIN_COOKIE_CAPTURE");

if (typeof $request === "undefined") {
  $.log("这是请求脚本，请在 Loon 中启用后访问对应网站。");
  $.done();
} else {
  captureCookie();
}

function captureCookie() {
  const url = $request.url || "";
  const host = getHost(url);
  const site = SITES.find((item) => item.host.test(host));
  if (!site) {
    $.done();
    return;
  }

  const cookie = getHeader($request.headers, "Cookie");
  if (!cookie || !site.loginCookie.test(cookie)) {
    $.done();
    return;
  }

  const store = API(site.storage);
  const savedCookie = store.read("COOKIE");
  if (savedCookie !== cookie) {
    store.write(cookie, "COOKIE");
  }
  $.done();
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
    log(...items) {
      console.log(items.join(" "));
    },
    done(value = {}) {
      if (typeof $done !== "undefined") $done(value);
    },
  };
}
