package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
)

func enableCors(w *http.ResponseWriter, r *http.Request) {
	allowedOrigins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") // Split multiple origins
	currentOrigin := r.Header.Get("Origin")

	for _, origin := range allowedOrigins {
		if origin == currentOrigin {
			(*w).Header().Set("Access-Control-Allow-Origin", origin)
			break
		}
	}
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w, r)
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "backend stable")
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		enableCors(&w, r)
		fmt.Fprintf(w, "Hello, this is a placeholder for the portfolio backend!")
	})

	http.HandleFunc("/api/status", statusHandler)

	http.ListenAndServe(":8080", nil)
}
