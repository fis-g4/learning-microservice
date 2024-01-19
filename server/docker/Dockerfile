# Use an official Node.js runtime as the base image
FROM node:21.1-slim

# Set the working directory in the container
WORKDIR /usr/src/server

# Copy the rest of the application source code to the container
COPY ./server .
COPY ./GoogleCloudKey.json ..
COPY ./.env .

# Install Node.js dependencies
RUN npm install

RUN npm uninstall bcrypt

RUN npm install bcrypt

# Define a default environment variable if not provided during runtime
#RUN mv .env.dev .env

# Expose a port if your React app runs a server (e.g., for development purposes)
# EXPOSE 3000

# Build your React application (you can customize the build command)
RUN npm run build

# Specify the command to start your React app
CMD [ "npm", "start" ]
