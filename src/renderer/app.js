// 应用状态
let state = {
  proxies: [],
  currentProxy: null,
  proxyEnabled: false,
  networkServices: [],
  selectedNetworkServices: []
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
  proxyPort: document.getElementById('proxyPort'),
  networkServicesList: document.getElementById('networkServicesList'),
  refreshServicesBtn: document.getElementById('refreshServicesBtn')
};

// 初始化
async function init() {
  await loadProxies();
  // 先加载网络接口列表，再加载选中的网络接口，最后渲染
  await loadNetworkServices();
  await loadSelectedNetworkServices();
  // 加载完选中的网络接口后，重新渲染以确保显示正确的选中状态
  renderNetworkServices();
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

  // 刷新网络接口列表
  if (elements.refreshServicesBtn) {
    elements.refreshServicesBtn.addEventListener('click', async () => {
      await loadNetworkServices();
      // 刷新后重新加载选中的网络接口并渲染
      await loadSelectedNetworkServices();
      renderNetworkServices();
    });
  }
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
  renderNetworkServices();
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

// 加载网络接口列表
async function loadNetworkServices() {
  try {
    const result = await window.electronAPI.getNetworkServices();
    if (result.success) {
      state.networkServices = result.services || [];
      // 不在这里渲染，等待选中的网络接口加载完成后再渲染
    } else {
      console.error('加载网络接口失败:', result.error);
      showError('加载网络接口失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    console.error('加载网络接口异常:', error);
    showError('加载网络接口失败: ' + error.message);
  }
}

// 加载选中的网络接口
async function loadSelectedNetworkServices() {
  try {
    const result = await window.electronAPI.getSelectedNetworkServices();
    if (result.success) {
      state.selectedNetworkServices = result.services || [];
      console.log('加载选中的网络接口:', state.selectedNetworkServices);
    } else {
      console.error('加载选中的网络接口失败:', result.error);
      // 如果加载失败，使用空数组（表示使用所有接口）
      state.selectedNetworkServices = [];
    }
  } catch (error) {
    console.error('加载选中的网络接口异常:', error);
    // 如果加载异常，使用空数组（表示使用所有接口）
    state.selectedNetworkServices = [];
  }
}

// 渲染网络接口列表
function renderNetworkServices() {
  if (!elements.networkServicesList) {
    return;
  }

  if (state.networkServices.length === 0) {
    elements.networkServicesList.innerHTML = `
      <div class="empty-state">
        <p>没有检测到网络接口</p>
        <p>点击"刷新"按钮重新加载</p>
      </div>
    `;
    return;
  }

  const allSelected = state.selectedNetworkServices.length === 0;
  const selectedSet = new Set(state.selectedNetworkServices);

  elements.networkServicesList.innerHTML = `
    <div class="network-service-item">
      <label class="network-service-checkbox">
        <input type="checkbox" id="selectAllServices" ${allSelected ? 'checked' : ''}>
        <span>应用到所有接口</span>
      </label>
    </div>
    ${state.networkServices.map(service => {
      const isSelected = allSelected || selectedSet.has(service);
      return `
        <div class="network-service-item">
          <label class="network-service-checkbox">
            <input type="checkbox" data-service="${escapeHtml(service)}" ${isSelected ? 'checked' : ''} ${allSelected ? 'disabled' : ''}>
            <span>${escapeHtml(service)}</span>
          </label>
        </div>
      `;
    }).join('')}
  `;

  // 绑定事件
  const selectAllCheckbox = document.getElementById('selectAllServices');
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', async (e) => {
      if (e.target.checked) {
        // 选择所有 = 清空选中列表（表示使用所有接口）
        await saveSelectedNetworkServices([]);
      } else {
        // 取消选择所有 = 选择所有接口
        await saveSelectedNetworkServices(state.networkServices);
      }
    });
  }

  // 绑定单个接口的复选框事件
  elements.networkServicesList.querySelectorAll('input[type="checkbox"][data-service]').forEach(checkbox => {
    checkbox.addEventListener('change', async (e) => {
      const service = e.target.getAttribute('data-service');
      let newSelected = [...state.selectedNetworkServices];

      if (e.target.checked) {
        // 添加到选中列表
        if (!newSelected.includes(service)) {
          newSelected.push(service);
        }
      } else {
        // 从选中列表移除
        newSelected = newSelected.filter(s => s !== service);
      }

      // 如果选中了所有接口，则清空列表（表示使用所有接口）
      if (newSelected.length === state.networkServices.length) {
        newSelected = [];
      }

      await saveSelectedNetworkServices(newSelected);
    });
  });
}

// 保存选中的网络接口
async function saveSelectedNetworkServices(services) {
  try {
    const result = await window.electronAPI.setSelectedNetworkServices(services);
    if (result.success) {
      state.selectedNetworkServices = services || [];
      renderNetworkServices();
      
      // 如果代理已开启，自动重新应用代理设置
      if (state.proxyEnabled && state.currentProxy) {
        console.log('代理已开启，重新应用代理设置到新的网络接口...');
        try {
          // 先关闭代理
          await window.electronAPI.toggleProxy(false);
          // 再重新开启代理（会使用新的网络接口配置）
          await window.electronAPI.toggleProxy(true);
          showSuccess('网络接口选择已更新，代理设置已重新应用');
        } catch (error) {
          console.error('重新应用代理设置失败:', error);
          showError('网络接口选择已保存，但重新应用代理设置失败: ' + error.message);
        }
      } else {
        showSuccess('网络接口选择已保存');
      }
    } else {
      showError('保存网络接口选择失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    console.error('保存网络接口选择异常:', error);
    showError('保存网络接口选择失败: ' + error.message);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);

