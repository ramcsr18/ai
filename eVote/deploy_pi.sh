#!/bin/bash

# eVote Raspberry Pi Deployment Script
# Run this script on your Raspberry Pi to set up and deploy the application.

set -e

echo "🚀 Starting eVote deployment on Raspberry Pi..."

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

# 5. Deploy using Docker Compose
echo "Deploying containers..."
sudo docker compose up -d --build

echo "-------------------------------------------------------"
echo "🎉 Deployment Complete!"
echo "Web Dashboard: http://$(hostname -I | awk '{print $1}')"
echo "Backend API: http://$(hostname -I | awk '{print $1}'):5000"
echo "-------------------------------------------------------"
echo "Check logs with: sudo docker compose logs -f"
