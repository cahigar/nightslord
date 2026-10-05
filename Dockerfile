# Imagen de producción: compila cliente + servidor y sirve todo desde Node.
# VITE_SHARDS (opcional, p. ej. "A,B") se fija al compilar el cliente: lista de procesos de juego detrás del proxy.
FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_SHARDS=""
ENV VITE_SHARDS=$VITE_SHARDS
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 NODE_NO_WARNINGS=1
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.mjs"]
