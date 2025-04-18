# ----------  build  ----------
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ----------  nginx ----------
FROM nginx:alpine AS prod
COPY --from=builder /app/dist /usr/share/nginx/html
# tiny gzip + caching tweaks
RUN printf 'gzip on;\ngzip_types text/css application/javascript;\n' \
    > /etc/nginx/conf.d/gzip.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
