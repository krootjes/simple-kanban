package handlers

import (
	"net/http"

	"simple-kanban/internal/auth"
)

func (h *Handler) GetSettings(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())

	var appName string
	h.db.QueryRow(`SELECT value FROM global_settings WHERE key = 'app_name'`).Scan(&appName)
	if appName == "" {
		appName = "Kanban"
	}

	var accentColor string
	h.db.QueryRow(`SELECT value FROM global_settings WHERE key = 'accent_color'`).Scan(&accentColor)

	var enforceRestriction string
	h.db.QueryRow(`SELECT value FROM global_settings WHERE key = 'enforce_tag_category_restriction'`).Scan(&enforceRestriction)
	if enforceRestriction == "" {
		enforceRestriction = "false"
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"app_name":                          appName,
		"username":                          user.Username,
		"accent_color":                      accentColor,
		"enforce_tag_category_restriction":  enforceRestriction,
	})
}

func (h *Handler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AppName                         string `json:"app_name"`
		AccentColor                     string `json:"accent_color"`
		EnforceTagCategoryRestriction   string `json:"enforce_tag_category_restriction"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}

	_, err := h.db.Exec(
		`INSERT OR REPLACE INTO global_settings (key, value) VALUES ('app_name', ?)`,
		req.AppName,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "db error")
		return
	}

	if req.AccentColor != "" {
		h.db.Exec(
			`INSERT OR REPLACE INTO global_settings (key, value) VALUES ('accent_color', ?)`,
			req.AccentColor,
		)
	}

	if req.EnforceTagCategoryRestriction == "true" || req.EnforceTagCategoryRestriction == "false" {
		h.db.Exec(
			`INSERT OR REPLACE INTO global_settings (key, value) VALUES ('enforce_tag_category_restriction', ?)`,
			req.EnforceTagCategoryRestriction,
		)
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"app_name":                         req.AppName,
		"accent_color":                     req.AccentColor,
		"enforce_tag_category_restriction": req.EnforceTagCategoryRestriction,
	})
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())

	var req struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if !h.auth.CheckPassword(user.PasswordHash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}
	if req.NewPassword == "" {
		writeError(w, http.StatusBadRequest, "new password cannot be empty")
		return
	}

	hash, err := h.auth.HashPassword(req.NewPassword)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	h.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, hash, user.ID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ChangeUsername(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())

	var req struct {
		NewUsername     string `json:"new_username"`
		CurrentPassword string `json:"current_password"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.NewUsername == "" {
		writeError(w, http.StatusBadRequest, "username cannot be empty")
		return
	}
	if !h.auth.CheckPassword(user.PasswordHash, req.CurrentPassword) {
		writeError(w, http.StatusUnauthorized, "current password is incorrect")
		return
	}

	_, err := h.db.Exec(`UPDATE users SET username = ? WHERE id = ?`, req.NewUsername, user.ID)
	if err != nil {
		writeError(w, http.StatusConflict, "username already taken")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"username": req.NewUsername})
}
