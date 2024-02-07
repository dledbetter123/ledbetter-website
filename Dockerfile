
FROM node:14

WORKDIR /usr/src/app

COPY package*.json ./

# RUN npm install
RUN npm ci

COPY . .

EXPOSE 3000

ENV NAME Portfolio

# runs npm start on launchtime
CMD ["npm", "start"]
