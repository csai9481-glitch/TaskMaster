# TaskMaster - Collaborative Task Tracking System

## About the Project

TaskMaster is a simple task management system that helps people work together in teams. Users can create teams, manage tasks, add comments, and share files related to their tasks.

I built this project using Node.js, Express, PostgreSQL, and Prisma.

## Features

- Register and log in
- View and update user profiles
- Create and join teams
- Create, view, update, and delete tasks
- Add and view task comments
- Upload and download task files
- Protect routes using JWT authentication
- Store data in PostgreSQL
- Test the API using Jest

## Technologies Used

- Node.js
- Express.js
- PostgreSQL
- Prisma ORM
- JWT and bcrypt
- Multer
- Jest and Supertest

## Requirements

Install Node.js, npm, and PostgreSQL before running the project. Docker can also be used to run PostgreSQL.

## Installation

1. Clone the project repository.
2. Open the project folder in your terminal.
3. Install the required packages:

   ```bash
   npm install
   ```

4. Create a `.env` file using `.env.example` as a guide.
5. Add your database connection URL and a secure JWT secret to `.env`.
6. Generate the Prisma client:

   ```bash
   npx prisma generate
   ```

7. For a new database, apply the migrations:

   ```bash
   npx prisma migrate deploy
   ```

For an existing database, check its migration status before applying changes. Do not reset a database that contains important data.

## Running the Project

Start the project in development mode:

```bash
npm run dev
```

Or start it normally:

```bash
npm start
```

The API runs at:

- API: http://localhost:3000/
- Health check: http://localhost:3000/health

## Running Tests

Run the automated tests using:

```bash
npm test
```

## File Attachments

Users can upload files to tasks, view their attachments, and download them. The upload limit is 5 MB, and only supported file types are accepted.

## Database

PostgreSQL stores the users, teams, tasks, comments, and attachment details. Prisma manages the database schema and migrations.

## Important Note

Do not upload your `.env` file, passwords, or private information to GitHub. Uploaded files are kept out of Git.

## Conclusion

TaskMaster helps teams organize their work, track tasks, discuss work through comments, and share related files in one place.