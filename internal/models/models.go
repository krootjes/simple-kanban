package models

type User struct {
	ID           int64  `json:"id"`
	Username     string `json:"username"`
	PasswordHash string `json:"-"`
	CreatedAt    string `json:"created_at"`
}

type Session struct {
	ID        int64  `json:"-"`
	UserID    int64  `json:"user_id"`
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
}

type Column struct {
	ID        int64  `json:"id"`
	UserID    int64  `json:"user_id"`
	Name      string `json:"name"`
	Position  int    `json:"position"`
	CreatedAt string `json:"created_at"`
}

type TagCategory struct {
	ID     int64  `json:"id"`
	UserID int64  `json:"user_id"`
	Name   string `json:"name"`
	Color  string `json:"color"`
}

type Tag struct {
	ID            int64  `json:"id"`
	UserID        int64  `json:"user_id"`
	Name          string `json:"name"`
	Color         string `json:"color"`
	TagCategoryID *int64 `json:"tag_category_id"`
}

type Card struct {
	ID            int64        `json:"id"`
	UserID        int64        `json:"user_id"`
	ColumnID      int64        `json:"column_id"`
	Title         string       `json:"title"`
	Description   string       `json:"description"`
	DueDate       *string      `json:"due_date"`
	Position      int          `json:"position"`
	CreatedAt     string       `json:"created_at"`
	Tags          []Tag        `json:"tags"`
	TagCategoryID *int64       `json:"tag_category_id"`
	TagCategory   *TagCategory `json:"tag_category,omitempty"`
}
