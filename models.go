package main

import "time"

type Product struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	PriceCents int       `json:"price_cents"`
	Active    bool      `json:"active"`
	CreatedAt  time.Time `json:"created_at"`
}

type OrderItem struct {
	ProductName string `json:"product_name"`
	Quantity    int    `json:"quantity"`
	UnitPriceCents int `json:"unit_price_cents"`
}

type Order struct {
	ID           string      `json:"id"`
	CustomerName string      `json:"customer_name"`
	Items        []OrderItem `json:"items"`
	TotalCents   int         `json:"total_cents"`
	Paid         bool        `json:"paid"`
	CreatedAt    time.Time   `json:"created_at"`
}

type LoginRequest struct {
	Password string `json:"password"`
}

type ProductRequest struct {
	Name       string `json:"name"`
	PriceCents int    `json:"price_cents"`
	Active     *bool  `json:"active,omitempty"`
}

type OrderRequest struct {
	CustomerName string      `json:"customer_name"`
	Items        []OrderItem `json:"items"`
}

type Summary struct {
	TotalOrders   int `json:"total_orders"`
	TotalSoldCents int `json:"total_sold_cents"`
	TotalPaidCents int `json:"total_paid_cents"`
	TotalPendingCents int `json:"total_pending_cents"`
}