# Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY server ./server
EXPOSE 8080
CMD ["node", "server/src/index.js"]
