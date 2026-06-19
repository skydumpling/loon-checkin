# PC 浏览器签到方案

这个目录使用 Node.js + Playwright，通过真实浏览器 profile 保存登录态。第一次手动登录后，后续每天由脚本自动打开页面、签到或领取访问奖励。

## 安装

```powershell
cd C:\Users\Ss\Documents\自动签到脚本\pc
npm install
```

如果 Playwright 提示缺少浏览器，执行：

```powershell
npx playwright install chromium
```

默认优先使用本机 Edge。如果 Edge 可用，通常不需要额外安装 Chromium。

## 第一次登录

每个 profile 只需要登录一次：

```powershell
npm run login -- uiwow
npm run login -- mjtd
npm run login -- iopq
npm run login -- javbus1
npm run login -- javbus2
npm run login -- javbus3
```

脚本会打开浏览器。登录完成后，在终端按回车保存 profile。

## 手动运行

运行全部任务：

```powershell
npm run run
```

只运行某一个任务：

```powershell
node run.mjs run uiwow
node run.mjs run javbus1
```

日志写入 `pc/logs/`，该目录不会提交到 Git。

## Windows 定时任务

安装每天 09:00 运行的计划任务：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1
```

修改时间：

```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -At "08:40"
```

任务内部还有 `delaySeconds` 随机延迟，默认每个站点延迟 0 到 600 秒。
