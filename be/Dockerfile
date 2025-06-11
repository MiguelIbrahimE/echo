FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm i --prod
COPY tsconfig.json src ./ 
CMD ["node", "--env-file", ".env", "dist/server.js"]
