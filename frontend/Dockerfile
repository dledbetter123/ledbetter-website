# ledbetter-website/frontend/Dockerfile

# Build stage
FROM node:18 as build-stage

# Define build arguments
ARG REACT_APP_BACKEND_URI

# Set environment variable based on build argument
ENV REACT_APP_BACKEND_URI=${REACT_APP_BACKEND_URI}

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

# port 80 to be accessible from the host
EXPOSE 80

# Start Nginx when the container has provisioned
CMD ["nginx", "-g", "daemon off;"]


# run command
# docker build -t ledbetter-website . && docker run -p 3000:3000 ledbetter-website

# stop command
# docker stop $(docker ps | grep "ledbetter-website" | awk '{print $1}')