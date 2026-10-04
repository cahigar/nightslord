# Imagen de producción: compila cliente + servidor y sirve todo desde Node en un solo puerto.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "dist/server.mjs"]
