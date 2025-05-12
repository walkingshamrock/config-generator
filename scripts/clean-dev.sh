#!/bin/bash

echo "Cleaning up dev environment..."

# Remove Vite temp
rm -rf node_modules/.vite-temp

# Remove output folder
rm -rf output/

# Remove Python bytecode (if any)
find . -name "*.pyc" -delete
find . -type d -name "__pycache__" -exec rm -r {} +

echo "Done."
