# 论坛每日签到

三个站点各自使用独立脚本：

- `Tasks/pcbeta.js`
- `Tasks/cncalc.js`
- `Tasks/uiwow.js`

Loon 脚本订阅：

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/loon/checkin.conf
```

## Loon 使用方式

1. 在 Loon 的脚本订阅里添加上面的链接。
2. 开启 MITM 并信任证书。
3. 启用获取 Cookie 脚本，分别登录并打开：
   - `https://i.pcbeta.com/home.php?mod=task`
   - `https://www.cncalc.org/dsu_paulsign-sign.html`
   - `https://uiwow.com/`
4. 收到 Cookie 获取成功通知后，禁用 3 条“获取 Cookie”脚本，只保留 3 条 cron 签到脚本。

获取 Cookie 脚本只保存带 `_auth=` 的登录 Cookie；未登录的游客 Cookie 不会保存。重复刷新同一页面不会反复通知。

订阅里的 6 条脚本组件都带有 `tag` 和 `enable=true`，在 Loon 脚本订阅详情页应能分别手动开关：

- `PCBeta获取Cookie`
- `cnCalc获取Cookie`
- `UIWOW获取Cookie`
- `PCBeta签到`
- `cnCalc签到`
- `UIWOW签到`

cnCalc 使用 `dsu_paulsign`，UIWOW 使用 `dc_signin`。两个脚本默认提交：

- `mood=kx`
- `saying=签到`

如需修改签到文字，改脚本订阅里对应 cron 的 `saying=` 参数，内容要 URL encode。

## 单脚本链接

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/pcbeta.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/cncalc.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/uiwow.js
```
