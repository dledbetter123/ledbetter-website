package main

import (
	"fmt"
	"net/http"
)

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*") // Be careful with '*', in production it's better to specify the exact origin
}

func statusHandler(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)
	// Set the content type to plain text for simplicity
	w.Header().Set("Content-Type", "text/plain")
	// Respond with the status message
	fmt.Fprintf(w, "Backend stable")
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
