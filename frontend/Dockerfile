
FROM node:18

WORKDIR /usr/src/app

COPY package*.json ./

# RUN npm install
RUN npm ci --verbose

COPY . .

EXPOSE 3000

ENV NAME Portfolio

# runs npm start on launchtime
CMD ["npm", "start"]


# run command
# docker build -t ledbetter-website . && docker run -p 3000:3000 ledbetter-website

# stop command
# docker stop $(docker ps | grep "ledbetter-website" | awk '{print $1}')