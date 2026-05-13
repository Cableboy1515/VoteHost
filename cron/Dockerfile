FROM alpine:3.20
RUN apk add --no-cache curl
COPY run.sh /cron/run.sh
RUN chmod +x /cron/run.sh
# Run on the hour, every hour. Uses a sleep loop so env vars are always available.
CMD ["sh", "-c", "while true; do sleep 3600; /cron/run.sh; done"]
