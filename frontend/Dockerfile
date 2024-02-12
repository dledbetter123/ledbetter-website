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

# Copy the entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Make sure the script is executable
RUN chmod +x /entrypoint.sh

# Set the script to run when the container starts
ENTRYPOINT ["/entrypoint.sh"]

# port 80 to be accessible from the host
EXPOSE 80

# Start Nginx when the container has provisioned
CMD ["nginx", "-g", "daemon off;"]


# run command
# docker build -t ledbetter-website . && docker run -p 3000:3000 ledbetter-website

# stop command
# docker stop $(docker ps | grep "ledbetter-website" | awk '{print $1}')