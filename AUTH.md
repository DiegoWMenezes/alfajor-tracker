# Autenticacao de clientes — Alfajor Tracker

## O que foi implementado

- Compra como visitante continua funcionando normalmente (nome + pedido).
- Cliente pode criar conta com **e-mail e senha**.
- Cliente pode entrar com **Google**.
- E-mail cadastrado recebe **link de verificacao** antes do primeiro login.
- Cliente logado acessa **Minhas compras** pelo menu do perfil.
- Cada pedido recebe um **ID visivel** (`PED-...`).
- Cada item comprado recebe um **ID de sorteio** (`SORT-...`).
- O admin exporta todas as compras em **CSV**.
- O status do pedido (Pendente/Pago) aparece no cliente e atualiza via polling.

## Configuracao necessaria no Firebase Console

1. Acesse `https://console.firebase.google.com` e abra o projeto usado no app.
2. Em **Authentication > Sign-in method**, ative:
   - **E-mail/senha**
   - **Google**
3. Em **Authentication > Settings > Authorized domains**, adicione o dominio do app
   (ex.: `seu-app.onrender.com` ou `localhost` para testes).
4. Em **Project settings > General > Your apps**, adicione um app **Web**.
   Copie os valores da configuracao:
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

## Variaveis de ambiente

Adicione ao ambiente do servidor:

```env
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
```

O backend expoe esses valores publicos em `GET /api/firebase-config`.

## Teste local

```powershell
$env:FIREBASE_API_KEY="..."
$env:FIREBASE_AUTH_DOMAIN="..."
$env:FIREBASE_PROJECT_ID="..."
$env:FIREBASE_STORAGE_BUCKET="..."
$env:FIREBASE_MESSAGING_SENDER_ID="..."
$env:FIREBASE_APP_ID="..."
go run .
```

Para testar sem Firebase, o app continua em modo demo. O login de cliente
fica desabilitado e o aviso "Login nao configurado neste ambiente" aparece.

## Fluxo do cliente

1. A tela de pedido continua publica.
2. O botao "Entrar" abre o modal de autenticacao.
3. **Criar conta:** informa nome, e-mail e senha.
4. O Firebase envia um e-mail de verificacao.
5. Apos confirmar o link, o cliente faz login.
6. O menu de perfil mostra:
   - Perfil
   - Minhas compras
   - Sair
7. Em "Minhas compras", o cliente ve os pedidos, IDs de sorteio e o status.

## Exportacao do admin

- URL: `GET /api/export/orders` (requer login admin).
- Botao "Exportar CSV" no topo do painel admin.
- Colunas: Data, ID, Cliente, Produto, ID do item, Quantidade, Preco unitario, Total, Status.
