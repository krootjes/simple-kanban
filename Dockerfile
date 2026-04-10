FROM golang:1.24-alpine AS builder
WORKDIR /build
COPY . .
RUN go mod tidy && CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o simple-kanban .

FROM alpine:3.19
LABEL org.opencontainers.image.source="https://github.com/krootjes/simple-kanban"
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=builder /build/simple-kanban .
COPY web/ ./web/
RUN mkdir -p data
EXPOSE 8080
CMD ["./simple-kanban"]
