let currentFilter = 'all';
let currentClient = '';
let isLoggedIn = false;
let allOrders = [];

// --- Auth ---

async function login() {
  const password = document.getElementById('password').value;
  if (!password) return;

  const btn = document.getElementById('login-btn');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (res.ok) {
      isLoggedIn = true;
      showAdmin();
    } else {
      alert('Senha incorreta');
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  } catch (e) {
    alert('Erro ao conectar');
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  isLoggedIn = false;
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('password').value = '';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').textContent = 'Entrar';
}

function showAdmin() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  loadSummary();
  loadOrders();
  loadProductsAdmin();
  loadAnalytics();
  checkDemoMode();
  if (typeof hideLoading === 'function') hideLoading();
}

// --- Summary ---

async function loadSummary() {
  try {
    const res = await fetch('/api/summary');
    if (!res.ok) throw new Error('Unauthorized');
    const s = await res.json();
    document.getElementById('stat-total').textContent = s.total_orders;
    document.getElementById('stat-sold').textContent = formatCents(s.total_sold_cents);
    document.getElementById('stat-paid').textContent = formatCents(s.total_paid_cents);
    document.getElementById('stat-pending').textContent = formatCents(s.total_pending_cents);
  } catch (e) {
    // ignore
  }
}

// --- Orders ---

async function loadOrders() {
  const list = document.getElementById('orders-list');
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Unauthorized');
    allOrders = await res.json();
    populateClientFilter();
    renderFilteredOrders();
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Erro ao carregar pedidos</p></div>';
  }
}

function populateClientFilter() {
  const select = document.getElementById('client-filter');
  const clients = [...new Set(allOrders.map(o => o.customer_name))].sort();
  const current = select.value;
  select.innerHTML = '<option value="">Todos os clientes</option>';
  clients.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  select.value = current || '';
}

function filterByClient(name) {
  currentClient = name;
  renderFilteredOrders();
}

function renderFilteredOrders() {
  const list = document.getElementById('orders-list');
  let orders = allOrders.slice();

  if (currentFilter !== 'all') {
    const paidVal = currentFilter === 'true';
    orders = orders.filter(o => o.paid === paidVal);
  }

  if (currentClient) {
    orders = orders.filter(o => o.customer_name === currentClient);
  }

  // Atualizar resumo do cliente
  updateClientSummary();

  if (orders.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#128203;</div><p>Nenhum pedido encontrado</p></div>';
    return;
  }

  list.innerHTML = '';
  orders.forEach(o => {
    const card = document.createElement('div');
    card.className = `order-card ${o.paid ? 'paid' : ''}`;
    card.id = `order-${o.id}`;

    const itemsHtml = o.items.map(i =>
      `<span class="order-item-tag">${i.product_name} x${i.quantity}<button class="item-remove-btn" onclick="removeItem('${o.id}', '${escapeAttr(i.product_name)}', '${escapeAttr(o.customer_name)}')">×</button></span>`
    ).join('');

    const time = new Date(o.created_at).toLocaleString('pt-BR');

    card.innerHTML = `
      <div class="order-header">
        <span class="order-name">${o.customer_name}</span>
        <span class="order-time">${time}</span>
      </div>
      <div class="order-items">${itemsHtml}</div>
      <div class="order-footer">
        <span class="order-total">R$ ${formatCents(o.total_cents)}</span>
        <div class="order-actions">
          ${o.paid
            ? '<span class="badge badge-paid">Pago</span>'
            : `<button class="btn btn-sm btn-success" onclick="markPaid('${o.id}')">Marcar Pago</button>`
          }
          <button class="btn btn-sm btn-danger-outline" onclick="deleteOrder('${o.id}', '${escapeAttr(o.customer_name)}')">Excluir</button>
        </div>
      </div>
    `;
    list.appendChild(card);
  });
}

