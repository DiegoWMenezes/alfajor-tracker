package main

import (
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
)

//go:embed static
var staticFiles embed.FS

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Inicializa Firebase
	fsClient = initFirebase()
	if fsClient != nil {
		seedProducts(fsClient)
	} else {
		initMemStore()
	}

	// Serve arquivos estaticos
	staticFS, err := fs.Sub(staticFiles, "static")
	if err != nil {
		log.Fatal(err)
	}
	fileServer := http.FileServer(http.FS(staticFS))

	mux := http.NewServeMux()

	// Arquivos estaticos
	mux.Handle("/static/", http.StripPrefix("/static/", fileServer))

	// Paginas
	mux.HandleFunc("/", servePage("index.html"))
	mux.HandleFunc("/admin", servePage("admin.html"))

	// Auth
	mux.HandleFunc("POST /api/login", handleLogin)
	mux.HandleFunc("POST /api/logout", handleLogout)

	// Products
	mux.HandleFunc("GET /api/products", handleGetProducts)
	mux.HandleFunc("POST /api/products", requireAuth(handleCreateProduct))
	mux.HandleFunc("DELETE /api/products/{id}", requireAuth(handleDeleteProduct))

	// Orders
	mux.HandleFunc("POST /api/orders", handleCreateOrder)
	mux.HandleFunc("GET /api/orders", requireAuth(handleGetOrders))
	mux.HandleFunc("PATCH /api/orders/{id}/pay", requireAuth(handleMarkPaid))

	// Summary
	mux.HandleFunc("GET /api/summary", requireAuth(handleSummary))

	fmt.Printf("Servidor rodando em http://localhost:%s\n", port)
	fmt.Println("Senha padrao (demo): admin")
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func servePage(filename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, err := staticFiles.ReadFile("static/" + filename)
		if err != nil {
			http.Error(w, "Pagina nao encontrada", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	}
}