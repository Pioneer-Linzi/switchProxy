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
    console.log('辅助脚本路径:', this.helperScriptPath);
    console.log('脚本是否存在:', fs.existsSync(this.helperScriptPath));
    // 确保脚本有执行权限
    this.ensureScriptExecutable();
  }

  // 获取辅助脚本路径
  getHelperScriptPath() {
    // 在开发环境中，脚本在 src/main 目录
    const devPath = path.join(__dirname, 'helper-script.sh');

    // 优先使用开发路径
    if (fs.existsSync(devPath)) {
      console.log('使用开发路径:', devPath);
      return devPath;
    }

    // 生产环境：尝试从应用资源目录查找
    try {
      const { app } = require('electron');
      if (app && !app.isPackaged) {
        // 开发模式
        console.log('开发模式，使用开发路径:', devPath);
        return devPath;
      } else if (app) {
        // 打包后的应用：尝试多个可能的位置
        const resourcesPath = process.resourcesPath || path.join(app.getAppPath(), '..', '..', 'Resources');
        const appPath = app.getAppPath();

        console.log('生产模式 - resourcesPath:', resourcesPath);
        console.log('生产模式 - appPath:', appPath);

        const possiblePaths = [
          // 从 extraFiles 复制的位置（最优先）
          path.join(resourcesPath, 'helper-script.sh'),
          // 从 asarUnpack 解压的位置
          path.join(resourcesPath, 'app.asar.unpacked', 'src', 'main', 'helper-script.sh'),
          // 应用包内的资源目录
          path.join(appPath, 'helper-script.sh'),
          // 备用位置
          path.join(resourcesPath, 'app', 'src', 'main', 'helper-script.sh'),
          // 直接使用 __dirname（如果已解压）
          path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'helper-script.sh')
        ];

        console.log('尝试查找脚本路径:', possiblePaths);

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
  async executeWithHelper(action, service, type, host, port, customCommand = null) {
    // 转义参数中的特殊字符（用于 shell 命令）
    const escapeShellArg = (arg) => {
      if (!arg) return '';
      return String(arg).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    };

    const escapedService = escapeShellArg(service);
    const escapedType = escapeShellArg(type);
    const escapedHost = escapeShellArg(host);
    const escapedPort = escapeShellArg(port);

    // 构建命令：直接内联执行，不依赖外部脚本文件
    // 这样可以避免 asar 打包问题
    let commands = [];
    let shellCommand;

    // 如果提供了自定义命令，直接使用
    if (action === 'custom' && customCommand) {
      shellCommand = customCommand;
    } else {
      switch (action) {
        case 'set-and-enable-http':
          commands = [
            `networksetup -setwebproxy "${escapedService}" ${escapedHost} ${escapedPort}`,
            `networksetup -setsecurewebproxy "${escapedService}" ${escapedHost} ${escapedPort}`,
            `networksetup -setwebproxystate "${escapedService}" on`,
            `networksetup -setsecurewebproxystate "${escapedService}" on`
          ];
          break;
        case 'set-and-enable-socks':
          commands = [
            `networksetup -setsocksfirewallproxy "${escapedService}" ${escapedHost} ${escapedPort}`,
            `networksetup -setsocksfirewallproxystate "${escapedService}" on`
          ];
          break;
        case 'disable-all':
          commands = [
            `networksetup -setwebproxystate "${escapedService}" off`,
            `networksetup -setsecurewebproxystate "${escapedService}" off`,
            `networksetup -setsocksfirewallproxystate "${escapedService}" off`
          ];
          break;
        default:
          throw new Error(`未知的操作: ${action}`);
      }

      // 将所有命令合并为一个命令，用 && 连接
      shellCommand = commands.join(' && ');
    }

    try {
      // 首先检查是否已配置 sudo 免密
      const hasSudo = await authHelper.hasSudoNopasswd();
      console.log('检查 sudo 免密配置:', hasSudo);

      if (!hasSudo) {
        // 如果未配置 sudo 免密，尝试配置（首次需要输入密码）
        const hasAuth = authHelper.hasAuthMark();
        if (!hasAuth) {
          console.log('首次使用，配置 sudo 免密（需要输入一次密码）...');
          try {
            await authHelper.configureSudoNopasswd();
            console.log('Sudo 免密配置成功，后续操作不需要密码');
          } catch (configError) {
            console.warn('配置 sudo 免密失败，使用 osascript 授权缓存:', configError.message);
            // 如果配置失败，回退到 osascript 方式
            await authHelper.acquireAuth();
          }
        } else {
          console.log('授权标记存在，但未配置 sudo 免密，尝试配置...');
          try {
            await authHelper.configureSudoNopasswd();
            console.log('Sudo 免密配置成功');
          } catch (configError) {
            console.warn('配置 sudo 免密失败，使用 osascript 授权缓存');
          }
        }
      } else {
        console.log('Sudo 免密已配置，直接执行（不需要密码）');
      }

      // 执行命令（如果已配置 sudo 免密，不会提示密码）
      const result = await authHelper.executeWithAuth(shellCommand);
      console.log('命令执行成功');
      return result;
    } catch (error) {
      // 如果授权失败，说明可能是首次使用或配置失败
      if (error.message.includes('需要管理员权限') || error.message.includes('authentication')) {
        console.log('授权失败，尝试重新获取授权...');
        try {
          // 尝试配置 sudo 免密
          await authHelper.configureSudoNopasswd();
          // 重试执行
          const result = await authHelper.executeWithAuth(shellCommand);
          console.log('命令执行成功（配置 sudo 免密后）');
          return result;
        } catch (retryError) {
          throw new Error('需要管理员权限。请在系统提示时输入密码（配置后将永久免密）。');
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
  // networkServices: 可以是单个服务名（字符串）或服务名数组，如果为空则使用所有服务
  async disableAllProxies(networkServices = null) {
    // 确定要使用的网络服务列表
    let services = [];
    if (networkServices === null || networkServices === undefined) {
      // 如果没有指定，使用所有网络服务
      services = await this.getNetworkServices();
    } else if (Array.isArray(networkServices)) {
      services = networkServices;
    } else {
      // 单个服务名
      services = [networkServices];
    }

    if (services.length === 0) {
      throw new Error('没有可用的网络服务');
    }

    try {
      // 为所有服务构建命令
      const allCommands = [];

      for (const service of services) {
        allCommands.push(
          `networksetup -setwebproxystate "${service}" off`,
          `networksetup -setsecurewebproxystate "${service}" off`,
          `networksetup -setsocksfirewallproxystate "${service}" off`
        );
      }

      // 一次性执行所有命令
      const commandString = allCommands.join(' && ');
      await this.executeWithHelper('custom', '', '', '', '', commandString);
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
  // networkServices: 可以是单个服务名（字符串）或服务名数组，如果为空则使用所有服务
  async setAndEnableProxy(proxy, networkServices = null) {
    const { type, host, port } = proxy;

    // 确定要使用的网络服务列表
    let services = [];
    if (networkServices === null || networkServices === undefined) {
      // 如果没有指定，使用所有网络服务
      services = await this.getNetworkServices();
    } else if (Array.isArray(networkServices)) {
      services = networkServices;
    } else {
      // 单个服务名
      services = [networkServices];
    }

    if (services.length === 0) {
      throw new Error('没有可用的网络服务');
    }

    try {
      // 为所有服务构建命令
      const allCommands = [];

      for (const service of services) {
        if (type === 'http') {
          allCommands.push(
            `networksetup -setwebproxy "${service}" ${host} ${port}`,
            `networksetup -setsecurewebproxy "${service}" ${host} ${port}`,
            `networksetup -setwebproxystate "${service}" on`,
            `networksetup -setsecurewebproxystate "${service}" on`
          );
        } else if (type === 'socks5') {
          allCommands.push(
            `networksetup -setsocksfirewallproxy "${service}" ${host} ${port}`,
            `networksetup -setsocksfirewallproxystate "${service}" on`
          );
        } else {
          throw new Error(`不支持的代理类型: ${type}`);
        }
      }

      // 一次性执行所有命令，只触发一次密码提示
      const commandString = allCommands.join(' && ');
      await this.executeWithHelper('custom', '', type, host, port, commandString);
      return true;
    } catch (error) {
      throw new Error(`设置并启用代理失败: ${error.message}`);
    }
  }

  // 关闭代理（根据类型）
  // networkServices: 可以是单个服务名（字符串）或服务名数组，如果为空则使用所有服务
  async disableProxy(proxy, networkServices = null) {
    const { type } = proxy;

    // 确定要使用的网络服务列表
    let services = [];
    if (networkServices === null || networkServices === undefined) {
      // 如果没有指定，使用所有网络服务
      services = await this.getNetworkServices();
    } else if (Array.isArray(networkServices)) {
      services = networkServices;
    } else {
      // 单个服务名
      services = [networkServices];
    }

    if (services.length === 0) {
      throw new Error('没有可用的网络服务');
    }

    try {
      // 为所有服务构建命令
      const allCommands = [];

      for (const service of services) {
        if (type === 'http') {
          allCommands.push(
            `networksetup -setwebproxystate "${service}" off`,
            `networksetup -setsecurewebproxystate "${service}" off`
          );
        } else if (type === 'socks5') {
          allCommands.push(
            `networksetup -setsocksfirewallproxystate "${service}" off`
          );
        } else {
          throw new Error(`不支持的代理类型: ${type}`);
        }
      }

      // 一次性执行所有命令
      const commandString = allCommands.join(' && ');
      await this.executeWithHelper('custom', '', type, '', '', commandString);
      return true;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = new SystemProxy();

