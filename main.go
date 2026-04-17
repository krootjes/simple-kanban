package main

import (
	"log"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"simple-kanban/internal/auth"
	"simple-kanban/internal/db"
	"simple-kanban/internal/handlers"
)

func main() {
	if err := os.MkdirAll("./data", 0755); err != nil {
		log.Fatalf("failed to create data directory: %v", err)
	}

	database, err := db.New("./data/kanban.db")
	if err != nil {
		log.Fatalf("failed to open database: %v", err)
	}
	defer database.Close()

	if err := database.Migrate(); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	authSvc := auth.New(database)
	ensureInitialUser(database, authSvc)

	h := handlers.New(database, authSvc)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Post("/auth/login", h.Login)
	r.Post("/auth/logout", h.Logout)

	r.Group(func(r chi.Router) {
		r.Use(authSvc.Middleware)

		r.Get("/api/columns", h.GetColumns)
		r.Post("/api/columns", h.CreateColumn)
		r.Put("/api/columns/{id}", h.UpdateColumn)
		r.Delete("/api/columns/{id}", h.DeleteColumn)
		r.Put("/api/columns/{id}/move", h.MoveColumn)

		r.Get("/api/cards", h.GetCards)
		r.Post("/api/cards", h.CreateCard)
		r.Put("/api/cards/{id}", h.UpdateCard)
		r.Delete("/api/cards/{id}", h.DeleteCard)
		r.Put("/api/cards/{id}/move", h.MoveCard)

		r.Get("/api/tag-categories", h.GetTagCategories)
		r.Post("/api/tag-categories", h.CreateTagCategory)
		r.Put("/api/tag-categories/{id}", h.UpdateTagCategory)
		r.Delete("/api/tag-categories/{id}", h.DeleteTagCategory)

		r.Get("/api/tags", h.GetTags)
		r.Post("/api/tags", h.CreateTag)
		r.Put("/api/tags/{id}", h.UpdateTag)
		r.Delete("/api/tags/{id}", h.DeleteTag)

		r.Get("/api/settings", h.GetSettings)
		r.Put("/api/settings", h.UpdateSettings)
		r.Put("/api/settings/password", h.ChangePassword)
		r.Put("/api/settings/username", h.ChangeUsername)
	})

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./web/index.html")
	})
	r.Get("/settings", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./web/settings.html")
	})
	r.Handle("/*", http.FileServer(http.Dir("./web")))

	log.Println("Listening on 0.0.0.0:8080 (container internal port)")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func ensureInitialUser(database *db.DB, authSvc *auth.Service) {
	var count int
	database.QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	if count > 0 {
		return
	}

	username := os.Getenv("KANBAN_USERNAME")
	password := os.Getenv("KANBAN_PASSWORD")
	if username == "" {
		username = "admin"
	}
	if password == "" {
		log.Fatal("No users exist. Set KANBAN_PASSWORD env var to create the initial user.")
	}

	if _, err := authSvc.CreateUser(username, password); err != nil {
		log.Fatalf("failed to create initial user: %v", err)
	}
	log.Printf("Created initial user '%s'", username)
}
