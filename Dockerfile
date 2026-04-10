FROM golang:1.22-alpine AS builder
WORKDIR /build
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o kanban .

FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /build/kanban .
COPY web/ ./web/
RUN mkdir -p data
EXPOSE 8080
CMD ["./kanban"]
