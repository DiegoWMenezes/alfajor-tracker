package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"cloud.google.com/go/firestore"
	"google.golang.org/api/option"
)

func main() {
	saJSON := os.Getenv("FIREBASE_SERVICE_ACCOUNT")
	if saJSON == "" {
		// Tenta ler do arquivo local
		data, err := os.ReadFile("service-account.json")
		if err != nil {
			data, err = os.ReadFile("../service-account.json")
			if err != nil {
				log.Fatal("Defina FIREBASE_SERVICE_ACCOUNT ou tenha service-account.json na raiz do projeto")
			}
		}
		saJSON = string(data)
	}

	var sa map[string]interface{}
	if err := json.Unmarshal([]byte(saJSON), &sa); err != nil {
		log.Fatalf("Erro ao parsear service account: %v", err)
	}

	projectID, _ := sa["project_id"].(string)
	creds, _ := json.Marshal(sa)
	opt := option.WithCredentialsJSON(creds)

	app, err := firebase.NewApp(context.Background(), &firebase.Config{ProjectID: projectID}, opt)
	if err != nil {
		log.Fatalf("Erro ao inicializar Firebase: %v", err)
	}

	client, err := app.Firestore(context.Background())
	if err != nil {
		log.Fatalf("Erro ao criar Firestore client: %v", err)
	}
	defer client.Close()

	ctx := context.Background()

	// 1. Criar categorias padrao se nao existirem
	seedCategories(ctx, client)

	// 2. Migrar produtos existentes
	migrateProducts(ctx, client)

	fmt.Println("Migracao concluida!")
}

func seedCategories(ctx context.Context, client *firestore.Client) {
	categories := []string{"Alfajor", "Cone"}

	for _, name := range categories {
		iter := client.Collection("categories").Where("Name", "==", name).Limit(1).Documents(ctx)
		docs, _ := iter.GetAll()
		if len(docs) > 0 {
			fmt.Printf("Categoria ja existe: %s\n", name)
			continue
		}

		_, _, err := client.Collection("categories").Add(ctx, map[string]string{"name": name})
		if err != nil {
			log.Printf("Erro ao criar categoria %s: %v", name, err)
		} else {
			fmt.Printf("Categoria criada: %s\n", name)
		}
	}
}

func migrateProducts(ctx context.Context, client *firestore.Client) {
	iter := client.Collection("products").Documents(ctx)
	docs, err := iter.GetAll()
	if err != nil {
		log.Fatalf("Erro ao buscar produtos: %v", err)
	}

	updated := 0
	for _, doc := range docs {
		var data map[string]interface{}
		if err := doc.DataTo(&data); err != nil {
			log.Printf("Erro ao ler produto %s: %v", doc.Ref.ID, err)
			continue
		}

		// Pula se ja tem categoria
		if cat, ok := data["Category"].(string); ok && cat != "" {
			continue
		}

		name, _ := data["Name"].(string)
		nameUpper := strings.ToUpper(name)
		category := ""
		newName := name

		if strings.HasPrefix(nameUpper, "ALFAJOR -") {
			category = "Alfajor"
			newName = strings.TrimSpace(strings.TrimPrefix(name, "Alfajor -"))
			newName = strings.TrimSpace(strings.TrimPrefix(newName, "ALFAJOR -"))
		} else if strings.HasPrefix(nameUpper, "CONE ") {
			category = "Cone"
			newName = strings.TrimSpace(strings.TrimPrefix(name, "CONE "))
			newName = strings.TrimSpace(strings.TrimPrefix(newName, "Cone "))
		} else if strings.HasPrefix(nameUpper, "ALFAJOR -") {
			category = "Alfajor"
			newName = strings.TrimSpace(strings.TrimPrefix(name, "Alfajor -"))
		}

		if category == "" {
			fmt.Printf("Pulando %s — nao foi possivel determinar categoria\n", name)
			continue
		}

		updates := []firestore.Update{
			{Path: "Category", Value: category},
		}
		if newName != name {
			updates = append(updates, firestore.Update{Path: "Name", Value: newName})
		}

		_, err := doc.Ref.Update(ctx, updates)
		if err != nil {
			log.Printf("Erro ao atualizar %s: %v", name, err)
		} else {
			updated++
			if newName != name {
				fmt.Printf("  %s → [%s] %s\n", name, category, newName)
			} else {
				fmt.Printf("  %s → [%s]\n", name, category)
			}
		}
	}

	fmt.Printf("\nProdutos atualizados: %d\n", updated)
}
