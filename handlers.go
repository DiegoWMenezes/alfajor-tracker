package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"cloud.google.com/go/firestore"
)

// --- Auth ---

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON invalido", http.StatusBadRequest)
		return
	}

	if !checkAdminPassword(req.Password) {
		http.Error(w, "Senha incorreta", http.StatusUnauthorized)
		return
	}

	token, err := createSessionToken()
	if err != nil {
		http.Error(w, "Erro ao criar sessao", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   86400,
	})

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:   "session",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// --- Products ---

func handleGetProducts(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if fsClient == nil {
		json.NewEncoder(w).Encode(memStore.GetActiveProducts())
		return
	}

	iter := fsClient.Collection("products").Where("Active", "==", true).Documents(ctx)
	docs, err := iter.GetAll()
	if err != nil {
		http.Error(w, "Erro ao buscar produtos", http.StatusInternalServerError)
		return
	}

	products := make([]Product, 0, len(docs))
	for _, doc := range docs {
		var p Product
		if err := doc.DataTo(&p); err != nil {
			log.Printf("ERRO: Falha ao deserializar produto %s: %v", doc.Ref.ID, err)
			continue
		}
		p.ID = doc.Ref.ID
		products = append(products, p)
	}
	json.NewEncoder(w).Encode(products)
}

func handleCreateProduct(w http.ResponseWriter, r *http.Request) {
	var req ProductRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON invalido", http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, "Nome e obrigatorio", http.StatusBadRequest)
		return
	}
	if req.PriceCents <= 0 {
		http.Error(w, "Preco deve ser positivo", http.StatusBadRequest)
		return
	}

	active := true
	if req.Active != nil {
		active = *req.Active
	}

	p := Product{
		Name:       req.Name,
		PriceCents: req.PriceCents,
		Active:     active,
		CreatedAt:  time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")

	if fsClient == nil {
		p = memStore.AddProduct(p)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(p)
		return
	}

	docRef, _, err := fsClient.Collection("products").Add(ctx, p)
	if err != nil {
		http.Error(w, "Erro ao criar produto", http.StatusInternalServerError)
		return
	}

	p.ID = docRef.ID
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(p)
}