function updateClientSummary() {
  const summaryEl = document.getElementById('client-summary');
  if (!currentClient) {
    summaryEl.style.display = 'none';
    return;
  }
  const clientOrders = allOrders.filter(o => o.customer_name === currentClient);
  const pendingCents = clientOrders.filter(o => !o.paid).reduce((s, o) => s + o.total_cents, 0);
  const paidCents = clientOrders.filter(o => o.paid).reduce((s, o) => s + o.total_cents, 0);

  document.getElementById('client-summary-name').textContent = currentClient;
  document.getElementById('client-summary-pending').textContent = `R$ ${formatCents(pendingCents)}`;
  document.getElementById('client-summary-paid').textContent = `R$ ${formatCents(paidCents)}`;
  summaryEl.style.display = 'block';
}

async function markPaid(id) {
  try {
    const res = await fetch(`/api/orders/${id}/pay`, { method: 'PATCH' });
    if (res.ok) {
      await loadOrders();
      loadSummary();
    }
  } catch (e) {
    alert('Erro ao marcar como pago');
  }
}

async function deleteOrder(id, name) {
  if (!confirm(`Excluir pedido de ${name} inteiramente?`)) return;
  try {
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await loadOrders();
      loadSummary();
    } else {
      alert('Erro ao excluir pedido');
    }
  } catch (e) {
    alert('Erro ao conectar');
  }
}

