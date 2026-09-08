let products = [];
let cart = {};
let firebaseReady = false;
let authUser = null;
let ordersPollTimer = null;

// ---------- Firebase ----------

async function initFirebase() {
  try {
    const res = await fetch('/api/firebase-config');
    const config = await res.json();

    if (!config.apiKey || !config.projectId || !config.appId || typeof firebase === 'undefined') {
      firebaseReady = false;
      return;
    }

    firebase.initializeApp(config);
    firebaseReady = true;

    firebase.auth().onAuthStateChanged(async (user) => {
      authUser = user;
      if (user) {
        await syncAuthSession(user);
      }
      updateAccountUI();
    });
  } catch (e) {
    firebaseReady = false;
  }
}

// ---------- Auth UI ----------

function toggleAccountMenu() {
  const currentUser = (firebaseReady && firebase.auth().currentUser) || authUser;
  if (!currentUser) {
    openAuthModal('login');
    return;
  }
  authUser = currentUser;
  updateAccountUI();
  const menu = document.getElementById('account-menu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function closeAccountMenu() {
  document.getElementById('account-menu').style.display = 'none';
}

function openAuthModal(tab) {
  switchAuthTab(tab);
  document.getElementById('auth-modal').style.display = 'flex';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-note').style.display = 'none';
}

function closeAuthModal() {
  document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(tab) {
  const isRegister = tab === 'register';
  document.getElementById('tab-login').classList.toggle('active', !isRegister);
  document.getElementById('tab-register').classList.toggle('active', isRegister);
  document.getElementById('auth-title').textContent = isRegister ? 'Criar conta' : 'Entrar';
  document.getElementById('auth-submit').textContent = isRegister ? 'Criar conta' : 'Entrar';
  document.getElementById('auth-name-group').style.display = isRegister ? 'block' : 'none';
  document.getElementById('auth-confirm-group').style.display = isRegister ? 'block' : 'none';
  document.getElementById('auth-password').autocomplete = isRegister ? 'new-password' : 'current-password';
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('auth-note').style.display = 'none';
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.style.display = 'block';
}

function showAuthNote(message) {
  const el = document.getElementById('auth-note');
  el.textContent = message;
  el.style.display = 'block';
}

async function submitAuthForm(event) {
  event.preventDefault();
  if (!firebaseReady) {
    showAuthError('Login nao configurado neste ambiente.');
    return false;
  }

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const isRegister = document.getElementById('tab-register').classList.contains('active');
  const btn = document.getElementById('auth-submit');
  btn.disabled = true;

  try {
    if (isRegister) {
      const confirm = document.getElementById('auth-confirm').value;
      const name = document.getElementById('auth-name').value.trim();
      if (password !== confirm) {
        showAuthError('As senhas nao coincidem.');
        btn.disabled = false;
        return false;
      }
      const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
      if (name) {
        await cred.user.updateProfile({ displayName: name });
      }
      await cred.user.sendEmailVerification();
      showAuthNote('Conta criada. Enviamos um link de verificacao para seu e-mail. Confirme antes de entrar.');
      btn.disabled = false;
      return false;
    }

    const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
    if (!cred.user.emailVerified) {
      showAuthError('Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.');
      btn.disabled = false;
      return false;
    }
    await exchangeFirebaseToken(cred.user);
    closeAuthModal();
  } catch (e) {
    showAuthError(firebaseErrorMessage(e));
  }

  btn.disabled = false;
  return false;
}

async function loginWithGoogle() {
  if (!firebaseReady) {
    showAuthError('Login nao configurado neste ambiente.');
    return;
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await firebase.auth().signInWithPopup(provider);
    await exchangeFirebaseToken(result.user);
    closeAuthModal();
  } catch (e) {
    if (e.code !== 'auth/popup-blocked') {
      showAuthError(firebaseErrorMessage(e));
    }
  }
}

async function exchangeFirebaseToken(user) {
  const token = await user.getIdToken();
  const res = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_token: token })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Erro ao abrir sessao');
  }
}

async function syncAuthSession(user) {
  try {
    await exchangeFirebaseToken(user);
  } catch (e) {
    // Se o backend recusar (ex.: e-mail nao verificado), desloga no cliente.
    if (firebaseReady) {
      await firebase.auth().signOut().catch(() => {});
    }
    authUser = null;
  }
  updateAccountUI();
}

async function logoutCustomer() {
  closeAccountMenu();
  if (firebaseReady && authUser) {
    await firebase.auth().signOut();
  }
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  authUser = null;
  stopOrdersPolling();
  updateAccountUI();
  showOrderForm();
}

