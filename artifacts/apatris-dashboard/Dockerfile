# Stage 1: Build
FROM node:22-alpine AS builder
RUN npm install -g pnpm
WORKDIR /app

# Copy entire workspace to resolve cross-package links
COPY . .

# Install dependencies and build the dashboard + its dependency chain
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/apatris-dashboard... build

# Stage 2: Production Runtime (Nginx)
FROM nginx:stable-alpine
# Copy the built assets from the builder stage
COPY --from=builder /app/artifacts/apatris-dashboard/dist /usr/share/nginx/html

# Technical Fix: Enable React Router support (prevents 404 on refresh)
RUN sed -i '10i \    location / { try_files $uri $uri/ /index.html; }' /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
