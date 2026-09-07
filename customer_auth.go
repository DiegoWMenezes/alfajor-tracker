package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"

	"firebase.google.com/go/v4/auth"
)

var fbAuthClient *auth.Client

func initFirebaseAuth() error {
	if fbApp == nil {
		return fmt.Errorf("firebase nao configurado")
	}

	client, err := fbApp.Auth(context.Background())
	if err != nil {
		return err
	}

	fbAuthClient = client
	return nil
}

type firebaseTokenRequest struct {
	IDToken string `json:"id_token"`
}

func handleFirebaseSession(w http.ResponseWriter, r *http.Request) {
	if fbAuthClient == nil {
		http.Error(w, "Autenticacao nao configurada", http.StatusServiceUnavailable)
		return
	}

	var req firebaseTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IDToken == "" {
		http.Error(w, "id_token obrigatorio", http.StatusBadRequest)
		return
	}

	token, err := fbAuthClient.VerifyIDToken(r.Context(), req.IDToken)
	if err != nil {
		http.Error(w, "Token invalido ou expirado", http.StatusUnauthorized)
		return
	}

	email, _ := token.Claims["email"].(string)
	emailVerified, _ := token.Claims["email_verified"].(bool)

	// Contas Google costumam vir verificadas. Para email/senha, exigimos a
	// verificacao antes de abrir uma sessao de cliente.
	if email != "" && !emailVerified {
		http.Error(w, "Confirme seu e-mail antes de continuar", http.StatusForbidden)
		return
	}

	cookieToken, err := createSessionToken("customer", token.UID, email)
	if err != nil {
		http.Error(w, "Erro ao criar sessao", http.StatusInternalServerError)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:     "customer_session",
		Value:    cookieToken,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   30 * 24 * 60 * 60,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"status": "ok",
		"uid":    token.UID,
		"email":  email,
	})
}

func handleCustomerLogout(w http.ResponseWriter, r *http.Request) {
	http.SetCookie(w, &http.Cookie{
		Name:   "customer_session",
		Value:  "",
		Path:   "/",
		MaxAge: -1,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims, ok := validateCustomerSession(r)
	if !ok {
		json.NewEncoder(w).Encode(map[string]any{"logged_in": false})
		return
	}

	json.NewEncoder(w).Encode(map[string]any{
		"logged_in": true,
		"uid":       claims.Subject,
		"email":     claims.Email,
	})
}

func handleMyOrders(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims, ok := validateCustomerSession(r)
	if !ok {
		http.Error(w, "Nao autorizado", http.StatusUnauthorized)
		return
	}

	if fsClient == nil {
		// Modo demo: sem vinculo por uid, retorna tudo para desenvolvimento.
		json.NewEncoder(w).Encode(memStore.GetOrders(""))
		return
	}

	iter := fsClient.Collection("orders").
		Where("CustomerUID", "==", claims.Subject).
		Documents(r.Context())
	docs, err := iter.GetAll()
	if err != nil {
		http.Error(w, "Erro ao buscar pedidos", http.StatusInternalServerError)
		return
	}

	orders := make([]Order, 0, len(docs))
	for _, doc := range docs {
		var order Order
		if err := doc.DataTo(&order); err != nil {
			continue
		}
		order.ID = doc.Ref.ID
		orders = append(orders, order)
	}

	sort.Slice(orders, func(i, j int) bool {
		return orders[i].CreatedAt.After(orders[j].CreatedAt)
	})

	json.NewEncoder(w).Encode(orders)
}

func customerClaimsFromRequest(r *http.Request) (*sessionClaims, bool) {
	return validateCustomerSession(r)
}
