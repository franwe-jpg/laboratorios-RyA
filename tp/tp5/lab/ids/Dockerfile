# IDS role: Suricata with the ET Open ruleset fetched at build time, so the
# isolated lab never needs Internet access at runtime.
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN apt-get update \
 && apt-get install -y --no-install-recommends suricata suricata-update ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN suricata-update --no-test && sha256sum /var/lib/suricata/rules/suricata.rules > /var/lib/suricata/rules/suricata.rules.sha256
# suricata.log is reset on every start so the healthcheck ("Engine started")
# cannot be satisfied by a previous run's log kept in the volume.
CMD ["sh", "-c", "rm -f /var/log/suricata/suricata.log && exec suricata -i eth1 -k none"]
