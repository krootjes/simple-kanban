package handlers

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"simple-kanban/internal/auth"
	"simple-kanban/internal/models"
)

func (h *Handler) GetColumns(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	rows, err := h.db.Query(
		`SELECT id, user_id, name, position, created_at FROM columns WHERE user_id = ? ORDER BY position`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	cols := []models.Column{}
	for rows.Next() {
		var c models.Column
		rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Position, &c.CreatedAt)
		cols = append(cols, c)
	}
	writeJSON(w, http.StatusOK, cols)
}

func (h *Handler) CreateColumn(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	var maxPos int
	h.db.QueryRow(`SELECT COALESCE(MAX(position), -1) FROM columns WHERE user_id = ?`, user.ID).Scan(&maxPos)

	res, err := h.db.Exec(
		`INSERT INTO columns (user_id, name, position) VALUES (?, ?, ?)`,
		user.ID, req.Name, maxPos+1,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	id, _ := res.LastInsertId()
	var col models.Column
	h.db.QueryRow(`SELECT id, user_id, name, position, created_at FROM columns WHERE id = ?`, id).
		Scan(&col.ID, &col.UserID, &col.Name, &col.Position, &col.CreatedAt)
	writeJSON(w, http.StatusCreated, col)
}

func (h *Handler) UpdateColumn(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	var req struct {
		Name string `json:"name"`
	}
	if err := readJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	res, err := h.db.Exec(
		`UPDATE columns SET name = ? WHERE id = ? AND user_id = ?`,
		req.Name, id, user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	var col models.Column
	h.db.QueryRow(`SELECT id, user_id, name, position, created_at FROM columns WHERE id = ?`, id).
		Scan(&col.ID, &col.UserID, &col.Name, &col.Position, &col.CreatedAt)
	writeJSON(w, http.StatusOK, col)
}

func (h *Handler) DeleteColumn(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	var count int
	h.db.QueryRow(`SELECT COUNT(*) FROM cards WHERE column_id = ? AND user_id = ?`, id, user.ID).Scan(&count)
	if count > 0 {
		writeError(w, http.StatusConflict, "column still has cards")
		return
	}

	res, err := h.db.Exec(`DELETE FROM columns WHERE id = ? AND user_id = ?`, id, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) MoveColumn(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	var req struct {
		Position int `json:"position"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var currentPos int
	err := h.db.QueryRow(`SELECT position FROM columns WHERE id = ? AND user_id = ?`, id, user.ID).Scan(&currentPos)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	tx, _ := h.db.Begin()
	if req.Position > currentPos {
		tx.Exec(`UPDATE columns SET position = position - 1 WHERE user_id = ? AND position > ? AND position <= ?`,
			user.ID, currentPos, req.Position)
	} else {
		tx.Exec(`UPDATE columns SET position = position + 1 WHERE user_id = ? AND position >= ? AND position < ?`,
			user.ID, req.Position, currentPos)
	}
	tx.Exec(`UPDATE columns SET position = ? WHERE id = ?`, req.Position, id)
	tx.Commit()

	w.WriteHeader(http.StatusNoContent)
}