async function removeItem(orderId, productName, customerName) {
  if (!confirm(`Remover ${productName} do pedido de ${customerName}?`)) return;
  try {
    const res = await fetch(`/api/orders/${orderId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_name: productName })
    });
    if (res.ok || res.status === 204) {
      await loadOrders();
      loadSummary();
    } else {
      alert('Erro ao remover item');
    }
  } catch (e) {
    alert('Erro ao conectar');
  }
}

function filterOrders(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === filter);
  });
  renderFilteredOrders();
}

// --- Products ---

async function loadProductsAdmin() {
  const list = document.getElementById('products-list-admin');
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error('Unauthorized');
    const products = await res.json();

    if (products.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>Nenhum sabor cadastrado</p></div>';
      return;
    }

    list.innerHTML = '';
    products.forEach(p => {
      const item = document.createElement('div');
      item.className = 'admin-product-item';
      item.id = `admin-product-${p.id}`;
      item.innerHTML = `
        <div>
          <span class="admin-product-name">${p.name}</span>
          <span class="admin-product-price"> - R$ ${formatCents(p.price_cents)}</span>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Remover</button>
      `;
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Erro ao carregar sabores</p></div>';
  }
}

async function createProduct() {
  const name = document.getElementById('new-product-name').value.trim();
  const priceCents = parseInt(document.getElementById('new-product-price').value);

  if (!name) {
    alert('Informe o nome do sabor');
    return;
  }
  if (!priceCents || priceCents <= 0) {
    alert('Informe um preco valido (em centavos)');
    return;
  }

  try {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, price_cents: priceCents, active: true })
    });

    if (res.ok) {
      document.getElementById('new-product-name').value = '';
      document.getElementById('new-product-price').value = '600';
      loadProductsAdmin();
    } else {
      alert('Erro ao criar sabor');
    }
  } catch (e) {
    alert('Erro ao conectar');
  }
}

async function deleteProduct(id) {
  if (!confirm('Desativar este sabor?')) return;

  try {
    const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadProductsAdmin();
    } else {
      alert('Erro ao remover sabor');
    }
  } catch (e) {
    alert('Erro ao conectar');
  }
}

// --- Tabs ---

function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.remove('active');
  });
  document.getElementById(`tab-${tab}`).classList.add('active');
}

// --- Utils ---

async function checkDemoMode() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      if (data.demo) {
        document.getElementById('demo-warning').style.display = 'block';
      }
    }
  } catch (e) {}
}

function formatCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function escapeAttr(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// --- Analytics ---

let analyticsOrders = [];
let analyticsCharts = {};

async function loadAnalytics() {
  try {
    const res = await fetch('/api/orders');
    if (!res.ok) throw new Error('Unauthorized');
    analyticsOrders = await res.json();
    renderAnalytics();
  } catch (e) {
    console.error('Erro ao carregar analytics:', e);
  }
}

function renderAnalytics() {
  const checkboxes = document.querySelectorAll('.metric-chip input');
  const visible = {};
  checkboxes.forEach(cb => {
    visible[cb.value] = cb.checked;
  });

  const metrics = ['month', 'week', 'clients', 'flavors', 'paidstatus', 'timeline'];
  metrics.forEach(m => {
    const el = document.getElementById('metric-' + m);
    if (el) el.style.display = visible[m] ? 'block' : 'none';
  });

  if (analyticsOrders.length === 0) return;

  if (visible.month) renderMonth();
  if (visible.week) renderWeek();
  if (visible.clients) renderClients();
  if (visible.flavors) renderFlavors();
  if (visible.paidstatus) renderPaidStatus();
  if (visible.timeline) renderTimeline();
}

function destroyChart(id) {
  if (analyticsCharts[id]) {
    analyticsCharts[id].destroy();
    analyticsCharts[id] = null;
  }
}

function renderMonth() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthOrders = analyticsOrders.filter(o => new Date(o.created_at) >= monthStart);
  const total = monthOrders.reduce((s, o) => s + o.total_cents, 0);

  document.getElementById('month-summary').innerHTML =
    '<div class="metric-block"><div class="metric-value">' + formatCents(total) + '</div><div class="metric-label">Total do mes</div></div>' +
    '<div class="metric-block"><div class="metric-value">' + monthOrders.length + '</div><div class="metric-label">Pedidos</div></div>';

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayData = {};
  for (let i = 1; i <= daysInMonth; i++) dayData[i] = 0;
  monthOrders.forEach(o => {
    const d = new Date(o.created_at);
    if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
      dayData[d.getDate()] = (dayData[d.getDate()] || 0) + o.total_cents;
    }
  });

  destroyChart('chart-month');
  analyticsCharts['chart-month'] = new Chart(document.getElementById('chart-month'), {
    type: 'bar',
    data: {
      labels: Object.keys(dayData),
      datasets: [{ label: 'Vendas (R$)', data: Object.values(dayData).map(v => v / 100), backgroundColor: '#e8a0bf', borderRadius: 6 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

function renderWeek() {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weekOrders = analyticsOrders.filter(o => new Date(o.created_at) >= weekStart);
  const total = weekOrders.reduce((s, o) => s + o.total_cents, 0);

  document.getElementById('week-summary').innerHTML =
    '<div class="metric-block"><div class="metric-value">' + formatCents(total) + '</div><div class="metric-label">Total da semana</div></div>' +
    '<div class="metric-block"><div class="metric-value">' + weekOrders.length + '</div><div class="metric-label">Pedidos</div></div>';

  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
  const dayTotals = [0, 0, 0, 0, 0, 0, 0];
  weekOrders.forEach(o => {
    const d = new Date(o.created_at).getDay();
    dayTotals[d] += o.total_cents;
  });

  destroyChart('chart-week');
  analyticsCharts['chart-week'] = new Chart(document.getElementById('chart-week'), {
    type: 'bar',
    data: {
      labels: days,
      datasets: [{ label: 'Vendas (R$)', data: dayTotals.map(v => v / 100), backgroundColor: '#81c784', borderRadius: 6 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

function renderClients() {
  const clients = {};
  analyticsOrders.forEach(o => {
    if (!clients[o.customer_name]) clients[o.customer_name] = { orders: 0, total: 0 };
    clients[o.customer_name].orders++;
    clients[o.customer_name].total += o.total_cents;
  });
  const sorted = Object.entries(clients).sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  let html = '<table class="clients-table"><thead><tr><th>Cliente</th><th>Pedidos</th><th>Total</th></tr></thead><tbody>';
  sorted.forEach(([name, data]) => {
    html += '<tr><td>' + name + '</td><td>' + data.orders + '</td><td>R$ ' + formatCents(data.total) + '</td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('clients-table').innerHTML = html;
}

function renderFlavors() {
  const flavors = {};
  analyticsOrders.forEach(o => {
    o.items.forEach(item => {
      if (!flavors[item.product_name]) flavors[item.product_name] = { qty: 0, revenue: 0 };
      flavors[item.product_name].qty += item.quantity;
      flavors[item.product_name].revenue += item.unit_price_cents * item.quantity;
    });
  });
  const labels = Object.keys(flavors);
  const qtyData = labels.map(l => flavors[l].qty);
  const revData = labels.map(l => flavors[l].revenue / 100);
  const colors = ['#e8a0bf', '#c9789e', '#81c784', '#66bb6a', '#ef5350', '#e57373', '#ffb74d', '#ff9800', '#64b5f6', '#42a5f5'];

  destroyChart('chart-flavors-qty');
  analyticsCharts['chart-flavors-qty'] = new Chart(document.getElementById('chart-flavors-qty'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: qtyData, backgroundColor: colors.slice(0, labels.length) }]
    },
    options: { responsive: true, plugins: { title: { display: true, text: 'Quantidade', font: { size: 14, weight: 'bold' } } } }
  });

  destroyChart('chart-flavors-revenue');
  analyticsCharts['chart-flavors-revenue'] = new Chart(document.getElementById('chart-flavors-revenue'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{ label: 'Receita (R$)', data: revData, backgroundColor: '#e8a0bf', borderRadius: 6 }]
    },
    options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false }, title: { display: true, text: 'Receita (R$)', font: { size: 14, weight: 'bold' } } }, scales: { x: { beginAtZero: true } } }
  });
}

function renderPaidStatus() {
  const paid = analyticsOrders.filter(o => o.paid).reduce((s, o) => s + o.total_cents, 0);
  const pending = analyticsOrders.filter(o => !o.paid).reduce((s, o) => s + o.total_cents, 0);

  document.getElementById('paid-summary').innerHTML =
    '<div class="metric-block"><div class="metric-value" style="color:#81c784">' + formatCents(paid) + '</div><div class="metric-label">Recebido</div></div>' +
    '<div class="metric-block"><div class="metric-value" style="color:#ef5350">' + formatCents(pending) + '</div><div class="metric-label">Pendente</div></div>';

  destroyChart('chart-paid');
  analyticsCharts['chart-paid'] = new Chart(document.getElementById('chart-paid'), {
    type: 'doughnut',
    data: {
      labels: ['Recebido', 'Pendente'],
      datasets: [{ data: [paid / 100, pending / 100], backgroundColor: ['#81c784', '#ef5350'] }]
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
  });
}

function renderTimeline() {
  const dayMap = {};
  analyticsOrders.forEach(o => {
    const d = new Date(o.created_at);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    dayMap[key] = (dayMap[key] || 0) + o.total_cents;
  });
  const sorted = Object.keys(dayMap).sort();
  const values = sorted.map(k => dayMap[k] / 100);

  destroyChart('chart-timeline');
  analyticsCharts['chart-timeline'] = new Chart(document.getElementById('chart-timeline'), {
    type: 'line',
    data: {
      labels: sorted,
      datasets: [{ label: 'Vendas (R$)', data: values, borderColor: '#e8a0bf', backgroundColor: 'rgba(232,160,191,0.1)', fill: true, tension: 0.3, pointRadius: 3 }]
    },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true }, x: { grid: { display: false } } } }
  });
}

// --- Init ---

document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('password').addEventListener('keypress', e => {
  if (e.key === 'Enter') login();
});

// Checa se ja tem sessao ativa
fetch('/api/summary').then(res => {
  if (res.ok) {
    isLoggedIn = true;
    showAdmin();
  } else {
    if (typeof hideLoading === 'function') hideLoading();
  }
}).catch(() => {
  if (typeof hideLoading === 'function') hideLoading();
});