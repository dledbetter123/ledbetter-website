# ledbetter-website/frontend/Dockerfile

# Build stage
FROM node:18 as build-stage

WORKDIR /usr/src/app

COPY package*.json ./

# Install dependencies
RUN npm ci --verbose

COPY . .

# Build the static files
RUN npm run build

# Production stage
FROM nginx:stable-alpine as production-stage

# Copy the build from the previous stage
COPY --from=build-stage /usr/src/app/build /usr/share/nginx/html

# Copy the entrypoint script and make it executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Specify the entrypoint script
ENTRYPOINT ["/entrypoint.sh"]

# port 80 to be accessible from the host
EXPOSE 80

# Start Nginx when the container has provisioned
CMD ["nginx", "-g", "daemon off;"]
