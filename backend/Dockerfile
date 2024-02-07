# Use the official Golang image to create a build artifact.
FROM golang:1.15 as builder

WORKDIR /app
COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -v -o server

FROM alpine:3
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/server /server

# run the web service when starting.
CMD ["/server"]
