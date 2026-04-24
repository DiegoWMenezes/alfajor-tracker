FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /alfajor-tracker .

FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata
ENV TZ=America/Sao_Paulo

WORKDIR /app
COPY --from=builder /alfajor-tracker .

EXPOSE 8080

CMD ["./alfajor-tracker"]