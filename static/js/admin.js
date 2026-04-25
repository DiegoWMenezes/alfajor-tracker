let currentFilter = 'all';
let isLoggedIn = false;

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
  let url = '/api/orders';
  if (currentFilter !== 'all') {
    url += `?paid=${currentFilter}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Unauthorized');
    const orders = await res.json();

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
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Erro ao carregar pedidos</p></div>';
  }
}

async function markPaid(id) {
  try {
    const res = await fetch(`/api/orders/${id}/pay`, { method: 'PATCH' });
    if (res.ok) {
      loadOrders();
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
      loadOrders();
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
      loadOrders();
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
  loadOrders();
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