package main

import (
	"crypto/rand"
	"encoding/csv"
	"encoding/hex"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"cloud.google.com/go/firestore"
)

func newCode(prefix string) string {
	var buf [3]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
	}
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(buf[:]))
}

func handleExportOrders(w http.ResponseWriter, r *http.Request) {
	var orders []Order

	if fsClient == nil {
		orders = memStore.GetOrders("")
	} else {
		iter := fsClient.Collection("orders").OrderBy("CreatedAt", firestore.Asc).Documents(r.Context())
		docs, err := iter.GetAll()
		if err != nil {
			http.Error(w, "Erro ao buscar pedidos", http.StatusInternalServerError)
			return
		}
		for _, doc := range docs {
			var order Order
			if err := doc.DataTo(&order); err != nil {
				continue
			}
			order.ID = doc.Ref.ID
			orders = append(orders, order)
		}
	}

	sort.Slice(orders, func(i, j int) bool {
		return orders[i].CreatedAt.Before(orders[j].CreatedAt)
	})

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=pedidos.csv")
	cw := csv.NewWriter(w)
	cw.Write([]string{"Data", "ID", "Cliente", "Produto", "ID do item", "Quantidade", "Preco unitario", "Total", "Status"})

	for _, order := range orders {
		paid := "Pendente"
		if order.Paid {
			paid = "Pago"
		}
		for _, item := range order.Items {
			cw.Write([]string{
				order.CreatedAt.Format("2006-01-02 15:04:05"),
				order.OrderCode,
				order.CustomerName,
				item.ProductName,
				item.Code,
				strconv.Itoa(item.Quantity),
				fmt.Sprintf("%.2f", float64(item.UnitPriceCents)/100.0),
				fmt.Sprintf("%.2f", float64(item.UnitPriceCents*item.Quantity)/100.0),
				paid,
			})
		}
	}

	cw.Flush()
	if err := cw.Error(); err != nil {
		http.Error(w, "Erro ao gerar CSV", http.StatusInternalServerError)
	}
}
