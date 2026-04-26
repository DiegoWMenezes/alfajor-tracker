package main

import (
	"fmt"
	"sync"
	"time"
)

type MemStore struct {
	mu       sync.RWMutex
	products []Product
	orders   []Order
	nextID   int
}

var memStore *MemStore

func initMemStore() {
	memStore = &MemStore{
		products: []Product{
			{ID: "1", Name: "Ninho", PriceCents: 600, Active: true},
			{ID: "2", Name: "Avela", PriceCents: 600, Active: true},
			{ID: "3", Name: "Amendoim", PriceCents: 600, Active: true},
			{ID: "4", Name: "Cookie", PriceCents: 600, Active: true},
			{ID: "5", Name: "Ovomaltine", PriceCents: 600, Active: true},
			{ID: "6", Name: "Kinder", PriceCents: 600, Active: true},
			{ID: "7", Name: "Pistache", PriceCents: 600, Active: true},
			{ID: "8", Name: "Morango", PriceCents: 600, Active: true},
			{ID: "9", Name: "Doce de Leite", PriceCents: 600, Active: true},
		},
		nextID: 10,
	}
}

func (m *MemStore) genID() string {
	m.nextID++
	return fmt.Sprintf("%d", m.nextID)
}

func (m *MemStore) GetActiveProducts() []Product {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]Product, 0)
	for _, p := range m.products {
		if p.Active {
			result = append(result, p)
		}
	}
	return result
}

func (m *MemStore) AddProduct(p Product) Product {
	m.mu.Lock()
	defer m.mu.Unlock()
	p.ID = m.genID()
	p.CreatedAt = time.Now()
	m.products = append(m.products, p)
	return p
}

func (m *MemStore) DeactivateProduct(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, p := range m.products {
		if p.ID == id {
			m.products[i].Active = false
			return true
		}
	}
	return false
}

func (m *MemStore) GetProductPrice(name string) (int, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, p := range m.products {
		if p.Name == name && p.Active {
			return p.PriceCents, true
		}
	}
	return 0, false
}

func (m *MemStore) AddOrder(o Order) Order {
	m.mu.Lock()
	defer m.mu.Unlock()
	o.ID = m.genID()
	o.CreatedAt = time.Now()
	m.orders = append(m.orders, o)
	return o
}

func (m *MemStore) GetOrders(filterPaid string) []Order {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]Order, 0)
	for _, o := range m.orders {
		if filterPaid == "true" && !o.Paid {
			continue
		}
		if filterPaid == "false" && o.Paid {
			continue
		}
		result = append(result, o)
	}
	return result
}

func (m *MemStore) MarkPaid(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, o := range m.orders {
		if o.ID == id {
			m.orders[i].Paid = true
			return true
		}
	}
	return false
}

func (m *MemStore) DeleteOrder(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, o := range m.orders {
		if o.ID == id {
			m.orders = append(m.orders[:i], m.orders[i+1:]...)
			return true
		}
	}
	return false
}

func (m *MemStore) RemoveOrderItem(id string, productName string) (Order, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for i, o := range m.orders {
		if o.ID == id {
			filtered := make([]OrderItem, 0, len(o.Items))
			for _, item := range o.Items {
				if item.ProductName != productName {
					filtered = append(filtered, item)
				}
			}
			if len(filtered) == 0 {
				m.orders = append(m.orders[:i], m.orders[i+1:]...)
				return Order{}, false
			}
			total := 0
			for _, item := range filtered {
				total += item.UnitPriceCents * item.Quantity
			}
			m.orders[i].Items = filtered
			m.orders[i].TotalCents = total
			return m.orders[i], true
		}
	}
	return Order{}, false
}

func (m *MemStore) GetOrder(id string) (Order, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, o := range m.orders {
		if o.ID == id {
			return o, true
		}
	}
	return Order{}, false
}

func (m *MemStore) GetSummary() Summary {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s := Summary{}
	for _, o := range m.orders {
		s.TotalOrders++
		s.TotalSoldCents += o.TotalCents
		if o.Paid {
			s.TotalPaidCents += o.TotalCents
		} else {
			s.TotalPendingCents += o.TotalCents
		}
	}
	return s
}