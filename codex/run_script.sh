#!/bin/bash

# Install dependencies
echo "--- Installing requirements from requirements.txt ---"
pip install -r requirements.txt

# Check if pip installation was successful
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install Python dependencies. Please check requirements.txt or internet connection."
    exit 1
fi

echo "--- Dependencies installed successfully. Running main application ---"
python src/main.py