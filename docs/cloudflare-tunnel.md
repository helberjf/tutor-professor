# Cloudflare Tunnel Setup

This document guides you through setting up Cloudflare Tunnel to securely expose your local FastAPI backend to the internet. This is particularly useful when your frontend is deployed on a service like Vercel and needs to communicate with a backend running on your local machine.

## What is Cloudflare Tunnel?

Cloudflare Tunnel creates a secure, outbound-only connection from your services to Cloudflare's network. This means you don't need to open any inbound ports on your firewall, making your local services accessible without exposing them directly to the public internet.

## Prerequisites

*   A Cloudflare account.
*   A domain added to your Cloudflare account.
*   `cloudflared` CLI installed on your local machine. Follow the official Cloudflare documentation for installation: [Install cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/)

## Step-by-Step Setup

### 1. Authenticate `cloudflared`

Open your terminal and authenticate `cloudflared` with your Cloudflare account:

```bash
cloudflared tunnel login
```

This command will open a browser window, ask you to log in to Cloudflare, and select your domain. After successful authentication, `cloudflared` will save a certificate file to your system.

### 2. Create a Tunnel

Create a new tunnel. Replace `english-kids-tutor-tunnel` with a name of your choice:

```bash
cloudflared tunnel create english-kids-tutor-tunnel
```

This command will output a Tunnel ID and create a credentials file (e.g., `~/.cloudflared/<TUNNEL_ID>.json`). Keep this ID and file path handy.

### 3. Configure DNS Record

Cloudflare Tunnel needs a DNS record to route traffic to your tunnel. Create a CNAME record for your desired hostname (e.g., `api.yourdomain.com`) pointing to your tunnel ID.

```bash
cloudflared tunnel route dns english-kids-tutor-tunnel api.yourdomain.com
```

Replace `api.yourdomain.com` with your desired public hostname and `english-kids-tutor-tunnel` with your tunnel name.

### 4. Create `config.yml`

Create a `config.yml` file for `cloudflared` to define how traffic should be routed. You can use the example provided in `infra/cloudflare/config.yml.example`.

Navigate to the `infra/cloudflare` directory in your project:

```bash
cd english-kids-tutor/infra/cloudflare
cp config.yml.example config.yml
```

Now, edit `config.yml` and replace `<TUNNEL_ID>` with your actual Tunnel ID and `api.yourdomain.com` with your chosen hostname. Ensure the `credentials-file` path is correct for your system.

**Example `config.yml`:**

```yaml
tunnel: <YOUR_TUNNEL_ID> # e.g., 1a2b3c4d-5e6f-7g8h-9i0j-1k2l3m4n5o6p
credentials-file: /home/youruser/.cloudflared/<YOUR_TUNNEL_ID>.json # Adjust path as needed

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:8001 # Your local FastAPI backend port
  # - hostname: web.yourdomain.com # Optional: if you want to expose local frontend
  #   service: http://localhost:3000
  - service: http_status:404
```

**Explanation:**

*   `tunnel`: Your unique Tunnel ID.
*   `credentials-file`: The path to the JSON credentials file generated during `cloudflared tunnel create`.
*   `ingress`: A list of rules defining how incoming requests are handled.
    *   The first rule maps `api.yourdomain.com` to your local FastAPI backend running on `http://localhost:8001`.
    *   The `http_status:404` service acts as a fallback for any unmatched requests.

### 5. Run the Tunnel

Once your `config.yml` is set up, you can run the tunnel. From the directory where your `config.yml` is located (e.g., `english-kids-tutor/infra/cloudflare`):

```bash
cloudflared tunnel run --config config.yml <YOUR_TUNNEL_NAME>
```

Replace `<YOUR_TUNNEL_NAME>` with the name you chose (e.g., `english-kids-tutor-tunnel`).

Your local backend should now be accessible via `https://api.yourdomain.com`.

### 6. Configure Frontend Environment Variable

When deploying your frontend (e.g., to Vercel), ensure the `NEXT_PUBLIC_API_BASE_URL` environment variable is set to your public Cloudflare Tunnel URL:

```
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

This allows your deployed frontend to correctly communicate with your local backend through the Cloudflare Tunnel.

## Running Cloudflare Tunnel with Docker (Optional)

You can also run `cloudflared` as a Docker container. Uncomment the `cloudflared` service in your `docker-compose.yml` and configure it:

```yaml
  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run --token ${CLOUDFLARE_TUNNEL_TOKEN}
    environment:
      - CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN} # You need to create a Tunnel Token
    networks:
      - kids-tutor-net
```

**Note:** When running `cloudflared` in Docker, you'll typically use a Tunnel Token instead of a credentials file. You can create a Tunnel Token from your Cloudflare Zero Trust dashboard.

## Troubleshooting

*   **Check `cloudflared` logs**: If you encounter issues, check the output of the `cloudflared tunnel run` command for error messages.
*   **Verify DNS**: Ensure your CNAME record is correctly configured in Cloudflare DNS.
*   **Firewall**: Make sure your local firewall isn't blocking outbound connections from `cloudflared`.
*   **Backend running**: Confirm that your FastAPI backend is running and accessible on `http://localhost:8001`.