func handleDeleteProduct(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatorio", http.StatusBadRequest)
		return
	}

	if fsClient == nil {
		memStore.DeactivateProduct(id)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	_, err := fsClient.Collection("products").Doc(id).Update(ctx, []firestore.Update{
		{Path: "Active", Value: false},
	})
	if err != nil {
		http.Error(w, "Erro ao desativar produto", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// --- Orders ---

func handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	var req OrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON invalido", http.StatusBadRequest)
		return
	}

	if req.CustomerName == "" {
		http.Error(w, "Nome e obrigatorio", http.StatusBadRequest)
		return
	}
	if len(req.Items) == 0 {
		http.Error(w, "Selecione ao menos um item", http.StatusBadRequest)
		return
	}

	total := 0
	for i, item := range req.Items {
		if item.Quantity <= 0 {
			http.Error(w, fmt.Sprintf("Quantidade invalida para %s", item.ProductName), http.StatusBadRequest)
			return
		}
		if item.UnitPriceCents <= 0 {
			if fsClient != nil {
				price, err := getProductPrice(item.ProductName)
				if err != nil {
					http.Error(w, fmt.Sprintf("Produto %s nao encontrado", item.ProductName), http.StatusBadRequest)
					return
				}
				req.Items[i].UnitPriceCents = price
				item.UnitPriceCents = price
			} else {
				price, ok := memStore.GetProductPrice(item.ProductName)
				if !ok {
					http.Error(w, fmt.Sprintf("Produto %s nao encontrado", item.ProductName), http.StatusBadRequest)
					return
				}
				req.Items[i].UnitPriceCents = price
				item.UnitPriceCents = price
			}
		}
		total += item.UnitPriceCents * item.Quantity
	}

	order := Order{
		CustomerName: req.CustomerName,
		Items:        req.Items,
		TotalCents:   total,
		Paid:         false,
		CreatedAt:    time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")

	if fsClient == nil {
		order = memStore.AddOrder(order)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(order)
		return
	}

	docRef, _, err := fsClient.Collection("orders").Add(ctx, order)
	if err != nil {
		http.Error(w, "Erro ao criar pedido", http.StatusInternalServerError)
		return
	}

	order.ID = docRef.ID
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(order)
}

func handleGetOrders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	filterPaid := r.URL.Query().Get("paid")

	if fsClient == nil {
		json.NewEncoder(w).Encode(memStore.GetOrders(filterPaid))
		return
	}

	iter := fsClient.Collection("orders").OrderBy("CreatedAt", firestore.Desc).Documents(ctx)
	docs, err := iter.GetAll()
	if err != nil {
		http.Error(w, "Erro ao buscar pedidos", http.StatusInternalServerError)
		return
	}

	orders := make([]Order, 0, len(docs))
	for _, doc := range docs {
		var o Order
		if err := doc.DataTo(&o); err != nil {
			log.Printf("ERRO: Falha ao deserializar pedido %s: %v", doc.Ref.ID, err)
			continue
		}
		o.ID = doc.Ref.ID

		if filterPaid == "true" && !o.Paid {
			continue
		}
		if filterPaid == "false" && o.Paid {
			continue
		}

		orders = append(orders, o)
	}
	json.NewEncoder(w).Encode(orders)
}

func handleMarkPaid(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatorio", http.StatusBadRequest)
		return
	}

	if fsClient == nil {
		memStore.MarkPaid(id)
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
		return
	}

	_, err := fsClient.Collection("orders").Doc(id).Update(ctx, []firestore.Update{
		{Path: "Paid", Value: true},
	})
	if err != nil {
		http.Error(w, "Erro ao atualizar pedido", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleDeleteOrder(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatorio", http.StatusBadRequest)
		return
	}

	if fsClient == nil {
		if !memStore.DeleteOrder(id) {
			http.Error(w, "Pedido nao encontrado", http.StatusNotFound)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	_, err := fsClient.Collection("orders").Doc(id).Delete(ctx)
	if err != nil {
		http.Error(w, "Erro ao excluir pedido", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func handleRemoveOrderItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatorio", http.StatusBadRequest)
		return
	}

	var req struct {
		ProductName string `json:"product_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ProductName == "" {
		http.Error(w, "product_name obrigatorio", http.StatusBadRequest)
		return
	}

	if fsClient == nil {
		order, ok := memStore.RemoveOrderItem(id, req.ProductName)
		if !ok {
			http.Error(w, "Pedido nao encontrado ou item nao existe", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(order)
		return
	}

	doc, err := fsClient.Collection("orders").Doc(id).Get(ctx)
	if err != nil {
		http.Error(w, "Pedido nao encontrado", http.StatusNotFound)
		return
	}

	var order Order
	if err := doc.DataTo(&order); err != nil {
		log.Printf("ERRO: Falha ao deserializar pedido %s: %v", id, err)
		http.Error(w, "Erro ao ler pedido", http.StatusInternalServerError)
		return
	}
	order.ID = doc.Ref.ID

	filtered := make([]OrderItem, 0, len(order.Items))
	for _, item := range order.Items {
		if item.ProductName != req.ProductName {
			filtered = append(filtered, item)
		}
	}

	if len(filtered) == 0 {
		fsClient.Collection("orders").Doc(id).Delete(ctx)
		w.WriteHeader(http.StatusNoContent)
		return
	}

	total := 0
	for _, item := range filtered {
		total += item.UnitPriceCents * item.Quantity
	}

	_, err = fsClient.Collection("orders").Doc(id).Update(ctx, []firestore.Update{
		{Path: "Items", Value: filtered},
		{Path: "TotalCents", Value: total},
	})
	if err != nil {
		http.Error(w, "Erro ao atualizar pedido", http.StatusInternalServerError)
		return
	}

	order.Items = filtered
	order.TotalCents = total
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(order)
}

func handleSummary(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if fsClient == nil {
		json.NewEncoder(w).Encode(memStore.GetSummary())
		return
	}

	iter := fsClient.Collection("orders").Documents(ctx)
	docs, err := iter.GetAll()
	if err != nil {
		http.Error(w, "Erro ao buscar resumo", http.StatusInternalServerError)
		return
	}

	s := Summary{}
	for _, doc := range docs {
		var o Order
		if err := doc.DataTo(&o); err != nil {
			log.Printf("ERRO: Falha ao deserializar pedido no resumo %s: %v", doc.Ref.ID, err)
			continue
		}
		s.TotalOrders++
		s.TotalSoldCents += o.TotalCents
		if o.Paid {
			s.TotalPaidCents += o.TotalCents
		} else {
			s.TotalPendingCents += o.TotalCents
		}
	}
	json.NewEncoder(w).Encode(s)
}

// --- Helpers ---

func getProductPrice(productName string) (int, error) {
	iter := fsClient.Collection("products").
		Where("Name", "==", productName).
		Where("Active", "==", true).
		Limit(1).
		Documents(ctx)
	docs, err := iter.GetAll()
	if err != nil || len(docs) == 0 {
		return 0, fmt.Errorf("produto %s nao encontrado", productName)
	}
	var p Product
	docs[0].DataTo(&p)
	return p.PriceCents, nil
}