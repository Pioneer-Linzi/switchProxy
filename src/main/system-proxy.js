const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const sudo = require('sudo-prompt');
const authHelper = require('./auth-helper');

const execAsync = promisify(exec);

class SystemProxy {
  constructor() {
    // 获取辅助脚本路径（支持开发和生产环境）
    this.helperScriptPath = this.getHelperScriptPath();
    // 确保脚本有执行权限
    this.ensureScriptExecutable();
  }

  // 获取辅助脚本路径
  getHelperScriptPath() {
    // 在开发环境中，脚本在 src/main 目录
    const devPath = path.join(__dirname, 'helper-script.sh');

    // 优先使用开发路径
    if (fs.existsSync(devPath)) {
      return devPath;
    }

    // 生产环境：尝试从应用资源目录查找
    try {
      const { app } = require('electron');
      if (app && !app.isPackaged) {
        // 开发模式
        return devPath;
      } else if (app && process.resourcesPath) {
        // 打包后的应用：尝试多个可能的位置
        const possiblePaths = [
          // 从 extraFiles 复制的位置（最优先）
          path.join(process.resourcesPath, 'helper-script.sh'),
          // 从 asarUnpack 解压的位置
          path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'main', 'helper-script.sh'),
          // 应用包内的资源目录
          path.join(app.getAppPath(), 'helper-script.sh'),
          // 备用位置
          path.join(process.resourcesPath, 'app', 'src', 'main', 'helper-script.sh')
        ];

        for (const prodPath of possiblePaths) {
          if (fs.existsSync(prodPath)) {
            console.log('找到辅助脚本:', prodPath);
            return prodPath;
          }
        }

        console.warn('未找到辅助脚本，尝试的位置:', possiblePaths);
        console.warn('使用开发路径作为备用:', devPath);
      }
    } catch (error) {
      console.warn('获取应用路径失败:', error);
    }

