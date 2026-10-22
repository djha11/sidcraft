# SidCraft on OCI

This bundle runs the SidCraft API, admin dashboard, AI news worker, PostgreSQL and HTTPS proxy on one OCI Ampere A1 VM. It is designed for the strict low-cost launch configuration, not multi-node high availability.

## Required infrastructure

- Ubuntu 24.04 ARM64 OCI Ampere A1 instance, 2 OCPUs and 12 GB memory.
- An attached boot/block volume inside the Always Free allowance.
- TCP ingress for 80 and 443 only. Restrict SSH to the administrator's current IP or use OCI Bastion.
- DNS `A`/`AAAA` records for `api.sidcraft.in` and `admin.sidcraft.in` pointing to the instance.
- Cloudflare Access in front of the complete admin hostname before making it public.

## Deployment

1. Install Docker Engine and the Compose plugin from Docker's official Ubuntu repository.
2. Clone the private repository onto the VM.
3. Copy `.env.example` to `.env`, set permissions to `600`, and enter unique production secrets.
4. From `ops/oci`, run `docker compose --env-file .env -f compose.yaml up -d --build`.
5. Confirm `https://api.sidcraft.in/health` returns `{"status":"ok","service":"pulse-api"}`.
6. Run `backup.sh`, upload the resulting encrypted/off-host backup to OCI Object Storage, and test a restore before launch.

Do not expose PostgreSQL, the container runtime, or the admin service directly to the internet. Do not commit `.env` or database backups.
