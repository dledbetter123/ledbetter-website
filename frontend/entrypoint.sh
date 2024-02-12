#!/bin/sh

# Example of dynamically setting an environment variable in a config file
echo "window.BACKEND_URI = '${BACKEND_URI}';" > /usr/share/nginx/html/config.js

# Execute the CMD from the Dockerfile, e.g., starting Nginx
exec "$@"
