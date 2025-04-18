# be/Dockerfile
FROM node:18

WORKDIR /app

# ---------- dependencies ----------
COPY package*.json ./
RUN npm ci --omit=dev

# ---------- source ----------
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc               # build -> dist/

# ---------- runtime ----------
ENV NODE_ENV=production
EXPOSE 5001
CMD ["node", "dist/server.js"]
