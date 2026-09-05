# ARyS lab container (TP1 + TP2)

Reproducible environment for *Auditoría y Seguridad de Sistemas* (ARyS · IF046 ·
UNPSJB Trelew), scoped to **TP1 — Conceptos de Seguridad** and **TP2 — Seguridad
Física**. TP3 is out of scope.

Everything documented here was executed and verified against this image; the
privilege requirements below are empirical, not copied from upstream docs.

## What the container buys you, and what it does not

**Buys you:**

- **Pinned tool versions.** `gpg 2.2.40`, `cryptsetup 2.6.1`, `util-linux 2.38.1`,
  `mke2fs 1.47.0`, `coreutils 9.1`. The lab behaves identically today and on the
  grader's machine.
- **Isolation.** A mistyped `mkfs.ext4` destroys a 64 MB file inside a throwaway
  container, not a real partition.
- **Portability.** Two commands reproduce the environment with nothing installed
  on the host.

**Does not buy you:** TP1 (B.1–B.4) only manipulates ordinary files in a working
directory. It touches no real system state with or without Docker. There the
container gives reproducibility, not safety.

## Build

```bash
docker build -f docker/Dockerfile -t arys-lab:bookworm .
```

## TP1 — Conceptos de Seguridad (no privileges needed)

```bash
mkdir -p tp-work
docker run --rm -it -v "$PWD/tp-work:/lab" arys-lab:bookworm
```

`-it` matters: B.2 needs a TTY so GnuPG can prompt for the passphrase.
`-v` keeps your results after the container exits.

Covered: **B.1** `sha256sum` · **B.2** `gpg -c` · **B.3** `chmod` · **B.4** backup.

### Gotcha for B.3 — do not run it as root

The container's default user is root because TP2 needs it. **Root bypasses file
permission checks entirely**, so demonstrating `chmod 600` as root proves
nothing. Verified in this image:

```
as user lab : cat: /home/lab/orden.txt: Permission denied
as root     : Transferir 1000 a la cuenta 55      <- read anyway
```

Switch to the unprivileged account before answering B.3:

```bash
su - lab
```

### Non-interactive GPG (optional)

If you script B.2 instead of typing the passphrase:

```bash
gpg --batch --yes --pinentry-mode loopback --passphrase "your-pass" -c orden.txt
gpg --batch --pinentry-mode loopback --passphrase "your-pass" -d orden.txt.gpg
```

## TP2 B.1 — LUKS over a loop device (privileges required)

`losetup` and `cryptsetup` need to create block devices and mount filesystems,
which a default container cannot do. Two options.

### Option A — simple (recommended)

```bash
docker run --rm -it --privileged -v "$PWD/tp-work:/lab" arys-lab:bookworm
```

Inside, the assignment's commands work verbatim, including
`losetup --find --show` for automatic loop allocation.

### Option B — least privilege (verified working)

`--privileged` hands over every capability. This narrower set was tested and
completes the whole B.1 flow:

```bash
DM_MAJOR=$(grep -w device-mapper /proc/devices | awk '{print $1}')
LOOP=$(losetup -f)          # a loop device FREE ON THE HOST, e.g. /dev/loop42

docker run --rm -it \
  --cap-add=SYS_ADMIN \
  --device /dev/loop-control \
  --device "$LOOP" \
  --device /dev/mapper/control \
  --device-cgroup-rule="b ${DM_MAJOR}:* rmw" \
  --security-opt apparmor=unconfined \
  -v "$PWD/tp-work:/lab" \
  arys-lab:bookworm
```

Inside, attach the image to that exact device and disable the kernel keyring:

```bash
dd if=/dev/zero of=disco_lab.img bs=1M count=2048
losetup /dev/loop42 disco_lab.img            # explicit device, not --find
cryptsetup luksFormat /dev/loop42
cryptsetup luksOpen --disable-keyring /dev/loop42 caja_fuerte
mkfs.ext4 /dev/mapper/caja_fuerte
mount /dev/mapper/caja_fuerte /mnt
```

**Why each flag is needed** — each was added only after observing the failure it
fixes:

| Flag | Failure without it |
| --- | --- |
| `--cap-add=SYS_ADMIN` | `losetup`/`mount` denied outright |
| `--device /dev/loop-control` | cannot allocate a loop device |
| `--device /dev/loopN` | `losetup: failed to set up loop device` — the node does not exist in the container |
| `--device /dev/mapper/control` | `cryptsetup` cannot create the mapped device |
| `--device-cgroup-rule` | `mkfs.ext4: Operation not permitted` — `/dev/mapper/caja_fuerte` is created at runtime and cannot be pre-declared with `--device`, so the whole device-mapper major must be allowed |
| `--security-opt apparmor=unconfined` | `mount: cannot mount read-only` — Docker's default AppArmor profile blocks the `mount` syscall |
| `--disable-keyring` (on `luksOpen`) | `Failed to load key in kernel keyring` |

**The published claim that `--cap-add=SYS_ADMIN --device /dev/loop-control`
alone is enough is false.** Tested: `losetup` fails and `/dev/mapper/control`
is absent.

### Cleaning up a stale loop device

If a run aborts mid-flow, the host loop device stays attached to a deleted file
and later runs fail with `Device or resource busy`. Release it without host root:

```bash
docker run --rm --privileged arys-lab:bookworm losetup -d /dev/loop42
```

## Known limitations

### B.2 USBGuard — NOT reproducible in this container

USBGuard is deliberately **not installed**. It cannot work here:

- It needs **real USB hardware** enumerated by the host; a container has no USB bus.
- It runs as a **systemd service** (`systemctl enable --now usbguard`), and this
  image has no init system — PID 1 is your shell.
- Its authorization model writes to `/sys/bus/usb/devices/*/authorized`, which is
  read-only inside a container.

Do B.2 on a **disposable VM** with real USB passthrough, as the assignment
instructs ("trabajá en una máquina virtual GNU/Linux descartable"). The
container covers B.1; B.2 does not belong in it.

### B.3 UPS monitoring — client only

`nut-client` is installed, so `upsc` exists and you can show the tooling. Without
a UPS and a reachable NUT server it returns no data. The assignment explicitly
allows answering B.3 theoretically (RTO 1 h / RPO 15 min, N+1 vs 2N, 3-2-1-1-0),
which is the expected path when no hardware is available.

## Scope summary

| Assignment | Status | Requirement |
| --- | --- | --- |
| TP1 B.1 hash | Works | none |
| TP1 B.2 GPG | Works | `-it` for the passphrase prompt |
| TP1 B.3 permissions | Works | `su - lab` — root bypasses the check |
| TP1 B.4 backup | Works | none |
| TP2 B.1 LUKS | Works | Option A or B above |
| TP2 B.2 USBGuard | **Not supported** | real USB + systemd → use a VM |
| TP2 B.3 UPS | Client only | real UPS, or answer theoretically |
