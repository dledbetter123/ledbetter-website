#!/bin/sh

# ledbetter-website/frontend/public/entrypoint.sh

sed -i "s|REACT_APP_BACKEND_URI_PLACEHOLDER|${REACT_APP_BACKEND_URI}|g" /usr/share/nginx/html/config.js
# Start Nginx
nginx -g 'daemon off;'
