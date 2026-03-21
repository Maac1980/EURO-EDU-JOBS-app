FROM node:22-alpine
RUN npm install -g pnpm
WORKDIR /app
COPY . .
RUN pnpm install --filter ./artifacts/api-server... --no-frozen-lockfile
RUN pnpm run build
CMD ["node", "dist/index.cjs"]
