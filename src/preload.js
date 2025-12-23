const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // 代理管理
  getProxies: () => ipcRenderer.invoke('get-proxies'),
  addProxy: (proxy) => ipcRenderer.invoke('add-proxy', proxy),
  updateProxy: (id, proxy) => ipcRenderer.invoke('update-proxy', id, proxy),
  deleteProxy: (id) => ipcRenderer.invoke('delete-proxy', id),
  switchProxy: (id) => ipcRenderer.invoke('switch-proxy', id),

  // 代理开关
  toggleProxy: (enabled) => ipcRenderer.invoke('toggle-proxy', enabled),
  getProxyState: () => ipcRenderer.invoke('get-proxy-state'),

  // 监听状态变化
  onProxyStateChanged: (callback) => {
    ipcRenderer.on('proxy-state-changed', (event, state) => callback(state));
  },

  // 移除监听器
  removeProxyStateListener: () => {
    ipcRenderer.removeAllListeners('proxy-state-changed');
  },

  // 网络接口管理
  getNetworkServices: () => ipcRenderer.invoke('get-network-services'),
  setSelectedNetworkServices: (services) => ipcRenderer.invoke('set-selected-network-services', services),
  getSelectedNetworkServices: () => ipcRenderer.invoke('get-selected-network-services')
});


