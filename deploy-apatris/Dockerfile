FROM node:20-slim
RUN npm install -g serve
WORKDIR /app
COPY . .
EXPOSE 3000
CMD ["serve", "-s", "public", "-l", "3000"]

