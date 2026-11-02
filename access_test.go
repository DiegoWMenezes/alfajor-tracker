package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRoleForPassword(t *testing.T) {
	adminHash, err := hashPassword("admin-secret")
	if err != nil {
		t.Fatal(err)
	}
	paymentsHash, err := hashPassword("payments-secret")
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("ADMIN_PASSWORD_HASH", adminHash)
	t.Setenv("PAYMENTS_PASSWORD_HASH", paymentsHash)

	if got := roleForPassword("admin-secret"); got != "admin" {
		t.Fatalf("roleForPassword(admin) = %q, want admin", got)
	}
	if got := roleForPassword("payments-secret"); got != "payments" {
		t.Fatalf("roleForPassword(payments) = %q, want payments", got)
	}
	if got := roleForPassword("wrong"); got != "" {
		t.Fatalf("roleForPassword(wrong) = %q, want empty", got)
	}
}

func TestPaymentsSessionOnlyListsPendingOrders(t *testing.T) {
	previousStore := memStore
	previousFirestore := fsClient
	memStore = &MemStore{orders: []Order{
		{ID: "pending", Paid: false},
		{ID: "paid", Paid: true},
	}}
	fsClient = nil
	t.Cleanup(func() {
		memStore = previousStore
		fsClient = previousFirestore
	})

	token, err := createSessionToken("payments", "", "")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest("GET", "/api/orders?paid=true", nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: token})
	response := httptest.NewRecorder()
	requireOrdersAccess(handleGetOrders).ServeHTTP(response, req)
	if response.Code != 200 {
		t.Fatalf("GET orders status = %d, want 200", response.Code)
	}

	var orders []Order
	if err := json.Unmarshal(response.Body.Bytes(), &orders); err != nil {
		t.Fatal(err)
	}
	if len(orders) != 1 || orders[0].ID != "pending" {
		t.Fatalf("payments session got orders %#v, want only pending", orders)
	}
}

func TestMarkPendingPaidManyIsAtomic(t *testing.T) {
	store := &MemStore{orders: []Order{
		{ID: "pending", Paid: false},
		{ID: "paid", Paid: true},
	}}
	if store.MarkPendingPaidMany([]string{"pending", "paid"}) {
		t.Fatal("expected a batch containing an already-paid order to fail")
	}
	if order, _ := store.GetOrder("pending"); order.Paid {
		t.Fatal("pending order changed even though the batch failed")
	}
	if !store.MarkPendingPaidMany([]string{"pending"}) {
		t.Fatal("expected pending order batch to succeed")
	}
	if order, _ := store.GetOrder("pending"); !order.Paid {
		t.Fatal("pending order was not marked paid")
	}
}