function updateAccountUI() {
  const label = document.getElementById('account-btn');
  const avatar = document.getElementById('account-avatar');
  if (authUser) {
    const name = authUser.displayName || authUser.email || 'Minha conta';
    label.textContent = name.split(' ')[0] || 'Minha conta';
    if (authUser.photoURL) {
      avatar.innerHTML = '<img src="' + authUser.photoURL + '" alt="Foto do perfil">';
    } else {
      avatar.innerHTML = '👤';
    }
  } else {
    label.textContent = 'Entrar';
    avatar.innerHTML = '👤';
  }
  updateOrderIdentityUI();
}

function updateOrderIdentityUI() {
  const card = document.getElementById('guest-name-card');
  if (!card) return;
  card.style.display = authUser ? 'none' : 'block';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('alfajor-theme', next);
  applyTheme(next);
}

function firebaseErrorMessage(e) {
  if (e && e.code === 'auth/email-already-in-use') return 'Este e-mail ja esta cadastrado.';
  if (e && e.code === 'auth/invalid-email') return 'E-mail invalido.';
  if (e && e.code === 'auth/user-not-found') return 'Nenhuma conta encontrada com este e-mail.';
  if (e && e.code === 'auth/wrong-password') return 'Senha incorreta.';
  if (e && e.code === 'auth/weak-password') return 'A senha deve ter pelo menos 6 caracteres.';
  if (e && e.message) return e.message;
  return 'Erro ao autenticar.';
}

// ---------- Navegacao ----------

function showOrderForm() {
  document.getElementById('order-form').style.display = 'block';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('account-view').style.display = 'none';
  document.getElementById('my-orders-view').style.display = 'none';
  stopOrdersPolling();
}

function showAccount() {
  closeAccountMenu();
  document.getElementById('order-form').style.display = 'none';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('account-view').style.display = 'block';
  document.getElementById('my-orders-view').style.display = 'none';
  document.getElementById('profile-email').textContent = authUser ? (authUser.email || '-') : '-';
  stopOrdersPolling();
}

function showMyOrders() {
  closeAccountMenu();
  document.getElementById('order-form').style.display = 'none';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('account-view').style.display = 'none';
  document.getElementById('my-orders-view').style.display = 'block';
  loadMyOrders();
  stopOrdersPolling();
  ordersPollTimer = setInterval(loadMyOrders, 10000);
}

function stopOrdersPolling() {
  if (ordersPollTimer) {
    clearInterval(ordersPollTimer);
    ordersPollTimer = null;
  }
}

async function loadMyOrders() {
  const list = document.getElementById('my-orders-list');
  try {
    const res = await fetch('/api/my/orders');
    if (!res.ok) throw new Error('unauthorized');
    const orders = await res.json();

    if (!orders.length) {
      list.innerHTML = '<div class="empty-state"><p>Voce ainda nao tem compras registradas.</p></div>';
      return;
    }

    list.innerHTML = '';
    orders.forEach((order) => {
      const card = document.createElement('div');
      card.className = 'order-card my-order-card';
      const time = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : '';
      const statusClass = order.paid ? 'badge-paid' : 'badge-pending';
      const statusText = order.paid ? 'Pago' : 'Pendente';

      const items = order.items.map((item) => {
        return '<div class="my-order-item">' +
          '<span>' + item.product_name + ' x' + item.quantity + '</span>' +
          '<span class="sorteio-code">ID ' + (item.code || '-') + '</span>' +
        '</div>';
      }).join('');

      card.innerHTML = '<div class="order-header">' +
        '<span class="order-name">Pedido ' + (order.order_code || order.id || '-') + '</span>' +
        '<span class="order-time">' + time + '</span>' +
      '</div>' +
      '<div class="order-items">' + items + '</div>' +
      '<div class="order-footer">' +
        '<span class="order-total">R$ ' + formatCents(order.total_cents || 0) + '</span>' +
        '<span class="badge ' + statusClass + '">' + statusText + '</span>' +
      '</div>';

      list.appendChild(card);
    });
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Entre na sua conta para ver suas compras.</p></div>';
  }
}

