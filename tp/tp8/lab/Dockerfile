# TP8 lab host: SNMP agent + manager tools, packet capture and syslog.
# Prometheus and Grafana run as separate official images (see compose.yaml).
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
# snmp-mibs-downloader lives in non-free: it fetches the standard IETF MIBs so
# symbolic names such as sysDescr.0 resolve (without them only numeric OIDs work).
RUN sed -i 's/^Components: main$/Components: main non-free/' /etc/apt/sources.list.d/debian.sources \
 && apt-get update && apt-get install --no-install-recommends -y \
      snmpd snmp libsnmp-base snmp-mibs-downloader \
      tcpdump tshark \
      rsyslog util-linux curl ca-certificates jq procps \
 && download-mibs \
 && sed -i 's/^mibs :/#mibs :/' /etc/snmp/snmp.conf \
 && sed -i 's/^sysLocation .*/sysLocation Laboratorio ARyS - UNPSJB Trelew/; s/^sysContact .*/sysContact fsoler@kali/' /etc/snmp/snmpd.conf \
 && sed -i 's/^module(load="imklog"/#&/' /etc/rsyslog.conf \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /lab
CMD ["sleep", "infinity"]
