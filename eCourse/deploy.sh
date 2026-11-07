#!/bin/bash
# eCourse Full Production Deployment Script

# Configuration
APP_DIR="/var/www/html/ecourse"
VENV_DIR="$APP_DIR/venv"
USER=$(whoami)
PROJECT_ROOT=$(pwd)

echo "🚀 Starting production deployment of eCourse to $APP_DIR..."

# 1. Create directory structure
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR
cd $APP_DIR

# 2. Copy project files to production directory
echo "📂 Copying files from $PROJECT_ROOT..."
# Copy everything except the local venv and node_modules
rsync -av --exclude 'bin/' --exclude 'lib/' --exclude 'include/' --exclude 'share/' --exclude 'pyvenv.cfg' --exclude 'node_modules/' --exclude '.git/' "$PROJECT_ROOT/" "$APP_DIR/"

# 3. Setup Virtual Environment
echo "📦 Setting up virtual environment..."
python3 -m venv $VENV_DIR
source $VENV_DIR/bin/activate

# 4. Install dependencies
echo "📥 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# 5. Build React Frontend
echo "⚛️ Building React frontend..."
cd $APP_DIR/react
npm install
npm run build
cd $APP_DIR

# 6. Setup Systemd Service
echo "⚙️ Configuring systemd service..."
sudo cp $APP_DIR/ecourse.service /etc/systemd/system/ecourse.service
sudo systemctl daemon-reload
sudo systemctl enable ecourse.service
sudo systemctl restart ecourse.service

# 7. Setup Nginx
echo "🌐 Configuring Nginx reverse proxy..."
sudo cp $APP_DIR/ecourse.nginx /etc/nginx/sites-available/ecourse
# Enable the site if not already enabled
if [ ! -f /etc/nginx/sites-enabled/ecourse ]; then
    sudo ln -s /etc/nginx/sites-available/ecourse /etc/nginx/sites-enabled/
fi
sudo nginx -t && sudo systemctl restart nginx

echo "✅ Deployment Complete!"
echo "-------------------------------------------------------"
echo "Backend API: http://$(hostname -I | awk '{print $1}'):8000"
echo "Web Frontend: http://$(hostname -I | awk '{print $1}')"
echo "-------------------------------------------------------"
