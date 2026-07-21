FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci
FROM deps AS build
COPY tsconfig.json eslint.config.js .prettierrc ./
COPY src ./src
RUN npm run build
FROM node:22-bookworm-slim AS prod
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY firestore.rules firebase.json ./
USER node
EXPOSE 8080
CMD ["node","dist/server.js"]
