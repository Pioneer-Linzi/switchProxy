# 调试指南

如果点击"开启代理"按钮没有效果，请按照以下步骤排查：

## 1. 检查是否选择了代理

**问题**: 如果没有先选择代理配置，按钮会被禁用或提示错误。

**解决方法**:
1. 确保已经添加了至少一个代理配置
2. 在代理列表中，点击要使用的代理的"切换"按钮
3. 选中的代理会高亮显示，状态栏会显示"当前"

## 2. 查看控制台日志

### 打开开发者工具

1. 启动应用（使用 `npm run dev`）
2. 开发者工具会自动打开
3. 如果没有打开，可以在主进程中添加代码手动打开

### 查看日志

在控制台中查找以下日志：
- `加载代理列表:` - 显示加载的代理配置
- `切换代理状态:` - 显示切换操作的状态
- `toggle-proxy called:` - 后端接收到切换请求
- `enableProxy called` - 开始启用代理
- `执行命令:` - 执行的系统命令
- `命令执行成功/失败` - 命令执行结果

## 3. 检查常见错误

### 错误: "请先选择一个代理配置"

**原因**: 没有选择当前要使用的代理

**解决**: 在代理列表中点击"切换"按钮选择代理

### 错误: "需要管理员权限"

**原因**: 修改系统代理设置需要管理员权限

**解决**: 
1. 当系统提示时，输入管理员密码
2. 确保有管理员权限

### 错误: "执行命令失败"

**原因**: 可能是网络接口问题或命令执行失败

**解决**:
1. 检查网络连接是否正常
2. 检查代理服务器地址和端口是否正确
3. 查看控制台中的详细错误信息

## 4. 手动测试系统命令

可以在终端中手动测试命令是否正常工作：

```bash
# 查看网络服务
networksetup -listallnetworkservices

# 设置 HTTP 代理（需要 sudo）
sudo networksetup -setwebproxy "Wi-Fi" 127.0.0.1 8080
sudo networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 8080

# 开启代理
sudo networksetup -setwebproxystate "Wi-Fi" on
sudo networksetup -setsecurewebproxystate "Wi-Fi" on

# 查看当前代理设置
networksetup -getwebproxy "Wi-Fi"
networksetup -getsecurewebproxy "Wi-Fi"
```

## 5. 检查应用状态

在控制台中运行以下代码检查应用状态：

```javascript
// 在渲染进程控制台中
console.log('当前状态:', state);

// 检查 electronAPI 是否可用
console.log('electronAPI:', window.electronAPI);

// 手动获取代理列表
window.electronAPI.getProxies().then(console.log);

// 手动获取代理状态
window.electronAPI.getProxyState().then(console.log);
```

## 6. 常见问题排查清单

- [ ] 是否已经添加了代理配置？
- [ ] 是否已经选择了代理（点击"切换"按钮）？
- [ ] 是否输入了管理员密码？
- [ ] 代理服务器地址和端口是否正确？
- [ ] 网络连接是否正常？
- [ ] 控制台是否有错误信息？
- [ ] 代理类型（HTTP/SOCKS5）是否与服务器匹配？

## 7. 重置应用状态

如果遇到问题，可以尝试：

1. 关闭应用
2. 删除配置存储文件（位于用户目录下的 `electron-store` 配置）
3. 重新启动应用
4. 重新添加代理配置

## 8. 报告问题

如果问题仍然存在，请提供以下信息：

1. macOS 版本
2. 控制台中的完整错误日志
3. 操作步骤
4. 预期行为和实际行为

