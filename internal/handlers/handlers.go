package handlers

import (
	"encoding/json"
	"net/http"

	"simple-kanban/internal/auth"
	"simple-kanban/internal/db"
)

type Handler struct {
	db   *db.DB
	auth *auth.Service
}

func New(db *db.DB, auth *auth.Service) *Handler {
	return &Handler{db: db, auth: auth}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func readJSON(r *http.Request, v any) error {
	return json.NewDecoder(r.Body).Decode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
