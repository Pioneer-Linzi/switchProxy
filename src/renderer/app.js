// 应用状态
let state = {
  proxies: [],
  currentProxy: null,
  proxyEnabled: false
};

// DOM 元素
const elements = {
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  toggleBtn: document.getElementById('toggleBtn'),
  addBtn: document.getElementById('addBtn'),
  proxyList: document.getElementById('proxyList'),
  proxyModal: document.getElementById('proxyModal'),
  proxyForm: document.getElementById('proxyForm'),
  modalTitle: document.getElementById('modalTitle'),
  closeModal: document.getElementById('closeModal'),
  cancelBtn: document.getElementById('cancelBtn'),
  proxyId: document.getElementById('proxyId'),
  proxyName: document.getElementById('proxyName'),
  proxyType: document.getElementById('proxyType'),
  proxyHost: document.getElementById('proxyHost'),
  proxyPort: document.getElementById('proxyPort')
};

// 初始化
async function init() {
  await loadProxies();
  setupEventListeners();
  setupStateListener();
}

// 加载代理列表
async function loadProxies() {
  try {
    const result = await window.electronAPI.getProxies();
    console.log('加载代理列表:', result);
    state.proxies = result.proxies || [];
    state.currentProxy = result.currentProxy;
    state.proxyEnabled = result.proxyEnabled || false;

    updateUI();
  } catch (error) {
    console.error('加载代理列表失败:', error);
    showError('加载代理列表失败: ' + error.message);
  }
}

// 设置事件监听器
function setupEventListeners() {
  // 开关按钮
  elements.toggleBtn.addEventListener('click', handleToggleProxy);

  // 添加代理按钮
  elements.addBtn.addEventListener('click', () => openProxyForm());

  // 关闭模态框
  elements.closeModal.addEventListener('click', closeProxyForm);
  elements.cancelBtn.addEventListener('click', closeProxyForm);

  // 点击模态框背景关闭
  elements.proxyModal.addEventListener('click', (e) => {
    if (e.target === elements.proxyModal) {
      closeProxyForm();
    }
  });

  // 表单提交
  elements.proxyForm.addEventListener('submit', handleSubmitProxy);
}

// 设置状态监听器
function setupStateListener() {
  window.electronAPI.onProxyStateChanged((newState) => {
    state.currentProxy = newState.currentProxyId;
    state.proxyEnabled = newState.proxyEnabled;
    updateUI();
  });
}

// 更新 UI
function updateUI() {
  updateStatus();
  updateToggleButton();
  renderProxyList();
}

// 更新状态显示
function updateStatus() {
  if (state.proxyEnabled && state.currentProxy) {
    const proxy = state.proxies.find(p => p.id === state.currentProxy);
    if (proxy) {
      elements.statusIndicator.className = 'status-indicator active';
      elements.statusText.textContent = `已启用: ${proxy.name}`;
    } else {
      elements.statusIndicator.className = 'status-indicator inactive';
      elements.statusText.textContent = '未启用';
    }
  } else {
    elements.statusIndicator.className = 'status-indicator inactive';
    elements.statusText.textContent = '未启用';
  }
}

// 更新开关按钮
function updateToggleButton() {
  if (state.proxyEnabled) {
    elements.toggleBtn.textContent = '关闭代理';
    elements.toggleBtn.classList.add('btn-danger');
    elements.toggleBtn.classList.remove('btn-primary');
  } else {
    elements.toggleBtn.textContent = '开启代理';
    elements.toggleBtn.classList.remove('btn-danger');
    elements.toggleBtn.classList.add('btn-primary');
  }

  // 如果没有当前代理，禁用按钮
  if (!state.currentProxy) {
    elements.toggleBtn.disabled = true;
  } else {
    elements.toggleBtn.disabled = false;
  }
}

// 渲染代理列表
function renderProxyList() {
  if (state.proxies.length === 0) {
    elements.proxyList.innerHTML = `
      <div class="empty-state">
        <p>还没有配置代理</p>
        <p>点击"添加代理"按钮开始</p>
      </div>
    `;
    return;
  }

  elements.proxyList.innerHTML = state.proxies.map(proxy => {
    const isActive = proxy.id === state.currentProxy;
    const typeLabel = proxy.type === 'http' ? 'HTTP/HTTPS' : 'SOCKS5';

    return `
      <div class="proxy-item ${isActive ? 'active' : ''}" data-id="${proxy.id}">
        <div class="proxy-item-header">
          <div class="proxy-item-name">${escapeHtml(proxy.name)}</div>
          <div class="proxy-item-type">${typeLabel}</div>
        </div>
        <div class="proxy-item-info">
          ${escapeHtml(proxy.host)}:${proxy.port}
        </div>
        <div class="proxy-item-actions">
          <button class="btn btn-secondary btn-switch" data-id="${proxy.id}">
            ${isActive ? '当前' : '切换'}
          </button>
          <button class="btn btn-secondary btn-edit" data-id="${proxy.id}">编辑</button>
          <button class="btn btn-danger btn-delete" data-id="${proxy.id}">删除</button>
        </div>
      </div>
    `;
  }).join('');

  // 绑定列表项事件
  elements.proxyList.querySelectorAll('.btn-switch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      handleSwitchProxy(id);
    });
  });

  elements.proxyList.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      handleEditProxy(id);
    });
  });

  elements.proxyList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      handleDeleteProxy(id);
    });
  });
}

