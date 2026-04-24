let products = [];
let cart = {};

async function loadProducts() {
  const list = document.getElementById('product-list');
  try {
    const res = await fetch('/api/products');
    products = await res.json();

    if (products.length === 0) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">&#127856;</div><p>Nenhum sabor disponivel no momento</p></div>';
      return;
    }

    list.innerHTML = '';
    products.forEach(p => {
      cart[p.id] = 0;
      const item = document.createElement('div');
      item.className = 'product-item';
      item.id = `product-${p.id}`;
      item.innerHTML = `
        <div class="product-info">
          <span class="product-name">${p.name}</span>
          <span class="product-price">R$ ${formatCents(p.price_cents)}</span>
        </div>
        <div class="qty-control">
          <button class="qty-btn minus" onclick="changeQty('${p.id}', -1)">-</button>
          <span class="qty-value" id="qty-${p.id}">0</span>
          <button class="qty-btn" onclick="changeQty('${p.id}', 1)">+</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Erro ao carregar sabores</p></div>';
  }
}

function changeQty(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  const qtyEl = document.getElementById(`qty-${id}`);
  const itemEl = document.getElementById(`product-${id}`);
  qtyEl.textContent = cart[id];
  itemEl.classList.toggle('selected', cart[id] > 0);
  updateSummary();
}

function updateSummary() {
  const summaryCard = document.getElementById('summary-card');
  const summaryItems = document.getElementById('summary-items');
  const summaryTotal = document.getElementById('summary-total');
  const submitBtn = document.getElementById('submit-btn');

  const selectedItems = products.filter(p => cart[p.id] > 0);
  if (selectedItems.length === 0) {
    summaryCard.style.display = 'none';
    submitBtn.disabled = true;
    return;
  }

  summaryCard.style.display = 'block';
  submitBtn.disabled = false;

  let total = 0;
  let html = '';
  selectedItems.forEach(p => {
    const qty = cart[p.id];
    const subtotal = p.price_cents * qty;
    total += subtotal;
    html += `<div class="summary-row">
      <span>${p.name} x${qty}</span>
      <span class="price">R$ ${formatCents(subtotal)}</span>
    </div>`;
  });
  summaryItems.innerHTML = html;
  summaryTotal.textContent = `R$ ${formatCents(total)}`;
}

async function submitOrder() {
  const name = document.getElementById('name').value.trim();
  if (!name) {
    alert('Por favor, informe seu nome');
    return;
  }

  const items = products
    .filter(p => cart[p.id] > 0)
    .map(p => ({
      product_name: p.name,
      quantity: cart[p.id],
      unit_price_cents: p.price_cents
    }));

  if (items.length === 0) {
    alert('Selecione ao menos um sabor');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_name: name, items })
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Erro ao criar pedido');
    }

    const order = await res.json();
    showSuccess(name, items);
  } catch (e) {
    alert('Erro ao enviar pedido: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Confirmar Pedido';
  }
}

function showSuccess(name, items) {
  document.getElementById('order-form').style.display = 'none';
  document.getElementById('success-screen').style.display = 'block';
  document.getElementById('success-name').textContent = `${name}, seu pedido foi anotado!`;

  let total = 0;
  let html = '<div class="product-list">';
  items.forEach(item => {
    const subtotal = item.unit_price_cents * item.quantity;
    total += subtotal;
    html += `<div class="summary-row">
      <span>${item.product_name} x${item.quantity}</span>
      <span class="price">R$ ${formatCents(subtotal)}</span>
    </div>`;
  });
  html += '</div>';
  document.getElementById('success-items').innerHTML = html;
  document.getElementById('success-total').textContent = `Total: R$ ${formatCents(total)}`;
}

function newOrder() {
  cart = {};
  document.getElementById('name').value = '';
  document.getElementById('order-form').style.display = 'block';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('summary-card').style.display = 'none';
  loadProducts();
}

function formatCents(cents) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

document.getElementById('submit-btn').addEventListener('click', submitOrder);
loadProducts();