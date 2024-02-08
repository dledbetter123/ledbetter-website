
FROM node:18

WORKDIR /usr/src/app
RUN npm install -g npm@latest
RUN npm install --save-dev @babel/plugin-proposal-private-property-in-object
RUN npm install react-router-dom

COPY package*.json ./

# RUN npm install
RUN npm ci --verbose

COPY . .

EXPOSE 3000

ENV NAME Portfolio

# runs npm start on launchtime
CMD ["npm", "start"]

# stop command
# docker stop $(docker ps | grep "ledbetter-website" | awk '{print $1}')