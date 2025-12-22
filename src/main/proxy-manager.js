const { ipcMain, BrowserWindow } = require('electron');
const proxyStorage = require('./proxy-storage');
const systemProxy = require('./system-proxy');

class ProxyManager {
  constructor() {
    this.setupIPC();
    // 从存储中加载初始状态
    this.syncState();
  }

  // 同步状态
  syncState() {
    this.currentProxy = proxyStorage.getProxyById(proxyStorage.getCurrentProxy());
    this.proxyEnabled = proxyStorage.getProxyEnabled();
  }

  // 设置 IPC 处理器
  setupIPC() {
    // 获取所有代理
    ipcMain.handle('get-proxies', async () => {
      const proxies = proxyStorage.getProxies();
      const currentProxyId = proxyStorage.getCurrentProxy();
      const proxyEnabled = proxyStorage.getProxyEnabled();

      return {
        proxies,
        currentProxy: currentProxyId,
        proxyEnabled
      };
    });

    // 添加代理
    ipcMain.handle('add-proxy', async (event, proxy) => {
      try {
        const newProxy = proxyStorage.addProxy(proxy);
        this.broadcastState();
        return { success: true, proxy: newProxy };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 更新代理
    ipcMain.handle('update-proxy', async (event, id, proxy) => {
      try {
        const updatedProxy = proxyStorage.updateProxy(id, proxy);

        // 如果更新的是当前代理，需要重新应用设置
        if (proxyStorage.getCurrentProxy() === id && this.proxyEnabled) {
          await this.applyProxy(updatedProxy);
        }

        this.broadcastState();
        return { success: true, proxy: updatedProxy };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 删除代理
    ipcMain.handle('delete-proxy', async (event, id) => {
      try {
        // 如果删除的是当前启用的代理，先关闭代理
        if (proxyStorage.getCurrentProxy() === id && this.proxyEnabled) {
          await this.disableProxy();
        }

        proxyStorage.deleteProxy(id);
        this.broadcastState();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 切换代理
    ipcMain.handle('switch-proxy', async (event, id) => {
      try {
        this.syncState();
        const wasEnabled = this.proxyEnabled;

        // 如果当前代理已启用，先关闭
        if (wasEnabled) {
          await this.disableProxy();
        }

        // 设置新的当前代理
        proxyStorage.setCurrentProxy(id);
        this.currentProxy = proxyStorage.getProxyById(id);

        // 如果之前是启用状态，自动启用新代理
        if (wasEnabled) {
          await this.enableProxy();
        }

        this.broadcastState();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    // 切换代理开关
    ipcMain.handle('toggle-proxy', async (event, enabled) => {
      try {
        console.log('toggle-proxy called:', { enabled });
        this.syncState();

        if (enabled) {
          await this.enableProxy();
        } else {
          await this.disableProxy();
        }

        this.syncState();
        this.broadcastState();
        return { success: true, enabled: this.proxyEnabled };
      } catch (error) {
        console.error('toggle-proxy error:', error);
        return { success: false, error: error.message };
      }
    });

    // 获取代理状态
    ipcMain.handle('get-proxy-state', async () => {
      const currentProxyId = proxyStorage.getCurrentProxy();
      const proxyEnabled = proxyStorage.getProxyEnabled();
      const currentProxy = currentProxyId ? proxyStorage.getProxyById(currentProxyId) : null;

      return {
        currentProxy,
        proxyEnabled,
        currentProxyId
      };
    });
  }

  // 应用代理设置到系统
  async applyProxy(proxy) {
    if (!proxy) {
      throw new Error('代理配置不存在');
    }

    try {
      await systemProxy.setProxy(proxy);
      return true;
    } catch (error) {
      throw new Error(`应用代理设置失败: ${error.message}`);
    }
  }

  // 启用代理
  async enableProxy() {
    const currentProxyId = proxyStorage.getCurrentProxy();
    console.log('enableProxy called, currentProxyId:', currentProxyId);

    if (!currentProxyId) {
      throw new Error('请先选择一个代理配置');
    }

    const proxy = proxyStorage.getProxyById(currentProxyId);
    if (!proxy) {
      throw new Error('代理配置不存在');
    }

    console.log('启用代理:', proxy);

    try {
      // 使用一次性方法设置并启用代理，只触发一次密码提示
      console.log('设置并启用代理（一次性操作）...');
      await systemProxy.setAndEnableProxy(proxy);

      this.currentProxy = proxy;
      this.proxyEnabled = true;
      proxyStorage.setProxyEnabled(true);

      console.log('代理已成功启用');
      return true;
    } catch (error) {
      console.error('启用代理失败:', error);
      throw error;
    }
  }

  // 禁用代理
  async disableProxy() {
    const currentProxyId = proxyStorage.getCurrentProxy();
    if (!currentProxyId) {
      // 如果没有当前代理，直接关闭所有代理
      await systemProxy.disableAllProxies();
      this.proxyEnabled = false;
      proxyStorage.setProxyEnabled(false);
      return true;
    }

    const proxy = proxyStorage.getProxyById(currentProxyId);
    if (!proxy) {
      await systemProxy.disableAllProxies();
      this.proxyEnabled = false;
      proxyStorage.setProxyEnabled(false);
      return true;
    }

    try {
      await systemProxy.disableProxy(proxy);

      this.proxyEnabled = false;
      proxyStorage.setProxyEnabled(false);

      return true;
    } catch (error) {
      throw error;
    }
  }

  // 广播状态变化
  broadcastState() {
    const currentProxyId = proxyStorage.getCurrentProxy();
    const proxyEnabled = proxyStorage.getProxyEnabled();
    const currentProxy = currentProxyId ? proxyStorage.getProxyById(currentProxyId) : null;

    const state = {
      currentProxy,
      proxyEnabled,
      currentProxyId
    };

    // 向所有窗口发送状态更新
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send('proxy-state-changed', state);
    });
  }
}

// 创建单例实例
const proxyManager = new ProxyManager();

module.exports = proxyManager;


