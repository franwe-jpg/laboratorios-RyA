# Server role: host firewall (nftables), SSH for administration and the
# internal web service. SSH accepts no logins: it only needs to be a real
# listening service so Part A can show "22 allowed" against "8080 blocked".
FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2
RUN apt-get update \
 && apt-get install -y --no-install-recommends nftables iptables conntrack python3 iproute2 iputils-ping openssh-server \
 && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /run/sshd /srv/www \
 && printf 'PermitRootLogin no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/lab.conf \
 && echo "TP5 servicio interno (puerto 8000)" > /srv/www/index.html
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
WORKDIR /srv/www
CMD ["/usr/local/bin/entrypoint.sh"]
