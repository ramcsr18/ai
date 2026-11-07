#!/bin/bash

# eVote Raspberry Pi Deployment Script (Nginx Proxy Version)
# Use this script when an Nginx server is already running on port 80.

set -e

echo "🚀 Starting eVote deployment on Raspberry Pi with Nginx Proxy..."

# 1. Update system
echo "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# 2. Install Docker
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -sSL https://get.docker.com | sh
    sudo usermod -aG docker $USER
    echo "Docker installed. You may need to log out and back in for group changes to take effect."
else
    echo "Docker is already installed."
fi

# 3. Install Docker Compose (if not present)
if ! docker compose version &> /dev/null; then
    echo "Installing Docker Compose..."
    sudo apt-get install -y docker-compose-plugin
else
    echo "Docker Compose is already installed."
fi

# 4. Environment Configuration
if [ ! -f .env ]; then
    echo "⚠️ .env file not found. Creating a template from backend/.env.example..."
    if [ -f backend/.env.example ]; then
        cp backend/.env.example .env
        echo "✅ .env created. PLEASE EDIT .env with your actual credentials before running docker-compose up."
    else
        echo "❌ backend/.env.example not found. Please create a .env file manually."
        exit 1
    fi
fi

# 5. Deploy using Docker Compose (Web now on port 8080)
echo "Deploying containers..."
sudo docker compose up -d --build

# 6. Configure Nginx Reverse Proxy
echo "Configuring Nginx reverse proxy..."
PI_IP=$(hostname -I | awk '{print $1}')
NGINX_CONF="/etc/nginx/sites-available/evote"

sudo bash -c "cat > $NGINX_CONF" <<EOF
server {
    listen 80;
    server_name $PI_IP;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

# Enable the config and remove default if it exists
sudo ln -sf $NGINX_CONF /etc/nginx/sites-enabled/
if [ -f /etc/nginx/sites-enabled/default ]; then
    echo "Removing default Nginx site to avoid conflict..."
    sudo rm /etc/nginx/sites-enabled/default
fi

# Test and reload Nginx
sudo nginx -t
sudo systemctl reload nginx

echo "-------------------------------------------------------"
echo "🎉 Deployment Complete!"
echo "Access the App via Nginx Proxy: http://$PI_IP"
echo "Backend API (Direct): http://$PI_IP:5000"
echo "Web Container (Direct): http://$PI_IP:8080"
echo "-------------------------------------------------------"
echo "🛡️  SECURITY WARNING: Your site is currently running on HTTP."
echo "To enable HTTPS (SSL), it is recommended to use Certbot (Let's Encrypt):"
echo "1. Install Certbot: sudo apt-get install certbot python3-certbot-nginx"
echo "2. Run Certbot: sudo certbot --nginx -d your-domain.com"
echo "-------------------------------------------------------"
echo "Check logs with: sudo docker compose logs -f"
