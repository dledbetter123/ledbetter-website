#!/bin/bash

# Define your image repository prefix
prefix="288994457841.dkr.ecr.us-east-1.amazonaws.com/ledbetter-website"

# List all images, filter by prefix, sort them
docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$prefix" | sort | awk 'NR>1{print prev} {prev=$0}'

# This will list all images except the last one (assumed latest if sorted correctly)

# If you decide to delete the listed images, you can loop through them as before
images_to_delete=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep "^$prefix" | sort | awk 'NR>1{print prev} {prev=$0}')

# Delete the images
for img in $images_to_delete; do
    echo "Deleting $img..."
    docker rmi "$img"
done

echo "Cleanup complete."
