package main

import (
	"fmt"
	"os"

	"golang.org/x/crypto/bcrypt"
)

// Gera hash bcrypt para a senha admin
// Uso: go run cmd/hashpw/main.go <senha>
func main() {
	if len(os.Args) < 2 {
		fmt.Println("Uso: go run cmd/hashpw/main.go <senha>")
		os.Exit(1)
	}

	password := os.Args[1]
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Erro: %v\n", err)
		os.Exit(1)
	}

	fmt.Println(string(hash))
}