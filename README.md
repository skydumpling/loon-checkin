# 论坛每日签到

三个站点各自使用独立脚本：

- `Tasks/pcbeta.js`
- `Tasks/cncalc.js`
- `Tasks/uiwow.js`

Loon 插件订阅：

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/Plugins/checkin.plugin
```

## Loon 使用方式

1. 添加上面的插件订阅。
2. 开启 MITM 并信任证书。
3. 启用获取 Cookie 脚本，分别登录并打开：
   - `https://i.pcbeta.com/home.php?mod=task`
   - `https://www.cncalc.org/dsu_paulsign-sign.html`
   - `https://uiwow.com/`
4. 收到 Cookie 获取成功通知后，禁用 3 条“获取 Cookie”脚本，只保留 3 条 cron 签到脚本。

插件里的 6 条脚本组件都带有 `tag` 和 `enable=true`，在 Loon 插件详情页应能分别手动开关：

- `PCBeta获取Cookie`
- `cnCalc获取Cookie`
- `UIWOW获取Cookie`
- `PCBeta签到`
- `cnCalc签到`
- `UIWOW签到`

cnCalc 和 UIWOW 使用 `dsu_paulsign`，默认提交：

- `mood=kx`
- `saying=签到`

如需修改签到文字，改插件里对应 cron 的 `saying=` 参数，内容要 URL encode。

## 单脚本链接

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/Tasks/pcbeta.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/Tasks/cncalc.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/Tasks/uiwow.js
```
