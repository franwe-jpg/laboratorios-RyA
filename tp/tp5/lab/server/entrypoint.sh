#!/bin/sh
# Host keys are generated per container so none are baked into the image.
set -e
ssh-keygen -A >/dev/null
/usr/sbin/sshd
exec python3 -m http.server 8000