    return devPath;
  }

  // 确保辅助脚本有执行权限
  ensureScriptExecutable() {
    try {
      if (fs.existsSync(this.helperScriptPath)) {
        fs.chmodSync(this.helperScriptPath, 0o755);
      }
    } catch (error) {
      console.warn('无法设置脚本执行权限:', error);
    }
  }

  // 获取所有网络服务
  async getNetworkServices() {
    try {
      const { stdout } = await execAsync('networksetup -listallnetworkservices');
      const services = stdout
        .split('\n')
        .slice(1) // 跳过第一行标题
        .map(line => line.trim())
        .filter(line => line.length > 0);
      return services;
    } catch (error) {
      throw new Error(`获取网络服务失败: ${error.message}`);
    }
  }

  // 获取当前活跃的网络服务（通常是第一个启用的）
  async getActiveNetworkService() {
    try {
      const services = await this.getNetworkServices();
      // 通常 Wi-Fi 或以太网是活跃的，优先选择 Wi-Fi
      const wifiService = services.find(s => s.includes('Wi-Fi') || s.includes('WiFi'));
      if (wifiService) {
        return wifiService;
      }
      // 如果没有 Wi-Fi，返回第一个服务
      return services[0] || 'Wi-Fi';
    } catch (error) {
      // 如果获取失败，默认使用 Wi-Fi
      return 'Wi-Fi';
    }
  }

  // 执行 networksetup 命令（使用授权助手）
  async executeCommand(command, options = {}) {
    try {
      // 检查是否已有授权，如果没有则先获取
      if (!authHelper.hasAuthMark()) {
        console.log('首次使用，获取授权...');
        await authHelper.acquireAuth();
      }

      // 使用授权助手执行命令
      const result = await authHelper.executeWithAuth(command);
      return result;
    } catch (error) {
      // 如果授权失败，尝试重新获取授权
      if (error.message.includes('需要管理员权限') || error.message.includes('authentication')) {
        console.log('授权可能已过期，重新获取授权...');
        try {
          await authHelper.acquireAuth();
          // 重试执行
          const result = await authHelper.executeWithAuth(command);
          return result;
        } catch (retryError) {
          throw new Error('需要管理员权限。请在系统提示时输入密码（授权将长期有效，直到注销或重启）。');
        }
      }
      throw error;
    }
  }

  // 使用辅助脚本执行命令（通过授权助手实现长期授权缓存）
  async executeWithHelper(action, service, type, host, port) {
    // 转义参数中的特殊字符（用于 shell 命令）
    const escapeShellArg = (arg) => {
      if (!arg) return '';
      return String(arg).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    };

    const escapedService = escapeShellArg(service);
    const escapedType = escapeShellArg(type);
    const escapedHost = escapeShellArg(host);
    const escapedPort = escapeShellArg(port);

    // 转义脚本路径（用于 shell）
    const scriptPath = escapeShellArg(this.helperScriptPath);

    // 构建 shell 命令（参数顺序：SERVICE TYPE HOST PORT ACTION）
    const shellCommand = `${scriptPath} "${escapedService}" "${escapedType}" "${escapedHost}" "${escapedPort}" "${action}"`;

    try {
      // 检查是否已有授权，如果没有则先获取
      if (!authHelper.hasAuthMark()) {
        console.log('首次使用，获取授权...');
        await authHelper.acquireAuth();
      }

      // 使用授权助手执行命令
      // osascript 的授权缓存通常持续到用户注销或重启系统
      const result = await authHelper.executeWithAuth(shellCommand);
      console.log('命令执行成功');
      return result;
    } catch (error) {
      // 如果授权失败，尝试重新获取授权
      if (error.message.includes('需要管理员权限') || error.message.includes('authentication')) {
        console.log('授权可能已过期，重新获取授权...');
        try {
          await authHelper.acquireAuth();
          // 重试执行
          const result = await authHelper.executeWithAuth(shellCommand);
          console.log('命令执行成功（重试后）');
          return result;
        } catch (retryError) {
          throw new Error('需要管理员权限。请在系统提示时输入密码（授权将长期有效，直到注销或重启）。');
        }
      }
      throw error;
    }
  }

  // 批量执行多个命令（使用授权助手）
  async executeCommands(commands, options = {}) {
    if (commands.length === 0) {
      return Promise.resolve('');
    }

    const commandString = commands.join(' && ');

    try {
      // 检查是否已有授权，如果没有则先获取
      if (!authHelper.hasAuthMark()) {
        console.log('首次使用，获取授权...');
        await authHelper.acquireAuth();
      }

      // 使用授权助手执行命令
      const result = await authHelper.executeWithAuth(commandString);
      return result;
    } catch (error) {
      // 如果授权失败，尝试重新获取授权
      if (error.message.includes('需要管理员权限') || error.message.includes('authentication')) {
        console.log('授权可能已过期，重新获取授权...');
        try {
          await authHelper.acquireAuth();
          // 重试执行
          const result = await authHelper.executeWithAuth(commandString);
          return result;
        } catch (retryError) {
          throw new Error('需要管理员权限。请在系统提示时输入密码（授权将长期有效，直到注销或重启）。');
        }
      }
      throw error;
    }
  }

  // 设置 HTTP 代理
  async setHttpProxy(host, port, networkService) {
    const service = networkService || await this.getActiveNetworkService();
    const commands = [
      `networksetup -setwebproxy "${service}" ${host} ${port}`,
      `networksetup -setsecurewebproxy "${service}" ${host} ${port}`
    ];

    try {
      // 批量执行，只触发一次密码提示
      await this.executeCommands(commands);
      return true;
    } catch (error) {
      throw new Error(`设置 HTTP 代理失败: ${error.message}`);
    }
  }

  // 设置 SOCKS5 代理
  async setSocksProxy(host, port, networkService) {
    const service = networkService || await this.getActiveNetworkService();
    const command = `networksetup -setsocksfirewallproxy "${service}" ${host} ${port}`;

    try {
      await this.executeCommand(command);
      return true;
    } catch (error) {
      throw new Error(`设置 SOCKS5 代理失败: ${error.message}`);
    }
  }

  // 开启 HTTP 代理
  async enableHttpProxy(networkService) {
    const service = networkService || await this.getActiveNetworkService();
    const commands = [
      `networksetup -setwebproxystate "${service}" on`,
      `networksetup -setsecurewebproxystate "${service}" on`
    ];

    try {
      // 批量执行，只触发一次密码提示
      await this.executeCommands(commands);
      return true;
    } catch (error) {
      throw new Error(`开启 HTTP 代理失败: ${error.message}`);
    }
  }

  // 开启 SOCKS5 代理
  async enableSocksProxy(networkService) {
    const service = networkService || await this.getActiveNetworkService();
    const command = `networksetup -setsocksfirewallproxystate "${service}" on`;

    try {
      await this.executeCommand(command);
      return true;
    } catch (error) {
      throw new Error(`开启 SOCKS5 代理失败: ${error.message}`);
    }
  }

  // 关闭 HTTP 代理
  async disableHttpProxy(networkService) {
    const service = networkService || await this.getActiveNetworkService();
    const commands = [
      `networksetup -setwebproxystate "${service}" off`,
      `networksetup -setsecurewebproxystate "${service}" off`
    ];

    try {
      // 批量执行，只触发一次密码提示
      await this.executeCommands(commands);
      return true;
    } catch (error) {
      throw new Error(`关闭 HTTP 代理失败: ${error.message}`);
    }
  }

  // 关闭 SOCKS5 代理
  async disableSocksProxy(networkService) {
    const service = networkService || await this.getActiveNetworkService();
    const command = `networksetup -setsocksfirewallproxystate "${service}" off`;

    try {
      await this.executeCommand(command);
      return true;
    } catch (error) {
      throw new Error(`关闭 SOCKS5 代理失败: ${error.message}`);
    }
  }

  // 关闭所有代理
  async disableAllProxies(networkService) {
    const service = networkService || await this.getActiveNetworkService();

    try {
      // 使用辅助脚本一次性关闭所有代理，只触发一次密码提示
      await this.executeWithHelper('disable-all', service, '', '', '');
      return true;
    } catch (error) {
      throw new Error(`关闭代理失败: ${error.message}`);
    }
  }

  // 设置代理（根据类型）
  async setProxy(proxy, networkService) {
    const { type, host, port } = proxy;

    try {
      if (type === 'http') {
        await this.setHttpProxy(host, port, networkService);
      } else if (type === 'socks5') {
        await this.setSocksProxy(host, port, networkService);
      } else {
        throw new Error(`不支持的代理类型: ${type}`);
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  // 开启代理（根据类型）
  async enableProxy(proxy, networkService) {
    const { type } = proxy;

    try {
      if (type === 'http') {
        await this.enableHttpProxy(networkService);
      } else if (type === 'socks5') {
        await this.enableSocksProxy(networkService);
      } else {
        throw new Error(`不支持的代理类型: ${type}`);
      }
      return true;
    } catch (error) {
      throw error;
    }
  }

  // 设置并启用代理（一次性操作，只触发一次密码提示，使用长期授权缓存）
  async setAndEnableProxy(proxy, networkService) {
    const { type, host, port } = proxy;
    const service = networkService || await this.getActiveNetworkService();

    try {
      let action;
      if (type === 'http') {
        action = 'set-and-enable-http';
      } else if (type === 'socks5') {
        action = 'set-and-enable-socks';
      } else {
        throw new Error(`不支持的代理类型: ${type}`);
      }

      // 使用辅助脚本一次性执行所有命令，只触发一次密码提示
      // osascript 的授权缓存通常持续到用户注销或重启系统
      await this.executeWithHelper(action, service, type, host, port);
      return true;
    } catch (error) {
      throw new Error(`设置并启用代理失败: ${error.message}`);
    }
  }

  // 关闭代理（根据类型）
  async disableProxy(proxy, networkService) {
    const { type } = proxy;

    try {
      if (type === 'http') {
        await this.disableHttpProxy(networkService);
      } else if (type === 'socks5') {
        await this.disableSocksProxy(networkService);
      } else {
        throw new Error(`不支持的代理类型: ${type}`);
      }
      return true;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new SystemProxy();

