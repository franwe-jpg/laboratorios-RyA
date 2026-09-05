# Reproducible lab environment for ARyS (IF046) TP1 and TP2.
#
# Scope:
#   TP1 (B.1-B.4)  hash, symmetric GPG, Unix permissions, backup  -> works unprivileged
#   TP2 B.1        LUKS over a loop device                        -> needs SYS_ADMIN (see README)
#   TP2 B.2        USBGuard                                       -> NOT reproducible here (see README)
#   TP2 B.3        UPS monitoring                                 -> client installed; needs real hardware
#
# Pinned to a Debian release so tool versions stay identical across rebuilds.
FROM debian:bookworm-slim

# Keep apt non-interactive and leave no package cache in the image layer.
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install --no-install-recommends -y \
      # TP1 B.1/B.3/B.4: sha256sum, chmod, cp are in coreutils (base image),
      # explicit here so the dependency is documented rather than assumed.
      coreutils \
      # TP1 B.2: symmetric encryption. pinentry-curses lets gpg prompt for the
      # passphrase on an attached TTY (remember to run the container with -it).
      gnupg2 pinentry-curses \
      # TP2 B.1: losetup (util-linux), luksFormat/luksOpen, mkfs.ext4.
      util-linux cryptsetup-bin e2fsprogs \
      # TP2 B.3: upsc client. Useless without a reachable NUT server, installed
      # so the theoretical part can still show the tooling.
      nut-client \
      # Quality of life inside an interactive shell.
      less procps file binutils \
 && rm -rf /var/lib/apt/lists/*

# Unprivileged account for TP1 B.3.
#
# WHY THIS EXISTS: the container's default user is root, because TP2 B.1 needs
# it. But root bypasses file permission checks entirely, so demonstrating
# `chmod 600` as root proves nothing -- root reads the file regardless. Switch
# with `su - lab` for B.3 so the permission denial is real.
RUN useradd --create-home --shell /bin/bash lab

WORKDIR /lab

# Bind-mount your work here so results survive container removal:
#   -v "$PWD/tp-work:/lab"
VOLUME /lab

CMD ["/bin/bash"]
