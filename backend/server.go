package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
)

// Enable CORS by setting headers based on allowed origins.
func enableCors(w *http.ResponseWriter, r *http.Request) {
	allowedOrigins := strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") // Split multiple origins
	currentOrigin := r.Header.Get("Origin")

	for _, origin := range allowedOrigins {
		if origin == currentOrigin {
			(*w).Header().Set("Access-Control-Allow-Origin", origin)
			(*w).Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
			(*w).Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
			break
		}
	}
}

// Handler for the status endpoint.
func statusHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w, r)
	if r.Method == "OPTIONS" {
		return // Preflight request thingy again
	}
	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, "backend stable")
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		enableCors(&w, r)
		if r.Method == "OPTIONS" {
			return // Handle preflight request
			/* G said:
			Preflight Requests: OPTIONS requests are used as preflight requests in CORS.
			If the request method is OPTIONS, the function returns early after setting the
			necessary CORS headers. This ensures that preflight requests are properly acknowledged
			and don't proceed to the normal handler logic, which is unnecessary for preflight. */
		}
		fmt.Fprintf(w, "Hello, this is a placeholder for the portfolio backend!")
	})

	http.HandleFunc("/api/status", statusHandler)

	fmt.Println("Server is running on port 8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		fmt.Printf("Failed to start server: %v\n", err)
	}
}
