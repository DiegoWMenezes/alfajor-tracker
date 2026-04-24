package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var sessionSecret = ""

func init() {
	secret := os.Getenv("SESSION_SECRET")
	if secret == "" {
		secret = "alfajor-tracker-default-secret-change-me"
	}
	sessionSecret = secret
}

func checkAdminPassword(password string) bool {
	hash := os.Getenv("ADMIN_PASSWORD_HASH")
	if hash == "" {
		// Modo demo: senha padrao "admin"
		defaultHash, _ := hashPassword("admin")
		hash = defaultHash
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func hashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 10)
	return string(bytes), err
}

type sessionClaims struct {
	Role string `json:"role"`
	jwt.RegisteredClaims
}

func createSessionToken() (string, error) {
	claims := sessionClaims{
		Role: "admin",
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "alfajor-tracker",
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(sessionSecret))
}

func validateSession(r *http.Request) bool {
	cookie, err := r.Cookie("session")
	if err != nil {
		return false
	}

	token, err := jwt.ParseWithClaims(cookie.Value, &sessionClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(sessionSecret), nil
	})
	if err != nil || !token.Valid {
		return false
	}

	claims, ok := token.Claims.(*sessionClaims)
	if !ok {
		return false
	}

	return claims.Role == "admin"
}

func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !validateSession(r) {
			http.Error(w, "Nao autorizado", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func generateHMAC(data string) string {
	mac := hmac.New(sha256.New, []byte(sessionSecret))
	mac.Write([]byte(data))
	return hex.EncodeToString(mac.Sum(nil))
}

func isAPIRequest(r *http.Request) bool {
	return strings.HasPrefix(r.URL.Path, "/api/")
}