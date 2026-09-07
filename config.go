package main

import (
	"encoding/json"
	"net/http"
	"os"
)

func handleFirebaseConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"apiKey":            os.Getenv("FIREBASE_API_KEY"),
		"authDomain":        os.Getenv("FIREBASE_AUTH_DOMAIN"),
		"projectId":         os.Getenv("FIREBASE_PROJECT_ID"),
		"storageBucket":     os.Getenv("FIREBASE_STORAGE_BUCKET"),
		"messagingSenderId": os.Getenv("FIREBASE_MESSAGING_SENDER_ID"),
		"appId":             os.Getenv("FIREBASE_APP_ID"),
	})
}
