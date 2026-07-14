import json, requests, time
from google.oauth2 import service_account
from google.auth.transport.requests import Request

SCOPES = ["https://www.googleapis.com/auth/datastore"]
PROJECT = "alfajor-tracker"

# Carrega service account
with open("service-account.json") as f:
    sa_info = json.load(f)

creds = service_account.Credentials.from_service_account_info(sa_info, scopes=SCOPES)
creds.refresh(Request())
token = creds.token

print("Token obtido!")

# Firestore REST API base URL
base = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
}

# 1. Criar categorias
categories = ["Alfajor", "Cone"]
for cat in categories:
    # Verifica se ja existe
    r = requests.post(
        f"{base}/categories:runQuery",
        headers=headers,
        json={
            "structuredQuery": {
                "from": [{"collectionId": "categories"}],
                "where": {
                    "fieldFilter": {
                        "field": {"fieldPath": "name"},
                        "op": "EQUAL",
                        "value": {"stringValue": cat},
                    }
                },
                "limit": 1,
            }
        },
    )
    docs = r.json().get("document", []) if r.ok else []
    if r.ok and r.json():
        exists = any(
            d.get("document", {}).get("fields", {}).get("name", {}).get("stringValue") == cat
            for d in r.json()
            if "document" in d
        )
        if exists:
            print(f"Categoria ja existe: {cat}")
            continue

    # Cria
    r2 = requests.post(
        f"{base}/categories",
        headers=headers,
        json={"fields": {"name": {"stringValue": cat}}},
    )
    if r2.ok:
        print(f"Categoria criada: {cat}")
    else:
        print(f"Erro ao criar categoria {cat}: {r2.text}")

# 2. Buscar todos os produtos
r = requests.post(
    f"{base}/products:runQuery",
    headers=headers,
    json={
        "structuredQuery": {
            "from": [{"collectionId": "products"}],
        }
    },
)

if not r.ok:
    print(f"Erro ao buscar produtos: {r.text}")
    exit(1)

docs = r.json()
products = []
for item in docs:
    if "document" in item:
        doc = item["document"]
        name_doc = doc.get("name", "")
        doc_id = name_doc.split("/")[-1]
        fields = doc.get("fields", {})
        name = fields.get("name", {}).get("stringValue", "")
        category = fields.get("Category", {}).get("stringValue", "")
        products.append({"id": doc_id, "name": name, "category": category, "name_doc": name_doc})

print(f"\nProdutos encontrados: {len(products)}")

updated = 0
for p in products:
    if p["category"]:
        print(f"  Pulando {p['name']} — ja tem categoria: {p['category']}")
        continue

    name = p["name"]
    name_upper = name.upper()
    category = ""
    new_name = name

    if name_upper.startswith("ALFAJOR -"):
        category = "Alfajor"
        new_name = name[len("Alfajor -"):].strip() if name.startswith("Alfajor -") else name[len("ALFAJOR -"):].strip()
    elif name_upper.startswith("CONE "):
        category = "Cone"
        new_name = name[5:].strip()  # Remove "CONE " or "Cone "

    if not category:
        print(f"  Pulando {name} — categoria nao determinada")
        continue

    # Atualiza o documento
    update_data = {"fields": {}}
    # Preserva campos existentes
    r_get = requests.get(f"{base}/products/{p['id']}", headers=headers)
    if r_get.ok:
        existing = r_get.json().get("fields", {})
        for k, v in existing.items():
            update_data["fields"][k] = v

    update_data["fields"]["Category"] = {"stringValue": category}
    if new_name != name:
        update_data["fields"]["Name"] = {"stringValue": new_name}

    r_upd = requests.patch(
        f"{base}/products/{p['id']}?updateMask.fieldPaths=Category&updateMask.fieldPaths=Name",
        headers=headers,
        json=update_data,
    )

    if r_upd.ok:
        updated += 1
        if new_name != name:
            print(f"  {name} → [{category}] {new_name}")
        else:
            print(f"  {name} → [{category}]")
    else:
        print(f"  Erro ao atualizar {name}: {r_upd.text}")

print(f"\nProdutos atualizados: {updated}")
