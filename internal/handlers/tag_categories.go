package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"simple-kanban/internal/auth"
	"simple-kanban/internal/models"
)

func (h *Handler) GetTagCategories(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	rows, err := h.db.Query(
		`SELECT id, user_id, name, color FROM tag_categories WHERE user_id = ? ORDER BY name`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	cats := []models.TagCategory{}
	for rows.Next() {
		var c models.TagCategory
		rows.Scan(&c.ID, &c.UserID, &c.Name, &c.Color)
		cats = append(cats, c)
	}
	writeJSON(w, http.StatusOK, cats)
}

func (h *Handler) CreateTagCategory(w http.ResponseWriter, r *http.Request) {
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
		`INSERT INTO tag_categories (user_id, name, color) VALUES (?, ?, ?)`,
		user.ID, req.Name, req.Color,
	)
	if err != nil {
		writeError(w, http.StatusConflict, "category already exists")
		return
	}

	id, _ := res.LastInsertId()
	writeJSON(w, http.StatusCreated, models.TagCategory{ID: id, UserID: user.ID, Name: req.Name, Color: req.Color})
}

func (h *Handler) UpdateTagCategory(w http.ResponseWriter, r *http.Request) {
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
		`UPDATE tag_categories SET name = ?, color = ? WHERE id = ? AND user_id = ?`,
		req.Name, req.Color, id, user.ID,
	)
	if err != nil {
		writeError(w, http.StatusConflict, "category name already exists")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, models.TagCategory{ID: id, UserID: user.ID, Name: req.Name, Color: req.Color})
}

func (h *Handler) DeleteTagCategory(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	// Block deletion if any tags still reference this category
	var tagCount int
	h.db.QueryRow(
		`SELECT COUNT(*) FROM tags WHERE tag_category_id = ? AND user_id = ?`, id, user.ID,
	).Scan(&tagCount)
	if tagCount > 0 {
		writeError(w, http.StatusConflict, "cannot delete category: reassign or delete its tags first")
		return
	}

	res, err := h.db.Exec(`DELETE FROM tag_categories WHERE id = ? AND user_id = ?`, id, user.ID)
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
