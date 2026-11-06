#!/bin/bash
# eCourse Deployment Script

# Configuration
APP_DIR="/var/www/html/ecourse"
VENV_DIR="$APP_DIR/venv"
USER=$(whoami)

echo "🚀 Starting deployment of eCourse to $APP_DIR..."

# 1. Create directory structure
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR
cd $APP_DIR

# 2. Copy files (Assuming you've transferred the project to the server)
# Note: This script assumes the project files are already in a temp folder or transferred via git/scp
# If not, you should git clone your repo here.

# 3. Setup Virtual Environment
echo "📦 Setting up virtual environment..."
python3 -m venv $VENV_DIR
source $VENV_DIR/bin/activate

# 4. Install dependencies
echo "📥 Installing dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

echo "✅ Deployment files ready."
echo "Next step: Set up the systemd service and Nginx."