// 处理切换代理
async function handleSwitchProxy(id) {
  try {
    const result = await window.electronAPI.switchProxy(id);
    if (result.success) {
      state.currentProxy = id;
      updateUI();
      showSuccess('代理切换成功');
    } else {
      showError(result.error || '切换代理失败');
    }
  } catch (error) {
    showError('切换代理失败: ' + error.message);
  }
}

// 处理开关代理
async function handleToggleProxy() {
  // 防止重复点击
  if (elements.toggleBtn.disabled) {
    return;
  }

  // 检查是否选择了代理（仅在开启时检查）
  if (!state.proxyEnabled && !state.currentProxy) {
    showError('请先选择一个代理配置。点击代理列表中的"切换"按钮选择代理。');
    return;
  }

  try {
    elements.toggleBtn.disabled = true;
    const newState = !state.proxyEnabled;
    console.log('切换代理状态:', { newState, currentProxy: state.currentProxy });

    const result = await window.electronAPI.toggleProxy(newState);
    console.log('切换结果:', result);

    if (result.success) {
      state.proxyEnabled = result.enabled;
      updateUI();
      showSuccess(newState ? '代理已开启' : '代理已关闭');
    } else {
      const errorMsg = result.error || '操作失败';
      console.error('切换失败:', errorMsg);
      showError(errorMsg);
      updateUI(); // 恢复 UI 状态
    }
  } catch (error) {
    console.error('切换代理异常:', error);
    showError('操作失败: ' + error.message);
    updateUI(); // 恢复 UI 状态
  } finally {
    elements.toggleBtn.disabled = false;
  }
}

// 打开代理表单
function openProxyForm(proxy = null) {
  if (proxy) {
    // 编辑模式
    elements.modalTitle.textContent = '编辑代理';
    elements.proxyId.value = proxy.id;
    elements.proxyName.value = proxy.name;
    elements.proxyType.value = proxy.type;
    elements.proxyHost.value = proxy.host;
    elements.proxyPort.value = proxy.port;
  } else {
    // 添加模式
    elements.modalTitle.textContent = '添加代理';
    elements.proxyForm.reset();
    elements.proxyId.value = '';
  }
  elements.proxyModal.classList.add('show');
}

// 关闭代理表单
function closeProxyForm() {
  elements.proxyModal.classList.remove('show');
  elements.proxyForm.reset();
}

// 处理编辑代理
function handleEditProxy(id) {
  const proxy = state.proxies.find(p => p.id === id);
  if (proxy) {
    openProxyForm(proxy);
  }
}

// 处理删除代理
async function handleDeleteProxy(id) {
  if (!confirm('确定要删除这个代理配置吗？')) {
    return;
  }

  try {
    const result = await window.electronAPI.deleteProxy(id);
    if (result.success) {
      await loadProxies();
      showSuccess('代理已删除');
    } else {
      showError(result.error || '删除失败');
    }
  } catch (error) {
    showError('删除失败: ' + error.message);
  }
}

// 处理提交表单
async function handleSubmitProxy(e) {
  e.preventDefault();

  const proxy = {
    name: elements.proxyName.value.trim(),
    type: elements.proxyType.value,
    host: elements.proxyHost.value.trim(),
    port: elements.proxyPort.value.trim()
  };

  if (!proxy.name || !proxy.host || !proxy.port) {
    showError('请填写所有必填项');
    return;
  }

  try {
    const id = elements.proxyId.value;
    let result;

    if (id) {
      // 更新
      result = await window.electronAPI.updateProxy(id, proxy);
    } else {
      // 添加
      result = await window.electronAPI.addProxy(proxy);
    }

    if (result.success) {
      await loadProxies();
      closeProxyForm();
      showSuccess(id ? '代理已更新' : '代理已添加');
    } else {
      showError(result.error || '操作失败');
    }
  } catch (error) {
    showError('操作失败: ' + error.message);
  }
}

// 显示成功消息
function showSuccess(message) {
  // 简单的提示，可以后续改进为更好的 UI
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #34c759;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    font-size: 14px;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.remove();
  }, 3000);
}

// 显示错误消息
function showError(message) {
  // 简单的提示，可以后续改进为更好的 UI
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ff3b30;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    z-index: 10000;
    font-size: 14px;
    max-width: 400px;
    word-wrap: break-word;
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  // 如果是权限错误，显示更长时间
  const duration = message.includes('权限') || message.includes('密码') ? 8000 : 5000;

  setTimeout(() => {
    notification.style.opacity = '0';
    notification.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, duration);
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

