FROM alpine:3.20
RUN apk add --no-cache curl
COPY run.sh /cron/run.sh
RUN chmod +x /cron/run.sh
# Run every minute so scheduled elections activate promptly. Heavy sweeps throttle internally.
CMD ["sh", "-c", "while true; do sleep 60; /cron/run.sh; done"]
