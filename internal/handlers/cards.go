package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"simple-kanban/internal/auth"
	"simple-kanban/internal/models"
)

// normalizeDueDate trims any time component from a date string returned by the
// SQLite driver (e.g. "2026-04-18T00:00:00Z" → "2026-04-18").
func normalizeDueDate(s *string) *string {
	if s == nil || len(*s) <= 10 {
		return s
	}
	v := (*s)[:10]
	return &v
}

func (h *Handler) enforceTagCategoryRestriction() bool {
	var val string
	h.db.QueryRow(`SELECT value FROM global_settings WHERE key = 'enforce_tag_category_restriction'`).Scan(&val)
	return val == "true"
}

func (h *Handler) GetCards(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	rows, err := h.db.Query(
		`SELECT id, user_id, column_id, title, description, due_date, position, tag_category_id, created_at
		 FROM cards WHERE user_id = ? ORDER BY column_id, position`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	defer rows.Close()

	cards := []models.Card{}
	for rows.Next() {
		var c models.Card
		rows.Scan(&c.ID, &c.UserID, &c.ColumnID, &c.Title, &c.Description, &c.DueDate, &c.Position, &c.TagCategoryID, &c.CreatedAt)
		c.DueDate = normalizeDueDate(c.DueDate)
		c.Tags = h.getCardTags(c.ID)
		cards = append(cards, c)
	}
	writeJSON(w, http.StatusOK, cards)
}

func (h *Handler) getCardTags(cardID int64) []models.Tag {
	rows, err := h.db.Query(
		`SELECT t.id, t.user_id, t.name, t.color, t.tag_category_id FROM tags t
		 JOIN card_tags ct ON ct.tag_id = t.id WHERE ct.card_id = ?`, cardID,
	)
	if err != nil {
		return []models.Tag{}
	}
	defer rows.Close()
	tags := []models.Tag{}
	for rows.Next() {
		var t models.Tag
		rows.Scan(&t.ID, &t.UserID, &t.Name, &t.Color, &t.TagCategoryID)
		tags = append(tags, t)
	}
	return tags
}

func (h *Handler) validateTagsForCategory(tagIDs []int64, categoryID int64) bool {
	for _, tagID := range tagIDs {
		var catID *int64
		h.db.QueryRow(`SELECT tag_category_id FROM tags WHERE id = ?`, tagID).Scan(&catID)
		if catID == nil || *catID != categoryID {
			return false
		}
	}
	return true
}

func (h *Handler) CreateCard(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	var req struct {
		ColumnID      int64   `json:"column_id"`
		Title         string  `json:"title"`
		Description   string  `json:"description"`
		DueDate       *string `json:"due_date"`
		TagIDs        []int64 `json:"tag_ids"`
		TagCategoryID *int64  `json:"tag_category_id"`
	}
	if err := readJSON(r, &req); err != nil || req.Title == "" || req.ColumnID == 0 {
		writeError(w, http.StatusBadRequest, "column_id and title are required")
		return
	}

	if req.TagCategoryID != nil && h.enforceTagCategoryRestriction() && len(req.TagIDs) > 0 {
		if !h.validateTagsForCategory(req.TagIDs, *req.TagCategoryID) {
			writeError(w, http.StatusBadRequest, "one or more tags do not belong to the selected category")
			return
		}
	}

	var maxPos int
	h.db.QueryRow(`SELECT COALESCE(MAX(position), -1) FROM cards WHERE column_id = ? AND user_id = ?`, req.ColumnID, user.ID).Scan(&maxPos)

	res, err := h.db.Exec(
		`INSERT INTO cards (user_id, column_id, title, description, due_date, position, tag_category_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		user.ID, req.ColumnID, req.Title, req.Description, req.DueDate, maxPos+1, req.TagCategoryID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	id, _ := res.LastInsertId()
	for _, tagID := range req.TagIDs {
		h.db.Exec(`INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)`, id, tagID)
	}

	var card models.Card
	h.db.QueryRow(
		`SELECT id, user_id, column_id, title, description, due_date, position, tag_category_id, created_at FROM cards WHERE id = ?`, id,
	).Scan(&card.ID, &card.UserID, &card.ColumnID, &card.Title, &card.Description, &card.DueDate, &card.Position, &card.TagCategoryID, &card.CreatedAt)
	card.DueDate = normalizeDueDate(card.DueDate)
	card.Tags = h.getCardTags(id)
	writeJSON(w, http.StatusCreated, card)
}

func (h *Handler) UpdateCard(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	var req struct {
		Title         string  `json:"title"`
		Description   string  `json:"description"`
		DueDate       *string `json:"due_date"`
		TagIDs        []int64 `json:"tag_ids"`
		TagCategoryID *int64  `json:"tag_category_id"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	if req.TagCategoryID != nil && h.enforceTagCategoryRestriction() && len(req.TagIDs) > 0 {
		if !h.validateTagsForCategory(req.TagIDs, *req.TagCategoryID) {
			writeError(w, http.StatusBadRequest, "one or more tags do not belong to the selected category")
			return
		}
	}

	res, err := h.db.Exec(
		`UPDATE cards SET title = ?, description = ?, due_date = ?, tag_category_id = ? WHERE id = ? AND user_id = ?`,
		req.Title, req.Description, req.DueDate, req.TagCategoryID, id, user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	h.db.Exec(`DELETE FROM card_tags WHERE card_id = ?`, id)
	for _, tagID := range req.TagIDs {
		h.db.Exec(`INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)`, id, tagID)
	}

	var card models.Card
	h.db.QueryRow(
		`SELECT id, user_id, column_id, title, description, due_date, position, tag_category_id, created_at FROM cards WHERE id = ?`, id,
	).Scan(&card.ID, &card.UserID, &card.ColumnID, &card.Title, &card.Description, &card.DueDate, &card.Position, &card.TagCategoryID, &card.CreatedAt)
	card.DueDate = normalizeDueDate(card.DueDate)
	card.Tags = h.getCardTags(id)
	writeJSON(w, http.StatusOK, card)
}

func (h *Handler) DeleteCard(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	res, err := h.db.Exec(`DELETE FROM cards WHERE id = ? AND user_id = ?`, id, user.ID)
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

func (h *Handler) MoveCard(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)

	var req struct {
		ColumnID int64 `json:"column_id"`
		Position int   `json:"position"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	var currentColumn int64
	var currentPos int
	err := h.db.QueryRow(`SELECT column_id, position FROM cards WHERE id = ? AND user_id = ?`, id, user.ID).
		Scan(&currentColumn, &currentPos)
	if err != nil {
		writeError(w, http.StatusNotFound, "not found")
		return
	}

	tx, _ := h.db.Begin()
	if currentColumn == req.ColumnID {
		if req.Position > currentPos {
			tx.Exec(`UPDATE cards SET position = position - 1 WHERE column_id = ? AND user_id = ? AND position > ? AND position <= ?`,
				currentColumn, user.ID, currentPos, req.Position)
		} else {
			tx.Exec(`UPDATE cards SET position = position + 1 WHERE column_id = ? AND user_id = ? AND position >= ? AND position < ?`,
				currentColumn, user.ID, req.Position, currentPos)
		}
	} else {
		tx.Exec(`UPDATE cards SET position = position - 1 WHERE column_id = ? AND user_id = ? AND position > ?`,
			currentColumn, user.ID, currentPos)
		tx.Exec(`UPDATE cards SET position = position + 1 WHERE column_id = ? AND user_id = ? AND position >= ?`,
			req.ColumnID, user.ID, req.Position)
	}
	tx.Exec(`UPDATE cards SET column_id = ?, position = ? WHERE id = ?`, req.ColumnID, req.Position, id)
	tx.Commit()

	w.WriteHeader(http.StatusNoContent)
}
