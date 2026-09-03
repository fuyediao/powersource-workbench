// Command workbench-api is the PowerSource Workbench Go API.
//
//	POST /auth/login
//	POST /auth/refresh
//	POST /auth/logout
//	GET  /auth/me
//	POST /auth/invitations
//	GET  /start/suggest
//	POST /start/markets/quotes
//	GET  /start/markets/search
//	GET  /start/news
//	GET  /start/weather
//	GET  /start/weather/place
//	GET  /start/weather/search
//	GET  /start/currency/catalog
//	GET  /start/currency/convert
//	GET  /health
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/fuyediao/powersource-workbench/backend/internal/config"
	"github.com/fuyediao/powersource-workbench/backend/internal/server"
)

func main() {
	config.LoadDotEnv(".env")
	env := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	srv := &http.Server{
		Addr:              ":" + env.Port,
		Handler:           server.New(env),
		ReadHeaderTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("workbench-api listening on port %s", env.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}
