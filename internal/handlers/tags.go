package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"simple-kanban/internal/auth"
	"simple-kanban/internal/models"
)

func (h *Handler) GetTags(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	rows, err := h.db.Query(
		`SELECT id, user_id, name, color FROM tags WHERE user_id = ? ORDER BY name`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	tags := []models.Tag{}
	for rows.Next() {
		var t models.Tag
		rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Color)
		tags = append(tags, t)
	}
	writeJSON(w, http.StatusOK, tags)
}

func (h *Handler) CreateTag(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := readJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "#6366f1"
	}

	res, err := h.db.Exec(
		`INSERT INTO tags (user_id, name, color) VALUES (?, ?, ?)`,
		user.ID, req.Name, req.Color,
	)
	if err != nil {
		writeError(w, http.StatusConflict, "tag already exists")
		return
	}

	id, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, models.Tag{ID: id, UserID: user.ID, Name: req.Name, Color: req.Color})
}

func (h *Handler) UpdateTag(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}
	if err := readJSON(r, &req); err != nil || req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}

	res, err := h.db.Exec(
		`UPDATE tags SET name = ?, color = ? WHERE id = ? AND user_id = ?`,
		req.Name, req.Color, id, user.ID,
	)
	if err != nil {
		writeError(w, http.StatusConflict, "tag name already exists")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, models.Tag{ID: id, UserID: user.ID, Name: req.Name, Color: req.Color})
}

func (h *Handler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	res, err := h.db.Exec(`DELETE FROM tags WHERE id = ? AND user_id = ?`, id, user.ID)
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
