# Attacker role: traffic generators used by the practical (scan, HTTP, SSH).
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN apt-get update \
 && apt-get install -y --no-install-recommends nmap curl netcat-openbsd openssh-client sshpass iproute2 iputils-ping ca-certificates \
 && rm -rf /var/lib/apt/lists/*
CMD ["sleep", "infinity"]
