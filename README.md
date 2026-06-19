# 论坛每日签到

签到站点各自使用独立脚本，访问领奖站点使用通用脚本：

- `Tasks/pcbeta.js`
- `Tasks/cncalc.js`
- `Tasks/uiwow-sign.js`
- `Tasks/visit.js`

Loon 脚本订阅：

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/loon/checkin.conf
```

## Loon 使用方式

1. 在 Loon 的脚本订阅里添加上面的链接。
2. 开启 MITM 并信任证书。
3. 需要重新获取 Cookie 时，临时启用对应“获取 Cookie”脚本，登录并打开：
   - `https://i.pcbeta.com/home.php?mod=task`
   - `https://www.cncalc.org/dsu_paulsign-sign.html`
   - `https://uiwow.com/`
   - `https://www.mjtd.com/`
   - `https://www.iopq.net/forum.php?gid=112`
   - `https://www.javbus.com/forum/`
4. 登录并刷新对应页面后，关闭“获取 Cookie”脚本，只保留 cron 脚本。

获取 Cookie 脚本默认关闭，临时启用时也是静默保存，不会发送成功通知。是否获取成功，用手动运行对应签到或访问脚本验证。

访问领奖脚本获取 Cookie 时会发送一条确认通知，通知中包含 `账号ID`；每日访问时也会返回 `账号ID`、页面提示或访问完成状态。JavBus 三账号默认账号 ID 分别是 `javbus1`、`javbus2`、`javbus3`。

日常 cron 脚本按订阅里的固定时间运行，不再启用随机延迟。

当天已经签到时，可以手动运行对应签到脚本验证 Cookie 和“已签到/已完成”判断；真正的首次签到成功只能等第二天未签到状态再验证。

订阅里的脚本组件都带有 `tag`，在 Loon 脚本订阅详情页应能分别手动开关：

- `签到Cookie获取`
- `MJTD获取Cookie`
- `IOPQ获取Cookie`
- `JavBus账号1获取Cookie`
- `JavBus账号2获取Cookie`
- `JavBus账号3获取Cookie`
- `PCBeta签到`
- `cnCalc签到`
- `UIWOW签到`
- `MJTD访问领奖`
- `IOPQ访问领奖`
- `JavBus账号1访问领奖`
- `JavBus账号2访问领奖`
- `JavBus账号3访问领奖`

JavBus 三账号获取方式：

1. 启用 `JavBus账号1获取Cookie`，登录账号 1，打开 `https://www.javbus.com/forum/`，然后关闭该获取脚本。
2. 退出并登录账号 2，启用 `JavBus账号2获取Cookie`，打开同一页面，然后关闭。
3. 账号 3 同理使用 `JavBus账号3获取Cookie`。

cnCalc 使用 `dsu_paulsign`，UIWOW 使用 `dc_signin`。两个脚本默认提交：

- `mood=kx`
- `saying=签到`

如需修改签到文字，改脚本订阅里对应 cron 的 `saying=` 参数，内容要 URL encode。

## 单脚本链接

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/pcbeta.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/cncalc.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/uiwow-sign.js
https://raw.githubusercontent.com/skydumpling/loon-checkin/main/Tasks/visit.js
```
