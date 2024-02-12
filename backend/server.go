package main

import (
	"fmt"
	"net/http"
	"os"
)

func enableCors(w *http.ResponseWriter) {
	allowedOrigins := os.Getenv("ALLOWED_ORIGINS")
	// if allowedOrigins == "" {
	// 	allowedOrigins = "http://something.com" // default
	// }
	(*w).Header().Set("Access-Control-Allow-Origin", allowedOrigins)
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	// Set the content type to plain text for simplicity
	w.Header().Set("Content-Type", "text/plain")
	// Respond with the status message
	fmt.Fprintf(w, "backend stable")
}

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		enableCors(&w)
		fmt.Fprintf(w, "Hello, this is a placeholder for the portfolio backend!")
	})

	// Add the new handler function for the status route
	http.HandleFunc("/api/status", statusHandler)

	http.ListenAndServe(":8080", nil)
}
