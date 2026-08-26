# WhiteFlash

一个 Windows 桌面实时白闪滤镜。它捕获每块显示器，通过 WebGL 2 进行 Gooch 风格的冷白分层、多尺度 Sobel 发光笔触、亮块分阶与纸张纤维模拟，再以全屏覆盖层显示结果。

“滤镜强度”控制原画与白色笔触处理的混合比例；“白闪强度”和“白闪频率”独立控制周期性亮度变化。动态闪光可能引起不适，请从低强度开始使用。

## 运行

需要 Node.js 18 或更高版本：

```powershell
npm install
npm start
```

也可以在 Git Bash 中直接运行：

```bash
./start.sh
```

## 快捷键

- `Ctrl+Shift+W`：显示或隐藏参数面板
- `Ctrl+Shift+P`：切换鼠标穿透（穿透后用快捷键恢复）
- `Ctrl+Shift+Q`：退出

覆盖窗口启用了 Windows 内容保护，从屏幕捕获中排除自身，防止递归画面。若某些录屏或远程桌面软件禁用了该机制，滤镜可能无法正常工作。不适或头晕时请使用 `Ctrl+Shift+Q` 立即退出。

## 设计来源

视觉方案参考 [GarrettGunnell/Gooch-Shading](https://github.com/GarrettGunnell/Gooch-Shading)：冷暖色调插值与后处理边缘检测。原方案使用 3D 深度纹理；桌面画面没有深度信息，因此本项目用亮度 Sobel 梯度来提取边缘。
