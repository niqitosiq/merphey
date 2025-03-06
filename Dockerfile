FROM node
WORKDIR /usr/app
COPY . .
RUN npm install
