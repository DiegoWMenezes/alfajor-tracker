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

var (
	fsClient *firestore.Client
	ctx      = context.Background()
)

func initFirebase() *firestore.Client {
	// Tenta ler do arquivo primeiro, depois da env var
	saJSON := ""
	saFile := os.Getenv("FIREBASE_SERVICE_ACCOUNT_FILE")
	if saFile != "" {
		data, err := os.ReadFile(saFile)
		if err != nil {
			log.Printf("ERRO: Falha ao ler arquivo %s: %v", saFile, err)
			log.Println("AVISO: Usando modo demo (dados em memoria)")
			return nil
		}
		saJSON = string(data)
	}

	if saJSON == "" {
		saJSON = os.Getenv("FIREBASE_SERVICE_ACCOUNT")
	}

	if saJSON == "" {
		log.Println("AVISO: Firebase nao configurado, usando modo demo (dados em memoria)")
		return nil
	}

	// Render e outras plataformas convertem \n em newlines reais no valor da env var,
	// quebrando o parse do JSON. Convertemos de volta para a sequencia de escape \n.
	// Isso preserva as quebras de linha dentro da private_key (necessarias pro Firebase)
	// e mantem o JSON valido.
	saJSON = strings.ReplaceAll(saJSON, "\r", "")
	saJSON = strings.ReplaceAll(saJSON, "\n", "\\n")

	var sa map[string]interface{}
	if err := json.Unmarshal([]byte(saJSON), &sa); err != nil {
		log.Printf("ERRO: Falha ao parsear credenciais Firebase: %v", err)
		log.Println("AVISO: Usando modo demo (dados em memoria)")
		return nil
	}

	projectID, ok := sa["project_id"].(string)
	if !ok {
		log.Println("ERRO: project_id nao encontrado no service account")
		log.Println("AVISO: Usando modo demo (dados em memoria)")
		return nil
	}

	creds, err := json.Marshal(sa)
	if err != nil {
		log.Printf("ERRO: Falha ao criar credenciais: %v", err)
		log.Println("AVISO: Usando modo demo (dados em memoria)")
		return nil
	}

	opt := option.WithCredentialsJSON(creds)
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: projectID}, opt)
	if err != nil {
		log.Printf("ERRO: Falha ao inicializar Firebase: %v", err)
		log.Println("AVISO: Usando modo demo (dados em memoria)")
		return nil
	}

	client, err := app.Firestore(ctx)
	if err != nil {
		log.Printf("ERRO: Falha ao criar Firestore client: %v", err)
		log.Println("AVISO: Usando modo demo (dados em memoria)")
		return nil
	}

	fmt.Println("Firebase Firestore conectado")
	return client
}

func seedProducts(client *firestore.Client) {
	if client == nil {
		return
	}

	iter := client.Collection("products").Limit(1).Documents(ctx)
	doc, err := iter.Next()
	if err == nil && doc != nil {
		iter.Stop()
		return
	}
	iter.Stop()

	flavors := []Product{
		{Name: "Ninho", PriceCents: 600, Active: true},
		{Name: "Avela", PriceCents: 600, Active: true},
		{Name: "Amendoim", PriceCents: 600, Active: true},
		{Name: "Cookie", PriceCents: 600, Active: true},
		{Name: "Ovomaltine", PriceCents: 600, Active: true},
		{Name: "Kinder", PriceCents: 600, Active: true},
		{Name: "Pistache", PriceCents: 600, Active: true},
		{Name: "Morango", PriceCents: 600, Active: true},
		{Name: "Doce de Leite", PriceCents: 600, Active: true},
	}

	for _, p := range flavors {
		_, _, err := client.Collection("products").Add(ctx, p)
		if err != nil {
			log.Printf("Erro ao criar produto %s: %v", p.Name, err)
		}
	}
	fmt.Println("Sabores iniciais criados")
}