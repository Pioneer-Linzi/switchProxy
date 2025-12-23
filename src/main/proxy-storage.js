const Store = require('electron-store');

const store = new Store({
  name: 'proxy-config',
  defaults: {
    proxies: [],
    currentProxy: null,
    proxyEnabled: false,
    selectedNetworkServices: [] // 选中的网络接口列表，空数组表示使用所有接口
  }
});

class ProxyStorage {
  // 获取所有代理配置
  getProxies() {
    return store.get('proxies', []);
  }

  // 添加代理配置
  addProxy(proxy) {
    const proxies = this.getProxies();
    const newProxy = {
      id: this.generateId(),
      name: proxy.name,
      type: proxy.type,
      host: proxy.host,
      port: parseInt(proxy.port),
      enabled: false
    };
    proxies.push(newProxy);
    store.set('proxies', proxies);
    return newProxy;
  }

  // 更新代理配置
  updateProxy(id, proxy) {
    const proxies = this.getProxies();
    const index = proxies.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error('代理配置不存在');
    }
    proxies[index] = {
      ...proxies[index],
      name: proxy.name,
      type: proxy.type,
      host: proxy.host,
      port: parseInt(proxy.port)
    };
    store.set('proxies', proxies);
    return proxies[index];
  }

  // 删除代理配置
  deleteProxy(id) {
    const proxies = this.getProxies();
    const filtered = proxies.filter(p => p.id !== id);
    store.set('proxies', filtered);

    // 如果删除的是当前代理，清除当前代理设置
    if (store.get('currentProxy') === id) {
      store.set('currentProxy', null);
      store.set('proxyEnabled', false);
    }

    return true;
  }

  // 获取当前代理 ID
  getCurrentProxy() {
    return store.get('currentProxy');
  }

  // 设置当前代理
  setCurrentProxy(id) {
    store.set('currentProxy', id);
    return id;
  }

  // 获取代理启用状态
  getProxyEnabled() {
    return store.get('proxyEnabled', false);
  }

  // 设置代理启用状态
  setProxyEnabled(enabled) {
    store.set('proxyEnabled', enabled);
    return enabled;
  }

  // 根据 ID 获取代理配置
  getProxyById(id) {
    const proxies = this.getProxies();
    return proxies.find(p => p.id === id);
  }

  // 生成唯一 ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 获取选中的网络接口
  getSelectedNetworkServices() {
    return store.get('selectedNetworkServices', []);
  }

  // 设置选中的网络接口（空数组表示使用所有接口）
  setSelectedNetworkServices(services) {
    store.set('selectedNetworkServices', services || []);
    return services || [];
  }
}

module.exports = new ProxyStorage();


