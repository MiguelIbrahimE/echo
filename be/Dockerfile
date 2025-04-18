# be/Dockerfile
FROM node:22.13.1

WORKDIR /app

# copy your Node packages
COPY package*.json ./
RUN npm install

# copy the rest of backend source
COPY . .
RUN npx tsc

EXPOSE 5001
CMD ["node", "dist/server.js"]
