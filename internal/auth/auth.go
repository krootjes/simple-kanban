package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"time"

	"golang.org/x/crypto/bcrypt"
	"simple-kanban/internal/db"
	"simple-kanban/internal/models"
)

type contextKey string

const userKey contextKey = "user"

type Service struct {
	db *db.DB
}

func New(db *db.DB) *Service {
	return &Service{db: db}
}

func (s *Service) HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash), err
}

func (s *Service) CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func (s *Service) CreateUser(username, password string) (*models.User, error) {
	hash, err := s.HashPassword(password)
	if err != nil {
		return nil, err
	}
	res, err := s.db.Exec(`INSERT INTO users (username, password_hash) VALUES (?, ?)`, username, hash)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()

	defaults := []string{"Backlog", "Todo", "Doing", "Done"}
	for i, name := range defaults {
		s.db.Exec(`INSERT INTO columns (user_id, name, position) VALUES (?, ?, ?)`, id, name, i)
	}

	return &models.User{ID: id, Username: username}, nil
}

func (s *Service) GetUserByUsername(username string) (*models.User, error) {
	var u models.User
	err := s.db.QueryRow(
		`SELECT id, username, password_hash, created_at FROM users WHERE username = ?`, username,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	return &u, err
}

func (s *Service) CreateSession(userID int64) (*models.Session, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	token := hex.EncodeToString(b)
	expiresAt := time.Now().Add(30 * 24 * time.Hour).UTC().Format(time.RFC3339)

	_, err := s.db.Exec(
		`INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)`,
		userID, token, expiresAt,
	)
	if err != nil {
		return nil, err
	}
	return &models.Session{UserID: userID, Token: token, ExpiresAt: expiresAt}, nil
}

func (s *Service) GetUserBySession(token string) (*models.User, error) {
	var u models.User
	err := s.db.QueryRow(
		`SELECT u.id, u.username, u.password_hash, u.created_at
		 FROM users u JOIN sessions sess ON sess.user_id = u.id
		 WHERE sess.token = ? AND sess.expires_at > datetime('now')`,
		token,
	).Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt)
	return &u, err
}

func (s *Service) DeleteSession(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *Service) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		user, err := s.GetUserBySession(cookie.Value)
		if err != nil {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), userKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserFromContext(ctx context.Context) *models.User {
	u, _ := ctx.Value(userKey).(*models.User)
	return u
}