// ---------- Produtos e pedido ----------

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
    products.forEach((p) => {
      cart[p.id] = 0;
    });

    const categories = {};
    products.forEach((p) => {
      if (!categories[p.category]) categories[p.category] = [];
      categories[p.category].push(p);
    });

    Object.keys(categories).forEach((catName) => {
      const section = document.createElement('div');
      section.className = 'category-section';
      const title = document.createElement('h3');
      title.className = 'category-title';
      title.textContent = catName;
      section.appendChild(title);

      const itemsWrapper = document.createElement('div');
      itemsWrapper.className = 'product-list';

      categories[catName].forEach((p) => {
        const item = document.createElement('div');
        item.className = 'product-item';
        item.id = 'product-' + p.id;
        item.innerHTML = '<div class="product-info">' +
          '<span class="product-name">' + p.name + '</span>' +
          '<span class="product-price">R$ ' + formatCents(p.price_cents) + '</span>' +
        '</div>' +
        '<div class="qty-control">' +
          '<button class="qty-btn minus" onclick="changeQty(\'' + p.id + '\', -1)">-</button>' +
          '<span class="qty-value" id="qty-' + p.id + '">0</span>' +
          '<button class="qty-btn" onclick="changeQty(\'' + p.id + '\', 1)">+</button>' +
        '</div>';
        itemsWrapper.appendChild(item);
      });

      section.appendChild(itemsWrapper);
      list.appendChild(section);
    });
  } catch (e) {
    list.innerHTML = '<div class="empty-state"><p>Erro ao carregar sabores</p></div>';
  }

  if (typeof hideLoading === 'function') hideLoading();
}

function changeQty(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  document.getElementById('qty-' + id).textContent = cart[id];
  document.getElementById('product-' + id).classList.toggle('selected', cart[id] > 0);
  updateSummary();
}

function updateSummary() {
  const summaryCard = document.getElementById('summary-card');
  const summaryItems = document.getElementById('summary-items');
  const summaryTotal = document.getElementById('summary-total');
  const submitBtn = document.getElementById('submit-btn');

  const selectedItems = products.filter((p) => cart[p.id] > 0);
  if (selectedItems.length === 0) {
    summaryCard.style.display = 'none';
    submitBtn.disabled = true;
    return;
  }

  summaryCard.style.display = 'block';
  submitBtn.disabled = false;

  let total = 0;
  let html = '';
  selectedItems.forEach((p) => {
    const qty = cart[p.id];
    const subtotal = p.price_cents * qty;
    total += subtotal;
    html += '<div class="summary-row"><span>' + p.name + ' x' + qty + '</span><span class="price">R$ ' + formatCents(subtotal) + '</span></div>';
  });
  summaryItems.innerHTML = html;
  summaryTotal.textContent = 'R$ ' + formatCents(total);
}

async function submitOrder() {
  const name = authUser
    ? (authUser.displayName || authUser.email || '').trim()
    : document.getElementById('name').value.trim();
  if (!name) {
    alert('Por favor, informe seu nome');
    return;
  }

  const items = products
    .filter((p) => cart[p.id] > 0)
    .map((p) => ({
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
      const text = await res.text();
      throw new Error(text || 'Erro ao criar pedido');
    }

    const order = await res.json();
    showSuccess(order);
  } catch (e) {
    alert('Erro ao enviar pedido: ' + e.message);
    btn.disabled = false;
    btn.textContent = 'Confirmar Pedido';
  }
}

function showSuccess(order) {
  document.getElementById('order-form').style.display = 'none';
  document.getElementById('success-screen').style.display = 'block';
  document.getElementById('success-name').textContent = (order.customer_name || '') + ', seu pedido foi anotado!';

  let html = '<div class="success-codes">' +
    '<div>ID do pedido: <strong>' + (order.order_code || order.id || '-') + '</strong></div>';

  order.items.forEach((item) => {
    html += '<div>' + item.product_name + ' — ID do sorteio: <strong>' + (item.code || '-') + '</strong></div>';
  });
  html += '</div>';
  document.getElementById('success-codes').innerHTML = html;

  let itemsHtml = '<div class="product-list">';
  order.items.forEach((item) => {
    const subtotal = item.unit_price_cents * item.quantity;
    itemsHtml += '<div class="summary-row"><span>' + item.product_name + ' x' + item.quantity + '</span><span class="price">R$ ' + formatCents(subtotal) + '</span></div>';
  });
  itemsHtml += '</div>';
  document.getElementById('success-items').innerHTML = itemsHtml;
  document.getElementById('success-total').textContent = 'Total: R$ ' + formatCents(order.total_cents);

  if (order.id) {
    fetch('/api/orders/' + order.id + '/pix')
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data && data.pix) {
          document.getElementById('pix-section').style.display = 'block';
          document.getElementById('pix-value').textContent = data.value;
          document.getElementById('pix-code').textContent = data.pix;
        }
      })
      .catch(() => {});
  }
}

function copyPix() {
  const code = document.getElementById('pix-code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.pix-copy-btn');
    btn.textContent = 'Copiado!';
    setTimeout(() => { btn.textContent = 'Copiar'; }, 2000);
  });
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

// ---------- Init ----------

document.addEventListener('click', (e) => {
  if (!e.target.closest('#account-menu') && !e.target.closest('#account-btn')) {
    closeAccountMenu();
  }
});

document.getElementById('submit-btn').addEventListener('click', submitOrder);
applyTheme(localStorage.getItem('alfajor-theme') || 'light');
initFirebase();
loadProducts();
