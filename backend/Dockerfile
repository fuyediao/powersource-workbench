# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o /out/workbench-api ./cmd/workbench-api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates libwebp-tools
WORKDIR /app
COPY --from=builder /out/workbench-api ./workbench-api
EXPOSE 3001
ENTRYPOINT ["./workbench-api"]
