# Loon 版使用说明

`discuz-checkin.js` 是移动端脚本，运行方式和你给的 52pojie 脚本一致：

- `http-request` 模式：手机登录网站并打开页面，脚本自动保存 Cookie。
- `cron` 模式：每天定时读取已保存 Cookie 并签到。

如果在 Loon 里用“插件/订阅”方式添加，请添加 plugin 文件，而不是 `.js` 文件：

```text
https://raw.githubusercontent.com/skydumpling/loon-checkin/refs/heads/main/loon/discuz-checkin.plugin
```

`.js` 链接只适合作为 `script-path` 被插件或手写配置引用。

cnCalc 和 UIWOW 使用 Discuz `dsu_paulsign` 签到时会提交心情与一句话：

- `mood=kx`：心情选“开心”。
- `saying=签到`：输入内容为“签到”。

如果你想改内容，把 Loon 配置里的 `saying=%E7%AD%BE%E5%88%B0` 换成 URL encode 后的文字即可。

## 配置

1. 把 `loon/discuz-checkin.js` 放到你自己的 GitHub 仓库。
2. 将 `loon/loon.conf.example` 中的 `https://raw.githubusercontent.com/YOUR_NAME/YOUR_REPO/main/loon/discuz-checkin.js` 换成你的 raw 地址。
3. 把配置片段加入 Loon。
4. 开启 MITM，信任证书。
5. 分别登录：
   - `https://i.pcbeta.com/home.php?mod=task`
   - `https://www.cncalc.org/dsu_paulsign-sign.html`
   - `https://uiwow.com/`
6. 收到“Cookie 获取成功”通知后，可以关闭对应的“获取 Cookie”脚本，只保留 cron 签到任务。

## UIWOW

UIWOW 在当前环境对普通脚本请求返回 403，所以脚本默认会带 Cookie 自动探测常见 Discuz 签到入口。

如果 UIWOW 签到失败，在 Loon 的网络记录里找到你手动点击签到时的请求：

- 如果请求 URL 是 `plugin.php?id=dsu_paulsign:sign...`，把它填到 `signUrl` 参数。
- 如果请求 URL 是 `home.php?mod=task...`，把它填到 `taskUrl` 参数。

URL 需要 encode 后放到 argument，例如：

```text
argument=site=uiwow&signUrl=https%3A%2F%2Fuiwow.com%2Fplugin.php%3Fid%3Ddsu_paulsign%3Asign
```
