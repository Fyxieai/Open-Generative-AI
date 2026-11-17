FROM node:22-alpine AS build
WORKDIR /app
COPY free-studio/package.json free-studio/package-lock.json ./
RUN npm ci --ignore-scripts
COPY free-studio/vite.config.mjs free-studio/index.html ./
COPY free-studio/src ./src
COPY free-studio/public ./public
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3210 STUDIO_DATA_DIR=/data
WORKDIR /app
RUN mkdir /data && chown node:node /data
COPY --chown=node:node free-studio/server ./server
COPY --chown=node:node --from=build /app/dist ./dist
USER node
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3210/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.mjs"]
